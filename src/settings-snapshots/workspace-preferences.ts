import type { WorkspaceExtensionManifest } from '../modules/extensions/workspace';
import { settingsTemplateHost } from '../platform/settings-snapshot-templates';
import {
  SettingsSnapshotError,
  type SettingsAdapter,
  type SettingsChange,
  type SettingsCryptoContext,
  type SettingsDocument,
  type SettingsEntryReceipt,
  type SettingsOperationContext,
  type SettingsPlanContext,
  type SettingsRestoreReceipt,
  type SettingsSection,
} from './contracts';
import { assertSettingsCurrent, sameSettingState } from './document';
import type { SettingsTemplateCatalogPort, SnapshotPluginTemplate } from './ports';
import {
  settingsChangeID,
  type SettingsSnapshotPlan,
  type SettingsSnapshotService,
} from './service';
import { isCredentialPreferenceKey, pluginPreferenceKeySafety } from './templates/scanner';

export interface DeferredWorkspaceSetting {
  readonly id: string;
  readonly addonId: string;
  readonly adapterID: string;
  readonly key: string;
  readonly label: string;
  readonly secret: boolean;
}

function extensionsByAdapter(manifest: WorkspaceExtensionManifest) {
  return new Map(
    manifest.addons.map((entry) => [`plugin-${settingsTemplateHost.digest(entry.addonId)}`, entry]),
  );
}

function assertNotCancelled(context: SettingsOperationContext, error: unknown): void {
  assertSettingsCurrent(context);
  if (error instanceof SettingsSnapshotError && error.code === 'cancelled') throw error;
}

/** Keep normal review baselines; disclose only field names for settings awaiting local admission. */
export async function prepareWorkspacePreferences(
  document: SettingsDocument,
  catalog: SettingsTemplateCatalogPort | undefined,
  context: SettingsOperationContext,
): Promise<{ document: SettingsDocument; deferred: readonly DeferredWorkspaceSetting[] }> {
  if (
    !document.extensions ||
    !catalog ||
    !document.sections.some(({ adapterID }) => adapterID.startsWith('plugin-'))
  )
    return { document, deferred: [] };
  const addons = extensionsByAdapter(document.extensions);
  const sections: SettingsSection[] = [];
  const deferred: DeferredWorkspaceSetting[] = [];
  let local: readonly SnapshotPluginTemplate[] | undefined;
  if (document.sections.some(({ adapterID }) => addons.has(adapterID))) {
    try {
      local = await catalog.list(context);
      assertSettingsCurrent(context);
    } catch (error) {
      assertNotCancelled(context, error);
    }
  }
  const templates = new Map(local?.map((template) => [template.pluginID, template]));
  for (const section of document.sections) {
    const { adapterID, schemaVersion, sourceVersion } = section;
    if (!adapterID.startsWith('plugin-')) {
      sections.push(section);
      continue;
    }
    const addon = addons.get(adapterID);
    if (!local || !addon || schemaVersion !== 1 || sourceVersion !== addon.version) continue;
    const installed = templates.get(addon.addonId);
    const template =
      installed?.status !== 'unavailable' && installed?.version === sourceVersion
        ? installed
        : undefined;
    const fields = new Map(template?.fields.map((field) => [field.key, field]));
    const reviewed = new Set(template?.reviewedKeys);
    const sourceSensitive = new Set(addon.sensitiveKeys);
    const entries: SettingsSection['entries'][number][] = [];
    for (const entry of section.entries) {
      const { key, state } = entry;
      const field = fields.get(key);
      // Absent/incompatible addons can only offer syntactically plausible, speculative names.
      // No declaration, binding, type or value authority comes from the snapshot.
      if (
        (template && !field) ||
        (field && !field.supported && !field.requiresLiveBinding) ||
        pluginPreferenceKeySafety(key) !== 'candidate' ||
        (state.kind === 'set' &&
          (field
            ? typeof state.value !== field.type
            : !['boolean', 'number', 'string'].includes(typeof state.value)))
      )
        continue;
      const secret = !!field?.secret || isCredentialPreferenceKey(key) || sourceSensitive.has(key);
      if (secret && context.container !== 'age') continue;
      if (field?.supported && reviewed.has(key) && secret === field.secret) {
        entries.push(entry);
      } else {
        deferred.push({
          id: settingsChangeID(adapterID, key),
          addonId: addon.addonId,
          adapterID,
          key,
          label: field?.label ?? key,
          secret,
        });
      }
    }
    if (entries.length) sections.push({ ...section, entries });
  }
  return { document: { ...document, sections }, deferred };
}

