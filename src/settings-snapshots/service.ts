import {
  SettingsSnapshotError,
  type AdapterRestorePlan,
  type SettingsAdapter,
  type SettingsCaptureContext,
  type SettingsContainer,
  type SettingsCryptoContext,
  type SettingsDocument,
  type SettingsEntryReceipt,
  type SettingsIssue,
  type SettingsOperationContext,
  type SettingsPlanContext,
  type SettingsRestoreReceipt,
  type SettingsSection,
} from './contracts';
import type { WorkspaceExtensionManifest } from '../modules/extensions/workspace';
import type { SnapshotCaptureAdapter } from './ports';
import {
  assertSettingsCurrent,
  sameSettingState,
  validateSettingsDocument,
  validateSettingsSection,
} from './document';

export interface SettingsSnapshotPlan {
  readonly plans: readonly AdapterRestorePlan[];
  readonly issues: readonly SettingsIssue[];
}
export const settingsChangeID = (adapterID: string, key: string): string => `${adapterID}:${key}`;
const isPluginAdapter = (id: string): boolean => /^plugin-[a-f0-9]{64}$/u.test(id);

type CaptureExtensions = (
  context: SettingsOperationContext,
  sensitiveKeysByAddon: ReadonlyMap<string, readonly string[]>,
) => Promise<WorkspaceExtensionManifest>;

