import {
  SettingsSnapshotError,
  type SettingsAdapter,
  type SettingsCaptureContext,
  type SettingsPlanContext,
  type SettingsOperationContext,
  type SettingsSection,
  type AdapterRestorePlan,
  type SettingsChange,
  type SettingsEntryReceipt,
  type SettingState,
  type SettingsIssue,
} from '../contracts';
import type { SnapshotPluginTemplate, SnapshotTemplateField } from '../ports';
import { assertSettingsCurrent, sameSettingState, validateSettingsSection } from '../document';
import type { SettingsTemplateHost } from '../../platform/settings-snapshot-templates';

function normalize(
  field: SnapshotTemplateField,
  state: SettingState,
  constrain = true,
): SettingState {
  if (state.kind === 'reset') return Object.freeze({ kind: 'reset' });
  const value = state.value;
  if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string')
    throw new SettingsSnapshotError(
      'invalid-field',
      'Preference value must be a boolean, integer or string',
    );
  if (
    typeof value !== field.type ||
    (typeof value === 'number' &&
      (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) ||
    (typeof value === 'string' && (value.length > 256 * 1024 || value.includes('\0'))) ||
    (constrain &&
      ((typeof value === 'number' &&
        ((field.minimum !== undefined && value < field.minimum) ||
          (field.maximum !== undefined && value > field.maximum))) ||
        (field.values !== undefined && !field.values.includes(value))))
  )
    throw new SettingsSnapshotError(
      'invalid-field',
      'Preference value does not match its locally reviewed type or control constraints',
    );
  return Object.freeze({ kind: 'set', value });
}
/** Each instance is bound to one immutable local review, never to imported authority. */
export class ReviewedPreferenceAdapter implements SettingsAdapter {
  readonly schemaVersion = 1;
  readonly id: string;
  readonly label: string;
  readonly sourceVersion: string;
  readonly #fields: ReadonlyMap<string, SnapshotTemplateField>;
  readonly #planned = new Map<string, SettingsChange>();
  constructor(
    template: SnapshotPluginTemplate,
    readonly host: SettingsTemplateHost,
    readonly recheck: (context: SettingsOperationContext) => Promise<void>,
    readonly current: () => boolean,
  ) {
    this.id = template.adapterID;
    this.label = template.label;
    this.sourceVersion = template.version;
    this.#fields = new Map(
      template.fields
        .filter((field) => field.supported && template.reviewedKeys.includes(field.key))
        .map((field) => [
          field.key,
          Object.freeze({
            ...field,
            ...(field.values ? { values: Object.freeze([...field.values]) } : {}),
          }),
        ]),
    );
  }
  #assert(context: SettingsOperationContext): void {
    assertSettingsCurrent(context);
    if (!this.current())
      throw new SettingsSnapshotError(
        'stale-template',
        'Plugin settings template requires fresh local review',
      );
  }
  #read(field: SnapshotTemplateField): SettingState {
    // Existing invalid overrides may still be replaced by a valid value or an explicit reset.
    return normalize(field, this.host.readPreference(field.key), false);
  }
  #issue(code: string): SettingsIssue {
    return {
      severity: 'warning',
      code,
      message: 'An unsupported or unreviewed preference was omitted',
      adapterID: this.id,
    };
  }
  async capture(context: SettingsCaptureContext) {
    this.#assert(context);
    await this.recheck(context);
    this.#assert(context);
    if (context.container === 'json' && context.includeSecrets)
      throw new SettingsSnapshotError(
        'plaintext-secrets',
        'Plain JSON cannot include secret fields',
      );
    const entries: SettingsSection['entries'][number][] = [],
      issues: SettingsIssue[] = [];
    for (const field of this.#fields.values()) {
      this.#assert(context);
      if (field.secret && (!context.includeSecrets || context.container === 'json')) continue;
      try {
        entries.push({ key: field.key, state: normalize(field, this.#read(field)) });
      } catch {
        issues.push(this.#issue('invalid-field'));
      }
    }
    return {
      section: { adapterID: this.id, schemaVersion: 1, sourceVersion: this.sourceVersion, entries },
      issues,
    };
  }
  async plan(section: SettingsSection, context: SettingsPlanContext): Promise<AdapterRestorePlan> {
    this.#assert(context);
    await this.recheck(context);
    this.#assert(context);
    validateSettingsSection(section);
    if (
      section.adapterID !== this.id ||
      section.schemaVersion !== 1 ||
      section.sourceVersion !== this.sourceVersion
    )
      throw new SettingsSnapshotError(
        'unsupported-version',
        'Plugin snapshot requires the exact locally reviewed plugin version',
      );
    this.#planned.clear();
    const changes: SettingsChange[] = [],
      issues: SettingsIssue[] = [];
    for (const entry of section.entries) {
      const field = this.#fields.get(entry.key);
      if (!field) {
        issues.push(this.#issue('unreviewed-field'));
        continue;
      }
      try {
        const before = this.#read(field),
          after = normalize(field, entry.state);
        const blocked =
          field.secret && context.container === 'json'
            ? 'Secret fields cannot be restored from plain JSON'
            : undefined;
        if (sameSettingState(before, after)) continue;
        const change: SettingsChange = Object.freeze({
          adapterID: this.id,
          key: field.key,
          label: field.label,
          category: this.label,
          secret: field.secret,
          before,
          after,
          selected: !blocked,
          requiresRestart: field.requiresRestart,
          ...(blocked ? { blocked } : {}),
        });
        changes.push(change);
        this.#planned.set(field.key, change);
      } catch {
        issues.push(this.#issue('invalid-field'));
      }
    }
    return { adapterID: this.id, sourceVersion: this.sourceVersion, changes, issues };
  }
  async apply(
    changes: readonly SettingsChange[],
    context: SettingsOperationContext,
  ): Promise<readonly SettingsEntryReceipt[]> {
    const receipts: SettingsEntryReceipt[] = [];
    const consumed = new Set<string>();
    let stopped = false,
      admitted = false;
    for (const requested of changes) {
      const plan = this.#planned.get(requested.key),
        field = this.#fields.get(requested.key);
      const receipt = (status: SettingsEntryReceipt['status'], message?: string): void => {
        receipts.push({
          adapterID: this.id,
          key: requested.key,
          status,
          ...(message ? { message } : {}),
          ...(status === 'applied' && field?.requiresRestart ? { requiresRestart: true } : {}),
        });
      };
      if (
        stopped ||
        !requested.selected ||
        !plan ||
        !field ||
        plan.blocked ||
        consumed.has(requested.key) ||
        requested.adapterID !== this.id ||
        !sameSettingState(requested.before, plan.before) ||
        !sameSettingState(requested.after, plan.after) ||
        (field.secret && context.container === 'json')
      ) {
        receipt('skipped', 'This entry was not admitted from the local preview');
        continue;
      }
      consumed.add(requested.key);
      try {
        this.#assert(context);
        if (!admitted) {
          await this.recheck(context);
          this.#assert(context);
          admitted = true;
        }
        // Remaining writes are synchronous; lifecycle/type/baseline checks still run at every mutation.
        const after = normalize(field, plan.after);
        const current = this.#read(field);
        if (sameSettingState(current, plan.after)) {
          receipt('unchanged');
          continue;
        }
        if (!sameSettingState(current, plan.before))
          throw new SettingsSnapshotError('conflict', 'Preference changed after preview');
        const outcome = this.host.writePreference(field.key, after, () => {
          this.#assert(context);
          normalize(field, after);
          if (
            this.host.preferenceType(field.key) !== field.type ||
            !sameSettingState(this.#read(field), plan.before)
          )
            throw new SettingsSnapshotError('conflict', 'Preference changed after preview');
        });
        if (outcome !== 'default' && !sameSettingState(this.#read(field), plan.after))
          throw new SettingsSnapshotError('write-failed', 'Preference write did not persist');
        receipt(outcome === 'default' && current.kind === 'reset' ? 'unchanged' : 'applied');
      } catch (error) {
        stopped = true;
        const code = error instanceof SettingsSnapshotError ? error.code : '';
        receipt(
          code === 'cancelled'
            ? 'cancelled'
            : code === 'conflict' || code === 'stale-template'
              ? 'conflict'
              : 'failed',
          code === 'cancelled'
            ? 'The settings operation was cancelled'
            : code === 'conflict' || code === 'stale-template'
              ? 'Target settings or the plugin template changed after preview'
              : 'The preference could not be restored',
        );
      }
    }
    return receipts;
  }
}