/** Replan selected settings once after native lifecycle work, without substituting new baselines. */
export async function restoreWorkspacePreferences(
  document: SettingsDocument,
  catalog: SettingsTemplateCatalogPort | undefined,
  service: SettingsSnapshotService,
  reviewedPlan: SettingsSnapshotPlan,
  deferred: readonly DeferredWorkspaceSetting[],
  selected: ReadonlySet<string>,
  context: SettingsCryptoContext & SettingsPlanContext,
  verifySource: () => Promise<void>,
): Promise<{ receipt?: SettingsRestoreReceipt; skipped: readonly string[] }> {
  if (!selected.size) return { skipped: [] };
  if (!document.extensions || !catalog)
    return {
      receipt: await service.apply(reviewedPlan, selected, context, verifySource),
      skipped: [],
    };
  const addons = extensionsByAdapter(document.extensions);
  const baseline = new Map<string, SettingsChange>();
  for (const plan of reviewedPlan.plans)
    for (const change of plan.changes) {
      const id = settingsChangeID(plan.adapterID, change.key);
      if (selected.has(id) && !change.blocked && (!change.secret || context.container === 'age'))
        baseline.set(id, change);
    }
  const pending = new Map(deferred.map((entry) => [entry.id, entry]));
  const adapters = new Map<string, SettingsAdapter>();
  const sections: SettingsSection[] = [];
  for (const section of document.sections) {
    assertSettingsCurrent(context);
    const { adapterID, sourceVersion } = section;
    const addon = addons.get(adapterID);
    const entries = section.entries.filter(({ key }) => {
      const id = settingsChangeID(adapterID, key);
      if (!selected.has(id)) return false;
      if (baseline.has(id)) return true;
      const entry = pending.get(id);
      return (
        !!entry &&
        entry.addonId === addon?.addonId &&
        entry.adapterID === adapterID &&
        entry.key === key &&
        (!entry.secret || context.container === 'age')
      );
    });
    if (!entries.length) continue;
    if (!adapterID.startsWith('plugin-')) {
      sections.push({ ...section, entries });
      continue;
    }
    if (!addon || section.schemaVersion !== 1 || sourceVersion !== addon.version) continue;
    const sourceSensitive = new Set(addon.sensitiveKeys);
    const approved = new Map<string, boolean>();
    for (const { key } of entries) {
      const id = settingsChangeID(adapterID, key);
      const secret = baseline.get(id)?.secret ?? pending.get(id)?.secret ?? false;
      if (!sourceSensitive.has(key) || secret) approved.set(key, secret);
    }
    if (!approved.size) continue;
    try {
      const scope = await catalog.workspaceAdapter?.(
        addon.addonId,
        addon.version,
        approved,
        context,
      );
      assertSettingsCurrent(context);
      if (scope && scope.adapter.id === adapterID && scope.keys.size) {
        adapters.set(adapterID, scope.adapter);
        sections.push({ ...section, entries: entries.filter(({ key }) => scope.keys.has(key)) });
      }
    } catch (error) {
      assertNotCancelled(context, error);
    }
  }
  const fresh = await service.plan({ ...document, sections }, context, adapters);
  const admitted = new Set<string>();
  const unchanged: SettingsEntryReceipt[] = [];
  const sectionByAdapter = new Map(sections.map((section) => [section.adapterID, section]));
  for (const plan of fresh.plans) {
    const changes = new Map(plan.changes.map((change) => [change.key, change]));
    for (const change of plan.changes) {
      const id = settingsChangeID(plan.adapterID, change.key);
      const previous = baseline.get(id);
      if (
        !selected.has(id) ||
        change.blocked ||
        (previous
          ? previous.secret !== change.secret ||
            !sameSettingState(previous.before, change.before) ||
            !sameSettingState(previous.after, change.after)
          : pending.get(id)?.secret !== change.secret)
      )
        continue;
      admitted.add(id);
    }
    if (!plan.issues.length && adapters.has(plan.adapterID)) {
      // ReviewedPreferenceAdapter omits equally-valued fields, but reports every invalid entry.
      for (const { key } of sectionByAdapter.get(plan.adapterID)?.entries ?? []) {
        const id = settingsChangeID(plan.adapterID, key);
        if (!baseline.has(id) && !changes.has(key)) {
          unchanged.push({ adapterID: plan.adapterID, key, status: 'unchanged' });
          admitted.add(id);
        }
      }
    }
  }
  const skipped = [...selected].filter((id) => !admitted.has(id));
  const apply = new Set(admitted);
  for (const { adapterID, key } of unchanged) apply.delete(settingsChangeID(adapterID, key));
  let receipt: SettingsRestoreReceipt | undefined;
  if (apply.size) receipt = await service.apply(fresh, apply, context, verifySource);
  else if (unchanged.length) {
    await verifySource();
    assertSettingsCurrent(context);
  }
  if (unchanged.length)
    receipt = {
      entries: [...(receipt?.entries ?? []), ...unchanged],
      cancelled: receipt?.cancelled ?? false,
    };
  return receipt ? { receipt, skipped } : { skipped };
}
