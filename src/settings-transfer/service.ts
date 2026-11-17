import {
  SettingsTransferError,
  type AdapterRestorePlan,
  type SettingsAdapter,
  type SettingsCaptureContext,
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

export interface SettingsTransferPlan {
  readonly plans: readonly AdapterRestorePlan[];
  readonly issues: readonly SettingsIssue[];
}
export const settingsChangeID = (adapterID: string, key: string): string => `${adapterID}:${key}`;

/** Explicit operations share one admission slot because preferences belong to the application profile. */
export class SettingsTransferService {
  readonly #adapters: ReadonlyMap<string, SettingsAdapter>;
  readonly #versions: () => { readonly neo: string; readonly zotero: string };
  #busy = false;
  constructor(
    adapters: readonly SettingsAdapter[],
    versions: () => { readonly neo: string; readonly zotero: string },
  ) {
    const registry = new Map<string, SettingsAdapter>();
    for (const adapter of adapters) {
      if (registry.has(adapter.id)) throw new Error('Duplicate settings adapter');
      registry.set(adapter.id, adapter);
    }
    this.#adapters = registry;
    this.#versions = versions;
  }
  get adapters(): readonly { readonly id: string; readonly label: string }[] {
    return [...this.#adapters.values()].map(({ id, label }) => ({ id, label }));
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
      throw new SettingsTransferError('busy', 'Another settings operation is still running');
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
      const sections: SettingsSection[] = [],
        issues: SettingsIssue[] = [];
      for (const id of adapterIDs) {
        const adapter = this.#adapters.get(id);
        if (!adapter)
          throw new SettingsTransferError(
            'unsupported-adapter',
            'A selected settings adapter is not available',
          );
        assertSettingsCurrent(context);
        const captured = await adapter.capture(context);
        assertSettingsCurrent(context);
        if (captured.section.adapterID !== id)
          throw new SettingsTransferError(
            'invalid-adapter',
            'Settings adapter returned a section owned by another adapter',
          );
        sections.push(captured.section);
        issues.push(...captured.issues);
      }
      if (!sections.length)
        throw new SettingsTransferError('empty-selection', 'Choose at least one settings adapter');
      return { document: this.#document(sections), issues };
    });
  }
  plan(document: SettingsDocument, context: SettingsPlanContext): Promise<SettingsTransferPlan> {
    return this.#exclusive(context, async () => {
      validateSettingsDocument(document);
      const plans: AdapterRestorePlan[] = [],
        issues: SettingsIssue[] = [];
      for (const section of document.sections) {
        assertSettingsCurrent(context);
        const adapter = this.#adapters.get(section.adapterID);
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
          throw new SettingsTransferError(
            'invalid-adapter',
            'Settings adapter returned foreign changes',
          );
        plans.push(plan);
        issues.push(...plan.issues);
      }
      return { plans, issues };
    });
  }
  /** Backup publication must succeed before admitting any configuration mutation. */
  apply(
    transfer: SettingsTransferPlan,
    selected: ReadonlySet<string>,
    context: SettingsCryptoContext & SettingsPlanContext,
    writeBackup: (backup: SettingsDocument) => Promise<string>,
  ): Promise<SettingsRestoreReceipt> {
    return this.#exclusive(context, async () => {
      const groups = transfer.plans
        .map((plan) => ({
          plan,
          changes: plan.changes
            .filter((change) => selected.has(settingsChangeID(plan.adapterID, change.key)))
            .map((change) => ({ ...change, selected: true })),
        }))
        .filter((group) => group.changes.length);
      if (!groups.length)
        throw new SettingsTransferError(
          'empty-selection',
          'Choose at least one setting to restore',
        );
      if (groups.some(({ changes }) => changes.some((change) => change.blocked)))
        throw new SettingsTransferError(
          'blocked-setting',
          'A selected setting needs mapping or manual attention before it can be restored',
        );
      // Re-plan the selected target values to reject stale review baselines before making a backup.
      for (const { plan, changes } of groups) {
        const adapter = this.#adapters.get(plan.adapterID);
        if (!adapter)
          throw new SettingsTransferError(
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
            throw new SettingsTransferError(
              'stale-plan',
              'Settings changed after review; inspect the file again before restoring',
            );
        }
      }
      const backup = this.#document(
        groups.map(({ plan, changes }) => ({
          adapterID: plan.adapterID,
          schemaVersion: this.#adapters.get(plan.adapterID)!.schemaVersion,
          sourceVersion: plan.sourceVersion,
          entries: changes.map(({ key, before }) => ({ key, state: before })),
        })),
      );
      const backupPath = await writeBackup(backup);
      if (!backupPath)
        throw new SettingsTransferError(
          'backup-unavailable',
          'The encrypted backup was not saved; no settings were admitted',
        );
      assertSettingsCurrent(context);
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
          const result = await this.#adapters.get(plan.adapterID)!.apply(changes, context);
          const allowed = new Set(changes.map(({ key }) => key));
          const acknowledged = new Set<string>();
          for (const receipt of result) {
            if (
              receipt.adapterID !== plan.adapterID ||
              !allowed.has(receipt.key) ||
              acknowledged.has(receipt.key)
            )
              throw new SettingsTransferError(
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
        backupPath,
        cancelled:
          context.signal.aborted ||
          !context.isCurrent() ||
          entries.some((entry) => entry.status === 'cancelled'),
      };
    });
  }
}