/** Explicit operations share one admission slot because preferences belong to the application profile. */
export class SettingsSnapshotService {
  readonly #adapters: () => readonly SettingsAdapter[];
  readonly #issuedPlans = new WeakMap<
    SettingsSnapshotPlan,
    {
      readonly registry: ReadonlyMap<string, SettingsAdapter>;
      readonly container: SettingsContainer;
      readonly workspace: boolean;
      readonly workspaceAdapters?: ReadonlyMap<string, SettingsAdapter>;
    }
  >();
  readonly #versions: () => { readonly neo: string; readonly zotero: string };
  #busy = false;
  constructor(
    adapters: readonly SettingsAdapter[] | (() => readonly SettingsAdapter[]),
    versions: () => { readonly neo: string; readonly zotero: string },
    private readonly captureExtensions?: CaptureExtensions,
  ) {
    this.#adapters = typeof adapters === 'function' ? adapters : () => adapters;
    this.#versions = versions;
  }
  #registry(
    workspaceAdapters?: ReadonlyMap<string, SettingsAdapter>,
  ): ReadonlyMap<string, SettingsAdapter> {
    const registry = new Map<string, SettingsAdapter>();
    for (const adapter of this.#adapters()) {
      if (registry.has(adapter.id)) throw new Error('Duplicate settings adapter');
      registry.set(adapter.id, adapter);
    }
    for (const [id, adapter] of workspaceAdapters ?? []) {
      if (id !== adapter.id || !isPluginAdapter(id))
        throw new SettingsSnapshotError('invalid-adapter', 'Invalid workspace settings adapter');
      registry.set(id, adapter);
    }
    return registry;
  }
  get adapters(): readonly { readonly id: string; readonly label: string }[] {
    return [...this.#registry().values()].map(({ id, label }) => ({ id, label }));
  }
  #document(
    sections: readonly SettingsSection[],
    extensions?: WorkspaceExtensionManifest,
  ): SettingsDocument {
    const version = this.#versions();
    const document: SettingsDocument = {
      format: 'zotero-neo-settings',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      producer: { name: 'Zotero Neo', version: version.neo },
      zoteroVersion: version.zotero,
      sections,
      ...(extensions ? { extensions } : {}),
    };
    return validateSettingsDocument(document);
  }
  async #exclusive<T>(context: SettingsOperationContext, run: () => Promise<T>): Promise<T> {
    assertSettingsCurrent(context);
    if (this.#busy)
      throw new SettingsSnapshotError('busy', 'Another settings operation is still running');
    this.#busy = true;
    try {
      return await run();
    } finally {
      this.#busy = false;
    }
  }
  capture(
    adapterIDs: ReadonlySet<string>,
    context: SettingsCaptureContext,
    options?: { readonly skipFailedAdapters?: true; readonly includeExtensions?: true },
  ): Promise<{ readonly document: SettingsDocument; readonly issues: readonly SettingsIssue[] }> {
    return this.#exclusive(context, async () => {
      if (context.container === 'json' && context.includeSecrets)
        throw new SettingsSnapshotError(
          'plaintext-secrets',
          'Credentials require an encrypted snapshot',
        );
      const registry = this.#registry();
      const sections: SettingsSection[] = [],
        issues: SettingsIssue[] = [];
      const includeExtensions = options?.includeExtensions && this.captureExtensions;
      const sensitiveKeys = new Map<string, readonly string[]>();
      for (const id of adapterIDs) {
        assertSettingsCurrent(context);
        try {
          const adapter = registry.get(id);
          if (!adapter)
            throw new SettingsSnapshotError(
              'unsupported-adapter',
              'A selected settings adapter is not available',
            );
          const captured = await adapter.capture(context);
          assertSettingsCurrent(context);
          if (captured.section.adapterID !== id)
            throw new SettingsSnapshotError(
              'invalid-adapter',
              'Settings adapter returned a section owned by another adapter',
            );
          if (options?.skipFailedAdapters) {
            validateSettingsSection(captured.section);
            if (captured.issues.some((issue) => issue.severity === 'error'))
              throw new SettingsSnapshotError('capture-failed', 'Adapter capture was incomplete');
          }
          issues.push(...captured.issues);
          sections.push(captured.section);
          if (includeExtensions) {
            const selection = (adapter as Partial<SnapshotCaptureAdapter>).snapshotSensitiveKeys;
            if (selection?.keys.length) sensitiveKeys.set(selection.addonId, selection.keys);
          }
        } catch (error) {
          assertSettingsCurrent(context);
          if (
            !options?.skipFailedAdapters ||
            (error instanceof SettingsSnapshotError &&
              ['cancelled', 'plaintext-secrets'].includes(error.code))
          )
            throw error;
          issues.push({
            severity: 'warning',
            code: 'adapter-skipped',
            adapterID: id,
            message: 'A selected plugin was unavailable or could not be captured safely.',
          });
        }
      }
      if (adapterIDs.size && !sections.length)
        throw new SettingsSnapshotError(
          'capture-failed',
          'None of the selected plugin settings could be captured safely.',
        );
      if (!sections.length && !includeExtensions)
        throw new SettingsSnapshotError('empty-selection', 'Choose at least one settings adapter');
      const extensions = await includeExtensions?.(context, sensitiveKeys);
      assertSettingsCurrent(context);
      return { document: this.#document(sections, extensions), issues };
    });
  }
  plan(
    unvalidated: SettingsDocument,
    context: SettingsPlanContext,
    workspaceAdapters?: ReadonlyMap<string, SettingsAdapter>,
  ): Promise<SettingsSnapshotPlan> {
    return this.#exclusive(context, async () => {
      const document = validateSettingsDocument(unvalidated);
      const workspace = document.extensions !== undefined;
      const registry = this.#registry(workspaceAdapters);
      const plans: AdapterRestorePlan[] = [],
        issues: SettingsIssue[] = [];
      for (const section of document.sections) {
        assertSettingsCurrent(context);
        const adapter = registry.get(section.adapterID);
        if (!adapter) {
          issues.push({
            severity: 'warning',
            code: 'unsupported-adapter',
            adapterID: section.adapterID,
            message: `Adapter ${section.adapterID} is not enabled; this section will not be applied`,
          });
          continue;
        }
        try {
          const plan = await adapter.plan(section, context);
          assertSettingsCurrent(context);
          if (
            plan.adapterID !== adapter.id ||
            plan.changes.some((change) => change.adapterID !== adapter.id)
          )
            throw new SettingsSnapshotError(
              'invalid-adapter',
              'Settings adapter returned foreign changes',
            );
          if (context.container === 'json' && plan.changes.some((change) => change.secret))
            throw new SettingsSnapshotError(
              'plaintext-secrets',
              'Credentials require an encrypted snapshot',
            );
          plans.push(plan);
          issues.push(...plan.issues);
        } catch (error) {
          assertSettingsCurrent(context);
          if (
            !workspace ||
            !isPluginAdapter(section.adapterID) ||
            (error instanceof SettingsSnapshotError && error.code === 'cancelled')
          )
            throw error;
          issues.push({
            severity: 'warning',
            code: 'adapter-skipped',
            adapterID: section.adapterID,
            message: 'A plugin settings section was unavailable or could not be reviewed safely.',
          });
        }
      }
      const transfer = { plans, issues };
      this.#issuedPlans.set(transfer, {
        registry,
        container: context.container ?? 'age',
        workspace,
        ...(workspaceAdapters ? { workspaceAdapters: new Map(workspaceAdapters) } : {}),
      });
      return transfer;
    });
  }
  /** Validate the reviewed settings and source before admitting any configuration mutation. */
  apply(
    transfer: SettingsSnapshotPlan,
    selected: ReadonlySet<string>,
    context: SettingsCryptoContext & SettingsPlanContext,
    verifySource: () => Promise<void>,
  ): Promise<SettingsRestoreReceipt> {
    return this.#exclusive(context, async () => {
      const issued = this.#issuedPlans.get(transfer);
      if (!issued)
        throw new SettingsSnapshotError('stale-plan', 'Preview this snapshot before restoring');
      const registry = this.#registry(issued.workspaceAdapters);
      if (
        transfer.plans.some(
          // Workspace plugin failures are reported against only that selected group.
          (plan) =>
            !(issued.workspace && isPluginAdapter(plan.adapterID)) &&
            registry.get(plan.adapterID) !== issued.registry.get(plan.adapterID),
        )
      )
        throw new SettingsSnapshotError(
          'stale-plan',
          'A configuration template changed after review',
        );
      const groups = transfer.plans
        .map((plan) => ({
          plan,
          changes: plan.changes
            .filter((change) => selected.has(settingsChangeID(plan.adapterID, change.key)))
            .map((change) => ({ ...change, selected: true })),
        }))
        .filter((group) => group.changes.length);
      if (!groups.length)
        throw new SettingsSnapshotError(
          'empty-selection',
          'Choose at least one setting to restore',
        );
      if (
        (issued.container === 'json' || context.container === 'json') &&
        groups.some(({ changes }) => changes.some((change) => change.secret))
      )
        throw new SettingsSnapshotError(
          'plaintext-secrets',
          'Credentials require an encrypted snapshot',
        );
      if (groups.some(({ changes }) => changes.some((change) => change.blocked)))
        throw new SettingsSnapshotError(
          'blocked-setting',
          'A selected setting needs mapping or manual attention before it can be restored',
        );
      // Reject stale review baselines, then verify the source as close to admission as possible.
      const entries: SettingsEntryReceipt[] = [];
      const admitted: typeof groups = [];
      for (const group of groups) {
        const { plan, changes } = group;
        try {
          const adapter = registry.get(plan.adapterID);
          if (!adapter || adapter !== issued.registry.get(plan.adapterID))
            throw new SettingsSnapshotError(
              'unsupported-adapter',
              'The reviewed settings adapter is no longer available',
            );
          const fresh = await adapter.plan(
            {
              adapterID: adapter.id,
              schemaVersion: adapter.schemaVersion,
              sourceVersion: adapter.sourceVersion,
              entries: changes.map(({ key, after }) => ({ key, state: after })),
            },
            context,
          );
          assertSettingsCurrent(context);
          for (const change of changes) {
            const current = fresh.changes.find((entry) => entry.key === change.key);
            if (
              !current ||
              current.blocked ||
              (issued.workspace && current.secret !== change.secret) ||
              !sameSettingState(current.before, change.before) ||
              !sameSettingState(current.after, change.after)
            )
              throw new SettingsSnapshotError(
                'stale-plan',
                'Settings changed after review; inspect the file again before restoring',
              );
          }
          admitted.push(group);
        } catch (error) {
          assertSettingsCurrent(context);
          if (
            !issued.workspace ||
            !isPluginAdapter(plan.adapterID) ||
            (error instanceof SettingsSnapshotError && error.code === 'cancelled')
          )
            throw error;
          for (const { key } of changes)
            entries.push({
              adapterID: plan.adapterID,
              key,
              status: 'conflict',
              message: 'Target settings or the plugin template changed after preview',
            });
        }
      }
      await verifySource();
      assertSettingsCurrent(context);
      const currentRegistry = this.#registry(issued.workspaceAdapters);
      if (
        admitted.some(
          ({ plan }) =>
            !(issued.workspace && isPluginAdapter(plan.adapterID)) &&
            currentRegistry.get(plan.adapterID) !== registry.get(plan.adapterID),
        )
      )
        throw new SettingsSnapshotError(
          'stale-plan',
          'A configuration template changed after review',
        );
      let stopped = false;
      for (const { plan, changes } of admitted) {
        const independent = issued.workspace && isPluginAdapter(plan.adapterID);
        if (stopped || context.signal.aborted || !context.isCurrent()) {
          entries.push(
            ...changes.map(({ key }) => ({
              adapterID: plan.adapterID,
              key,
              status:
                context.signal.aborted || !context.isCurrent()
                  ? ('cancelled' as const)
                  : ('skipped' as const),
              message: 'Not admitted after an earlier stop or failure',
            })),
          );
          continue;
        }
        try {
          if (currentRegistry.get(plan.adapterID) !== registry.get(plan.adapterID))
            throw new SettingsSnapshotError(
              'stale-plan',
              'A configuration template changed after review',
            );
          const result = await registry.get(plan.adapterID)!.apply(changes, context);
          const allowed = new Set(changes.map(({ key }) => key));
          const acknowledged = new Set<string>();
          for (const receipt of result) {
            if (
              receipt.adapterID !== plan.adapterID ||
              !allowed.has(receipt.key) ||
              acknowledged.has(receipt.key)
            )
              throw new SettingsSnapshotError(
                'invalid-adapter',
                'Adapter returned an invalid settings receipt',
              );
            acknowledged.add(receipt.key);
            entries.push(receipt);
          }
          for (const change of changes)
            if (!acknowledged.has(change.key))
              entries.push({
                adapterID: plan.adapterID,
                key: change.key,
                status: 'failed',
                message:
                  'No acknowledgement was returned; review the current value before retrying',
              });
          stopped =
            !independent &&
            (result.some((entry) => !['applied', 'unchanged'].includes(entry.status)) ||
              acknowledged.size !== changes.length);
        } catch {
          for (const change of changes)
            if (
              !entries.some(
                (entry) => entry.adapterID === plan.adapterID && entry.key === change.key,
              )
            )
              entries.push({
                adapterID: plan.adapterID,
                key: change.key,
                status: context.signal.aborted || !context.isCurrent() ? 'cancelled' : 'failed',
                message:
                  'The adapter did not acknowledge completion; review current values before retrying',
              });
          stopped = !independent;
        }
      }
      return {
        entries,
        cancelled:
          context.signal.aborted ||
          !context.isCurrent() ||
          entries.some((entry) => entry.status === 'cancelled'),
      };
    });
  }
}
