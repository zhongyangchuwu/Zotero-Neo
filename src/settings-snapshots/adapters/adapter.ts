import type {
  AdapterRestorePlan,
  SettingState,
  SettingsAdapter,
  SettingsCaptureContext,
  SettingsChange,
  SettingsEntry,
  SettingsEntryReceipt,
  SettingsIssue,
  SettingsOperationContext,
  SettingsPlanContext,
  SettingsSection,
} from '../contracts';
import { SettingsSnapshotError } from '../contracts';
import { assertSettingsCurrent, sameSettingState, validateSettingsSection } from '../document';
import { BINDING_SCHEMA_VERSION } from '../../core/preferences';
import { normalizeAIEndpoint } from '../../ai/configuration-policy';
import {
  matchesNativeLibrary,
  nativeCustomThemeExists,
  nativeLibraryKeys,
  nativeSettingsVersion,
  nativeShortcutKeys,
  nativeStyleKeys,
  nativeStyleAvailable,
  nativeStyleCollision,
  nativeStylePendingActivation,
  nativeConsumerStyleDependencies,
  ownedAIEndpoint,
  prepareNativeSettingsSnapshot,
  readNativeResource,
  readSettledTransferCredential,
  readTransferCredential,
  readTransferPreference,
  userPreferenceKeys,
  webDAVPasswordKey,
  writeNativeResource,
  writeTransferCredential,
  writeTransferPreference,
} from '../../platform/settings-snapshots-host';
import {
  migrateTransferBindings,
  normalizeTransferFieldState,
  nativeResourceField,
  safeEndpoint,
  type TransferField,
  validFieldState,
} from './fields';
import { NATIVE_PREFERENCE_FIELDS } from '../templates/zotero';
import { NEO_PREFERENCE_FIELDS } from '../templates/zotero-neo';

