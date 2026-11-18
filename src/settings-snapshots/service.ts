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
import { assertSettingsCurrent, sameSettingState, validateSettingsDocument } from './document';

export interface SettingsSnapshotPlan {
  readonly plans: readonly AdapterRestorePlan[];
  readonly issues: readonly SettingsIssue[];
}
export const settingsChangeID = (adapterID: string, key: string): string => `${adapterID}:${key}`;

/** Explicit operations share one admission slot because preferences belong to the application profile. */
export class SettingsSnapshotService {
  readonly #adapters: () => readonly SettingsAdapter[];
  readonly #issuedPlans = new WeakMap<
    SettingsSnapshotPlan,
    {
      readonly registry: ReadonlyMap<string, SettingsAdapter>;
      readonly container: SettingsContainer;
    }
  >();
  readonly #versions: () => { readonly neo: string; readonly zotero: string };
  #busy = false;
  constructor(
    adapters: readonly SettingsAdapter[] | (() => readonly SettingsAdapter[]),
    versions: () => { readonly neo: string; readonly zotero: string },
  ) {
    this.#adapters = typeof adapters === 'function' ? adapters : () => adapters;
    this.#versions = versions;
  }
  #registry(): ReadonlyMap<string, SettingsAdapter> {
    const registry = new Map<string, SettingsAdapter>();
    for (const adapter of this.#adapters()) {
      if (registry.has(adapter.id)) throw new Error('Duplicate settings adapter');
      registry.set(adapter.id, adapter);
    }
    return registry;
  }
  get adapters(): readonly { readonly id: string; readonly label: string }[] {
    return [...this.#registry().values()].map(({ id, label }) => ({ id, label }));
  }
  #document(sections: readonly SettingsSection[]): SettingsDocument {
    const version = this.#versions();
    const document: SettingsDocument = {
      format: 'zotero-neo-settings',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      producer: { name: 'Zotero Neo', version: version.neo },
      zoteroVersion: version.zotero,
      sections,
    };
    validateSettingsDocument(document);
    return document;
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
      for (const id of adapterIDs) {
        const adapter = registry.get(id);
        if (!adapter)
          throw new SettingsSnapshotError(
            'unsupported-adapter',
            'A selected settings adapter is not available',
          );
        assertSettingsCurrent(context);
        const captured = await adapter.capture(context);
        assertSettingsCurrent(context);
        if (captured.section.adapterID !== id)
          throw new SettingsSnapshotError(
            'invalid-adapter',
            'Settings adapter returned a section owned by another adapter',
          );
        sections.push(captured.section);
        issues.push(...captured.issues);
      }
      if (!sections.length)
        throw new SettingsSnapshotError('empty-selection', 'Choose at least one settings adapter');
      return { document: this.#document(sections), issues };
    });
  }
  plan(document: SettingsDocument, context: SettingsPlanContext): Promise<SettingsSnapshotPlan> {
    return this.#exclusive(context, async () => {
      validateSettingsDocument(document);
      const registry = this.#registry();
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
      }
      const transfer = { plans, issues };
      this.#issuedPlans.set(transfer, { registry, container: context.container ?? 'age' });
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
      const registry = this.#registry();
      if (
        transfer.plans.some(
          (plan) => registry.get(plan.adapterID) !== issued.registry.get(plan.adapterID),
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
      for (const { plan, changes } of groups) {
        const adapter = registry.get(plan.adapterID);
        if (!adapter)
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
            !sameSettingState(current.before, change.before) ||
            !sameSettingState(current.after, change.after)
          )
            throw new SettingsSnapshotError(
              'stale-plan',
              'Settings changed after review; inspect the file again before restoring',
            );
        }
      }
      await verifySource();
      assertSettingsCurrent(context);
      const currentRegistry = this.#registry();
      if (
        groups.some(
          ({ plan }) => currentRegistry.get(plan.adapterID) !== registry.get(plan.adapterID),
        )
      )
        throw new SettingsSnapshotError(
          'stale-plan',
          'A configuration template changed after review',
        );
      const entries: SettingsEntryReceipt[] = [];
      let stopped = false;
      for (const { plan, changes } of groups) {
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
            result.some((entry) => !['applied', 'unchanged'].includes(entry.status)) ||
            acknowledged.size !== changes.length;
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
          stopped = true;
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