const RESET: SettingState = { kind: 'reset' };
const LIBRARY_NAMES = [
  'tagColors',
  'readerCustomThemes',
  'attachmentRenameTemplate',
  'autoRenameFiles',
  'autoRenameFilesFileTypes',
] as const;
function credentialState(value: string): SettingState {
  return value === '' ? RESET : { kind: 'set', value };
}
/** Adapter policies are derived locally, never accepted from the imported document or preview. */
export class BuiltinSettingsAdapter implements SettingsAdapter {
  readonly schemaVersion = 1;
  readonly #fields: Readonly<Record<string, TransferField>>;
  readonly #prefix: string;
  readonly #neoVersion: () => string;
  // Only plans issued by this adapter instance can admit writes. UI may copy changes to toggle selection.
  readonly #planned = new Map<string, SettingsChange>();
  constructor(
    readonly id: 'zotero' | 'zotero-neo',
    readonly label: string,
    neoVersion: () => string,
  ) {
    this.#neoVersion = neoVersion;
    this.#prefix = id === 'zotero' ? 'extensions.zotero.' : 'extensions.zotero-neo.';
    this.#fields = Object.fromEntries(
      (id === 'zotero' ? NATIVE_PREFERENCE_FIELDS : NEO_PREFERENCE_FIELDS).map((field) => [
        field.key,
        /^(?:httpServer\.|zeroconf\.|streaming\.|integration\.port$)/u.test(field.key)
          ? { ...field, restart: true, last: true }
          : field,
      ]),
    );
  }
  get sourceVersion(): string {
    return this.id === 'zotero' ? nativeSettingsVersion() : this.#neoVersion();
  }
  #field(key: string): TransferField | null {
    if (Object.hasOwn(this.#fields, key)) return this.#fields[key]!;
    if (this.id === 'zotero') {
      if (
        /^keys\.[A-Za-z][A-Za-z0-9]*$/u.test(key) &&
        nativeShortcutKeys().includes(this.#prefix + key)
      )
        return {
          key,
          label: `Native shortcut: ${key.slice(5)}`,
          type: 'string',
          category: 'Native shortcuts',
          restart: true,
        };
      return nativeResourceField(key);
    }
    if (key === 'secret:mineru' || key === 'secret:semantic-scholar')
      return {
        key,
        label: key === 'secret:mineru' ? 'MinerU token' : 'Semantic Scholar API key',
        category: 'API credentials',
        type: 'string',
        secret: true,
      };
    if (key.startsWith('secret:ai:') && safeEndpoint(key.slice(10)))
      return {
        key,
        label: 'AI endpoint API key',
        category: 'API credentials',
        type: 'string',
        secret: true,
      };
    return null;
  }
  #isPreference(key: string): boolean {
    return Object.hasOwn(this.#fields, key) || key.startsWith('keys.');
  }
  #readSync(key: string): SettingState {
    if (key === 'bindings' && this.id === 'zotero-neo') {
      const raw = readTransferPreference(this.#prefix + key);
      if (raw.kind === 'reset') return RESET;
      const schema = readTransferPreference(this.#prefix + 'bindings.schemaVersion');
      return {
        kind: 'set',
        value: { schemaVersion: schema.kind === 'set' ? schema.value : 0, overrides: raw.value },
      };
    }
    if (key.startsWith('secret:')) return credentialState(readTransferCredential(key));
    return readTransferPreference(key.startsWith('pref:') ? key.slice(5) : this.#prefix + key);
  }
  async #read(key: string): Promise<SettingState> {
    if (this.#isPreference(key)) return this.#readSync(key);
    if (key.startsWith('secret:')) return credentialState(await readSettledTransferCredential(key));
    const state = await readNativeResource(key);
    return key.startsWith('webdav:password:') && state.kind === 'set' && state.value === ''
      ? RESET
      : state;
  }
  #issue(code: string, message: string, key?: string): SettingsIssue {
    return { severity: 'warning', code, message, adapterID: this.id, ...(key ? { key } : {}) };
  }
  async capture(
    context: SettingsCaptureContext,
  ): Promise<{ section: SettingsSection; issues: readonly SettingsIssue[] }> {
    assertSettingsCurrent(context);
    if (this.id === 'zotero') await prepareNativeSettingsSnapshot(context);
    const issues: SettingsIssue[] = [],
      entries: SettingsEntry[] = [];
    const keys = userPreferenceKeys(this.#prefix).map((key) => key.slice(this.#prefix.length));
    const supported: string[] = [];
    let omitted = 0;
    for (const key of keys) {
      if (key === 'bindings.schemaVersion' && this.id === 'zotero-neo') continue;
      if (this.#field(key)) supported.push(key);
      else omitted++;
    }
    if (omitted)
      issues.push(
        this.#issue(
          'excluded-or-unknown',
          `${omitted} nonconfiguration, sensitive, runtime, or unknown preferences were excluded; this is not a complete profile backup`,
        ),
      );
    if (this.id === 'zotero') {
      for (const key of Object.keys(this.#fields))
        if (key.startsWith('pref:') && this.#readSync(key).kind === 'set') supported.push(key);
      supported.push('quickCopy:sites', 'locate:engines', ...nativeStyleKeys());
      if (context.includeLibrarySettings) {
        const libraries = nativeLibraryKeys();
        if (!libraries.length)
          issues.push(
            this.#issue(
              'library-identity',
              'Library settings require a known signed-in account identity',
            ),
          );
        for (const library of libraries)
          for (const name of LIBRARY_NAMES) supported.push(`library:${library.identity}:${name}`);
      }
      if (context.includeSecrets && webDAVPasswordKey() !== 'webdav:password:')
        supported.push(webDAVPasswordKey());
      issues.push(
        this.#issue(
          'native-exclusions',
          'Native account/session authorization, data-directory migration, attachment/library tree identities, translators, executable launchers, device Read Aloud voice inventories, and Locate icons are not automatically restored',
        ),
      );
      issues.push(
        this.#issue(
          'webdav-verification',
          'Imported WebDAV configuration always requires verification in Zotero; verified status is never copied',
        ),
      );
    } else {
      if (context.includeSecrets) {
        supported.push('secret:mineru', 'secret:semantic-scholar');
        const endpoint = ownedAIEndpoint();
        if (endpoint && safeEndpoint(endpoint)) supported.push(`secret:ai:${endpoint}`);
      }
      issues.push(
        this.#issue(
          'neo-exclusions',
          'Per-document marks, navigation history, tab groups, analysis/AI artifacts, caches, diagnostics, and third-party translation provider preferences/credentials are not settings transferred by Neo',
        ),
      );
    }
    for (const key of supported) {
      assertSettingsCurrent(context);
      const field = this.#field(key)!;
      try {
        let state = await this.#read(key);
        assertSettingsCurrent(context);
        if (state.kind === 'reset') continue;
        if (key === 'bindings' && this.id === 'zotero-neo')
          state = { kind: 'set', value: migrateTransferBindings(state.value) };
        state = normalizeTransferFieldState(field, state);
        if (!validFieldState(field, state)) {
          issues.push(
            this.#issue(
              'invalid-field',
              'An owned setting has an unsupported value and was not exported',
            ),
          );
          continue;
        }
        entries.push({ key, state });
        if (field.manual) issues.push(this.#issue('manual-required', field.manual, key));
      } catch (error) {
        assertSettingsCurrent(context);
        issues.push(
          this.#issue(
            error instanceof SettingsSnapshotError ? error.code : 'capture-failed',
            'An owned setting could not be read or validated',
          ),
        );
      }
    }
    return {
      section: {
        adapterID: this.id,
        schemaVersion: this.schemaVersion,
        sourceVersion: this.sourceVersion,
        entries,
      },
      issues,
    };
  }
  async plan(section: SettingsSection, context: SettingsPlanContext): Promise<AdapterRestorePlan> {
    assertSettingsCurrent(context);
    validateSettingsSection(section);
    if (section.adapterID !== this.id || section.schemaVersion !== this.schemaVersion)
      throw new SettingsSnapshotError(
        'unsupported-schema',
        'This settings adapter schema is not supported',
      );
    this.#planned.clear();
    if (this.id === 'zotero') await prepareNativeSettingsSnapshot(context);
    const changes: SettingsChange[] = [],
      issues: SettingsIssue[] = [];
    const entries: SettingsEntry[] = [];
    const duplicateKeys = new Set<string>();
    const keys = new Set<string>();
    for (const entry of section.entries) {
      try {
        const key = entry.key.startsWith('secret:ai:')
          ? `secret:ai:${normalizeAIEndpoint(entry.key.slice(10))}`
          : entry.key;
        if (keys.has(key)) duplicateKeys.add(key);
        keys.add(key);
        entries.push({ key, state: entry.state });
      } catch {
        issues.push(
          this.#issue('invalid-field', 'An entry has an unsupported credential identity'),
        );
      }
    }
    for (const entry of entries) {
      if (duplicateKeys.has(entry.key)) {
        issues.push(
          this.#issue('invalid-field', 'Duplicate canonical settings entries were rejected'),
        );
        continue;
      }
      assertSettingsCurrent(context);
      const field = this.#field(entry.key);
      if (!field) {
        issues.push(
          this.#issue('foreign-field', 'An entry is not owned by this adapter and was rejected'),
        );
        continue;
      }
      let after: SettingState;
      try {
        after = normalizeTransferFieldState(field, entry.state);
      } catch (error) {
        issues.push(
          this.#issue(
            error instanceof SettingsSnapshotError ? error.code : 'invalid-field',
            'An owned entry could not be normalized safely',
          ),
        );
        continue;
      }
      if (!validFieldState(field, after)) {
        issues.push(
          this.#issue(
            'invalid-field',
            'An owned entry has an unsupported value or schema and was rejected',
          ),
        );
        continue;
      }
      if (field.secret && after.kind === 'set' && typeof after.value === 'string') {
        const value = entry.key.startsWith('secret:') ? after.value.trim() : after.value;
        after = credentialState(value);
      }
      if (entry.key === 'quickCopy:sites' && after.kind === 'reset')
        after = { kind: 'set', value: [] };
      if (entry.key === 'bindings' && this.id === 'zotero-neo' && after.kind === 'set') {
        if (
          after.value !== null &&
          typeof after.value === 'object' &&
          'schemaVersion' in after.value &&
          after.value.schemaVersion !== BINDING_SCHEMA_VERSION
        )
          issues.push(
            this.#issue(
              'binding-migration',
              'Older binding overrides will be migrated by the canonical Neo migration; retired or unsupported bindings may be removed',
            ),
          );
        try {
          after = { kind: 'set', value: migrateTransferBindings(after.value) };
        } catch {
          issues.push(
            this.#issue('invalid-field', 'Binding overrides could not be migrated safely'),
          );
          continue;
        }
      }
      let blocked = field.manual;
      if (field.library && !matchesNativeLibrary(entry.key))
        blocked =
          'This library does not belong to the target account; no library identities are rewritten';
      if (entry.key.startsWith('csl:') && after.kind === 'reset')
        blocked = 'Remove citation styles explicitly in Zotero; transfer does not delete styles';
      if (
        entry.key.startsWith('csl:') &&
        after.kind === 'set' &&
        nativeStyleCollision(
          entry.key.slice(4),
          entries
            .filter(
              (candidate) => candidate.key.startsWith('csl:') && candidate.state.kind === 'set',
            )
            .map((candidate) => candidate.key.slice(4)),
        )
      )
        blocked = 'Renamed citation style collisions require manual review in Zotero';
      if (entry.key.startsWith('csl:') && after.kind === 'set') {
        const value = after.value;
        const source =
          value &&
          typeof value === 'object' &&
          'source' in value &&
          typeof value.source === 'string'
            ? value.source
            : '';
        if (
          source &&
          !nativeStyleAvailable(source) &&
          !entries.some(
            (candidate) => candidate.key === `csl:${source}` && candidate.state.kind === 'set',
          )
        )
          blocked = 'This citation style requires a missing parent style';
      }
      const consumerDependencies = nativeConsumerStyleDependencies(entry.key, after);
      if (
        consumerDependencies.some(
          (id) =>
            !nativeStyleAvailable(id) &&
            !entries.some(
              (candidate) => candidate.key === `csl:${id}` && candidate.state.kind === 'set',
            ),
        )
      )
        blocked =
          'This Quick Copy setting requires a missing citation style; select its CSL dependency';
      if (entry.key === 'locate:engines' && after.kind === 'reset')
        blocked =
          'Restore default Locate engines in native Zotero settings; reset may fetch native icons';
      let mapping: SettingsChange['mapping'];
      if (
        field.path &&
        after.kind === 'set' &&
        typeof after.value === 'string' &&
        after.value !== '' &&
        after.value !== 'system'
      ) {
        mapping = { kind: field.path, source: after.value };
        const path = context.paths?.[`${this.id}:${entry.key}`];
        if (path && !path.includes('\0')) after = { kind: 'set', value: path };
        else blocked = blocked || 'Choose a target-device path before importing this setting';
      }
      let before: SettingState;
      try {
        before = await this.#read(entry.key);
      } catch {
        before = RESET;
        blocked = blocked || 'The target setting cannot be read safely';
      }
      if (
        entry.key.startsWith('csl:') &&
        before.kind === 'set' &&
        after.kind === 'set' &&
        before.value !== null &&
        typeof before.value === 'object' &&
        'hidden' in before.value &&
        after.value !== null &&
        typeof after.value === 'object' &&
        'hidden' in after.value &&
        before.value.hidden !== after.value.hidden
      )
        blocked = 'Changing visibility of an installed CSL style requires manual review in Zotero';
      const customTheme =
        this.id === 'zotero' &&
        (entry.key === 'reader.lightTheme' || entry.key === 'reader.darkTheme') &&
        after.kind === 'set' &&
        typeof after.value === 'string' &&
        after.value.startsWith('custom')
          ? after.value
          : '';
      if (customTheme && !nativeCustomThemeExists(customTheme)) {
        const included = section.entries.some(
          (candidate) =>
            candidate.key.startsWith('library:user:') &&
            candidate.key.endsWith(':readerCustomThemes') &&
            matchesNativeLibrary(candidate.key) &&
            validFieldState(nativeResourceField(candidate.key)!, candidate.state) &&
            candidate.state.kind === 'set' &&
            Array.isArray(candidate.state.value) &&
            candidate.state.value.some(
              (theme) =>
                theme !== null &&
                typeof theme === 'object' &&
                'id' in theme &&
                theme.id === customTheme,
            ),
        );
        if (!included)
          blocked =
            'This custom theme is missing on the target; include its identity-bound optional library settings';
        else
          issues.push(
            this.#issue(
              'optional-theme-dependency',
              'Select the associated optional library themes before applying this custom theme preference',
              entry.key,
            ),
          );
      }
      assertSettingsCurrent(context);
      const unchanged = sameSettingState(before, after);
      const change: SettingsChange = {
        adapterID: this.id,
        key: entry.key,
        label: field.label,
        category: field.category,
        secret: !!field.secret,
        ...(field.presentation ? { presentation: field.presentation } : {}),
        before,
        after,
        selected:
          !blocked && !field.library && !customTheme && before.kind === 'reset' && !unchanged,
        requiresRestart:
          !!field.restart ||
          entry.key.startsWith('sync.storage.') ||
          consumerDependencies.length > 0,
        ...(blocked ? { blocked } : {}),
        ...(mapping ? { mapping } : {}),
      };
      changes.push(change);
      this.#planned.set(entry.key, change);
      if (blocked)
        issues.push(this.#issue('manual-required', blocked, field.secret ? undefined : entry.key));
    }
    return { adapterID: this.id, sourceVersion: this.sourceVersion, changes, issues };
  }
  async apply(
    changes: readonly SettingsChange[],
    context: SettingsOperationContext,
  ): Promise<readonly SettingsEntryReceipt[]> {
    const receipts: SettingsEntryReceipt[] = [];
    const last = (change: SettingsChange): number =>
      change.key.endsWith(':readerCustomThemes')
        ? -2
        : change.key.startsWith('csl:')
          ? -1
          : Number(
              this.#field(change.key)?.last ||
                change.key.startsWith('sync.storage.') ||
                (change.after.kind === 'set' && change.after.value === false),
            );
    const depths = new Map<string, number>();
    const depth = (key: string): number => {
      const chain: string[] = [],
        visited = new Set<string>();
      let cursor = key,
        base = 0;
      while (cursor.startsWith('csl:')) {
        const cached = depths.get(cursor);
        if (cached !== undefined) {
          base = cached;
          break;
        }
        if (visited.has(cursor)) {
          base = Number.MAX_SAFE_INTEGER;
          break;
        }
        visited.add(cursor);
        const state = this.#planned.get(cursor)?.after;
        if (
          !state ||
          state.kind !== 'set' ||
          state.value === null ||
          typeof state.value !== 'object' ||
          !('source' in state.value) ||
          typeof state.value.source !== 'string' ||
          !state.value.source
        )
          break;
        chain.push(cursor);
        cursor = `csl:${state.value.source}`;
      }
      for (let index = chain.length - 1; index >= 0; index--) depths.set(chain[index]!, ++base);
      return depths.get(key) || 0;
    };
    const ordered = [...changes].sort((a, b) => last(a) - last(b) || depth(a.key) - depth(b.key));
    const selectedStyleIDs = ordered
      .filter((candidate) => {
        const issued = this.#planned.get(candidate.key);
        return (
          candidate.selected &&
          candidate.key.startsWith('csl:') &&
          issued &&
          !issued.blocked &&
          sameSettingState(candidate.before, issued.before) &&
          sameSettingState(candidate.after, issued.after)
        );
      })
      .map((candidate) => candidate.key.slice(4));
    let stopped = false;
    for (const requested of ordered) {
      const plan = this.#planned.get(requested.key),
        field = this.#field(requested.key);
      const pendingActivation =
        !!plan &&
        ((plan.key.startsWith('csl:') && nativeStylePendingActivation(plan.key.slice(4))) ||
          nativeConsumerStyleDependencies(plan.key, plan.after).some((id) =>
            nativeStylePendingActivation(id),
          ));
      const receipt = (status: SettingsEntryReceipt['status'], message?: string): void => {
        receipts.push({
          adapterID: this.id,
          key: requested.key,
          status,
          ...(message ? { message } : {}),
          ...((status === 'applied' ||
            status === 'failed' ||
            (status === 'unchanged' && pendingActivation)) &&
          plan?.requiresRestart
            ? { requiresRestart: true }
            : {}),
        });
      };
      if (stopped) {
        receipt(
          context.signal.aborted || !context.isCurrent() ? 'cancelled' : 'skipped',
          'A previous entry stopped this adapter; remaining entries were not admitted',
        );
        continue;
      }
      if (
        !requested.selected ||
        !plan ||
        !field ||
        requested.adapterID !== this.id ||
        plan.blocked ||
        !sameSettingState(requested.after, plan.after) ||
        !sameSettingState(requested.before, plan.before)
      ) {
        receipt('skipped', 'This entry was not admitted from the preview');
        continue;
      }
      try {
        assertSettingsCurrent(context);
        const current = await this.#read(plan.key);
        assertSettingsCurrent(context);
        if (sameSettingState(current, plan.after)) {
          receipt('unchanged');
          continue;
        }
        if (!sameSettingState(current, plan.before)) {
          stopped = true;
          receipt('conflict', 'The target setting changed after preview');
          continue;
        }
        if (plan.key.startsWith('csl:') && plan.after.kind === 'set') {
          const value = plan.after.value;
          const source =
            value &&
            typeof value === 'object' &&
            'source' in value &&
            typeof value.source === 'string'
              ? value.source
              : '';
          if (nativeStyleCollision(plan.key.slice(4), selectedStyleIDs))
            throw new SettingsSnapshotError(
              'style-collision',
              'Renamed citation styles require manual review',
            );
          if (source && !nativeStyleAvailable(source))
            throw new SettingsSnapshotError(
              'missing-style',
              'A required parent citation style was not restored',
            );
        }
        if (
          nativeConsumerStyleDependencies(plan.key, plan.after).some(
            (id) => !nativeStyleAvailable(id),
          )
        )
          throw new SettingsSnapshotError(
            'missing-style',
            'A required citation style was not restored',
          );
        const admit = (): void => {
          assertSettingsCurrent(context);
          if (
            this.id === 'zotero' &&
            (plan.key === 'reader.lightTheme' || plan.key === 'reader.darkTheme') &&
            plan.after.kind === 'set' &&
            typeof plan.after.value === 'string' &&
            plan.after.value.startsWith('custom') &&
            !nativeCustomThemeExists(plan.after.value)
          )
            throw new SettingsSnapshotError(
              'missing-theme',
              'The selected custom theme has not been restored',
            );
          if (!sameSettingState(this.#readSync(plan.key), plan.before))
            throw new SettingsSnapshotError('conflict', 'The target setting changed after preview');
        };
        if (this.#isPreference(plan.key)) {
          if (plan.key === 'bindings' && this.id === 'zotero-neo') {
            admit();
            const value =
              plan.after.kind === 'set' ? (plan.after.value as { overrides: string }) : null;
            writeTransferPreference(
              this.#prefix + 'bindings',
              value ? { kind: 'set', value: value.overrides } : RESET,
              () => {},
            );
            writeTransferPreference(
              this.#prefix + 'bindings.schemaVersion',
              value ? { kind: 'set', value: BINDING_SCHEMA_VERSION } : RESET,
              () => {},
            );
          } else {
            const outcome = writeTransferPreference(
              plan.key.startsWith('pref:') ? plan.key.slice(5) : this.#prefix + plan.key,
              plan.after,
              admit,
            );
            if (outcome === 'default' && current.kind === 'reset') {
              receipt('unchanged');
              continue;
            }
          }
        } else if (plan.key.startsWith('secret:'))
          await writeTransferCredential(
            plan.key,
            plan.after.kind === 'reset' ? '' : String(plan.after.value),
            admit,
          );
        else await writeNativeResource(plan.key, plan.after, plan.before, context);
        receipt(
          'applied',
          plan.key.startsWith('csl:') ||
            nativeConsumerStyleDependencies(plan.key, plan.after).some((id) =>
              nativeStylePendingActivation(id),
            )
            ? 'Persisted selected settings; restart Zotero before using the affected citation styles or Quick Copy'
            : undefined,
        );
      } catch (error) {
        stopped = true;
        const code = error instanceof SettingsSnapshotError ? error.code : '';
        receipt(
          code === 'cancelled' ? 'cancelled' : code === 'conflict' ? 'conflict' : 'failed',
          code === 'cancelled'
            ? 'The settings operation was cancelled'
            : code === 'conflict'
              ? 'The target setting changed after preview'
              : 'The setting could not be fully restored; inspect the target before retrying',
        );
      }
    }
    return receipts;
  }
}
