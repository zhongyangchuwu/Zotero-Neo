import {
  assertSettingsCurrent,
  SettingsSnapshotError,
  type SettingsOperationContext,
} from '../../settings-snapshots/contracts';
import {
  MainPluginError,
  mainInstalledPlugins,
  mainPluginInstalled,
  setMainPluginEnabled,
  type MainPluginSnapshot,
} from '../../toolkit/main';
import { ZOTERO_NEO_PLUGIN_ID } from './host';
import { ExtensionSourceWriteError, extensionErrorText, installExtension } from './operations';
import {
  CURATED_EXTENSIONS,
  ExtensionSourceError,
  parseExtensionSource,
  readSources,
  resolveExtensionCandidates,
  safeExtensionHTTPSURL,
  type ExtensionCandidate,
  type ExtensionSource,
} from './sources';

export interface WorkspaceExtension {
  readonly addonId: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly source: ExtensionSource | null;
  readonly sensitiveKeys?: readonly string[];
}

export interface WorkspaceExtensionManifest {
  readonly version: 1;
  readonly addons: readonly WorkspaceExtension[];
}

export interface WorkspaceExtensionRow {
  readonly entry: WorkspaceExtension;
  readonly status: 'install' | 'missing' | 'state' | 'same' | 'blocked';
  readonly currentEnabled?: boolean;
  readonly sourceLabel?: string;
}

export interface WorkspaceExtensionPlan {
  readonly rows: readonly WorkspaceExtensionRow[];
}

export interface WorkspaceExtensionReceipt {
  readonly installed: number;
  readonly aligned: number;
  readonly pendingRestart: boolean;
  readonly skipped: readonly {
    readonly addonId: string;
    readonly name: string;
    readonly reason: string;
    readonly reasonCN?: string;
    readonly needsSource?: true;
  }[];
}

const MAX_ADDONS = 1024;
const MAX_SENSITIVE_KEYS = 20_000;
const MAX_SOURCE_URL = 4096;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const CREDENTIAL_SEGMENT =
  /(?:^|[;?&])(?:access[-_]?token|api[-_]?key|auth(?:entication|orization)?|credentials?|expires|password|private[-_]?key|secret|signature|signed|token|x-amz-[a-z-]+|x-goog-[a-z-]+)(?:$|[=;:])/i;
const PINNED_EXTENSIONS = CURATED_EXTENSIONS.filter((entry) => 'candidate' in entry);

function curatedSource(addonId: string | undefined, source: ExtensionSource) {
  if (source.kind !== 'xpi') return undefined;
  return PINNED_EXTENSIONS.find(({ candidate }) => {
    const pinned = candidate.source;
    return (
      candidate.expectedID === addonId &&
      pinned.kind === 'xpi' &&
      source.url === pinned.url &&
      source.hash === pinned.hash &&
      source.expectedVersion === pinned.expectedVersion
    );
  });
}

function portablePath(path: string): boolean {
  try {
    return path.split('/').every((segment) => {
      const decoded = decodeURIComponent(segment);
      return !CONTROL.test(decoded) && !/[/\\]/u.test(decoded) && !CREDENTIAL_SEGMENT.test(decoded);
    });
  } catch {
    return false;
  }
}

function portableSource(addonId: string, raw: unknown): ExtensionSource | null {
  if (!record(raw)) return null;
  if (raw.kind === 'xpi' && (!text(raw.url, MAX_SOURCE_URL) || raw.url.includes('?'))) return null;
  if (
    raw.kind === 'github' &&
    (!text(raw.owner, 39) ||
      !text(raw.repo, 100) ||
      (raw.assetName !== undefined && (!text(raw.assetName, 255) || /[?#]/u.test(raw.assetName))))
  )
    return null;
  const parsed = parseExtensionSource(raw);
  if (!parsed) return null;
  if (parsed.kind === 'github') return parsed;
  const curated = curatedSource(addonId, parsed);
  if (curated) return curated.candidate.source;
  if (parsed.hash !== undefined || parsed.expectedVersion !== undefined) return null;
  const url = safeExtensionHTTPSURL(parsed.url);
  return url && portablePath(url.pathname) ? { kind: 'xpi', url: url.href } : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !CONTROL.test(value);
}

function invalidManifest(): never {
  throw new SettingsSnapshotError(
    'invalid-file',
    'Invalid or duplicate workspace extension inventory',
  );
}

/** Validate bounded inventory metadata and project only portable provenance. */
export function validateWorkspaceExtensionManifest(value: unknown): WorkspaceExtensionManifest {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.addons) ||
    value.addons.length > MAX_ADDONS
  )
    invalidManifest();
  const ids = new Set<string>();
  let keyCount = 0;
  const addons: WorkspaceExtension[] = [];
  for (const item of value.addons as unknown[]) {
    if (
      !record(item) ||
      !text(item.addonId, 512) ||
      !item.addonId.trim() ||
      ids.has(item.addonId) ||
      !text(item.name, 1024) ||
      !item.name.trim() ||
      !text(item.version, 256) ||
      typeof item.enabled !== 'boolean'
    )
      invalidManifest();
    ids.add(item.addonId);
    let sensitiveKeys: string[] | undefined;
    if (item.sensitiveKeys !== undefined) {
      if (
        !Array.isArray(item.sensitiveKeys) ||
        (keyCount += item.sensitiveKeys.length) > MAX_SENSITIVE_KEYS
      )
        invalidManifest();
      const keys = new Set<string>();
      for (const key of item.sensitiveKeys as unknown[]) {
        if (!text(key, 512) || !key) invalidManifest();
        keys.add(key);
      }
      if (keys.size) sensitiveKeys = [...keys].sort();
    }
    addons.push({
      addonId: item.addonId,
      name: item.name,
      version: item.version,
      enabled: item.enabled,
      source: portableSource(item.addonId, item.source),
      ...(sensitiveKeys && { sensitiveKeys }),
    });
  }
  addons.sort((left, right) =>
    left.addonId < right.addonId ? -1 : left.addonId > right.addonId ? 1 : 0,
  );
  return { version: 1, addons };
}

function manageable(plugin: MainPluginSnapshot): boolean {
  return plugin.id !== ZOTERO_NEO_PLUGIN_ID && plugin.canUninstall;
}

export async function captureWorkspaceExtensions(
  context: SettingsOperationContext,
  sensitiveKeysByAddon: ReadonlyMap<string, readonly string[]>,
): Promise<WorkspaceExtensionManifest> {
  assertSettingsCurrent(context);
  const plugins = await mainInstalledPlugins();
  assertSettingsCurrent(context);
  let sources: ReadonlyMap<string, ExtensionSource> | undefined;
  try {
    sources = readSources();
  } catch {
    // A broken local provenance preference does not make installed add-ons disappear.
  }
  assertSettingsCurrent(context);
  return validateWorkspaceExtensionManifest({
    version: 1,
    addons: plugins.filter(manageable).map(({ id, name, version, enabled }) => ({
      addonId: id,
      name,
      version,
      enabled,
      source: sources?.get(id) ?? null,
      sensitiveKeys: sensitiveKeysByAddon.get(id),
    })),
  });
}

function sourceLabel(addonId: string | undefined, source: ExtensionSource): string | undefined {
  const parsed = parseExtensionSource(source);
  if (!parsed) return undefined;
  if (parsed.kind === 'github') return `${parsed.owner}/${parsed.repo}`;
  return curatedSource(addonId, parsed)?.label ?? safeExtensionHTTPSURL(parsed.url)?.hostname;
}

export function workspaceExtensionCandidateLabel(candidate: ExtensionCandidate): string {
  return sourceLabel(candidate.expectedID, candidate.source) ?? 'XPI';
}

export async function inspectWorkspaceExtensions(
  manifest: WorkspaceExtensionManifest,
  context: SettingsOperationContext,
): Promise<WorkspaceExtensionPlan> {
  assertSettingsCurrent(context);
  const { addons } = validateWorkspaceExtensionManifest(manifest);
  const installed = new Map((await mainInstalledPlugins()).map((plugin) => [plugin.id, plugin]));
  assertSettingsCurrent(context);
  return {
    rows: addons.map((entry) => {
      const current = installed.get(entry.addonId);
      let status: WorkspaceExtensionRow['status'];
      if (entry.addonId === ZOTERO_NEO_PLUGIN_ID || (current && !manageable(current))) {
        status = 'blocked';
      } else if (!current) {
        status = entry.source ? 'install' : 'missing';
      } else if (current.enabled === entry.enabled) {
        status = 'same';
      } else {
        status = (entry.enabled ? current.canEnable : current.canDisable) ? 'state' : 'blocked';
      }
      return {
        entry,
        status,
        currentEnabled: current?.enabled,
        sourceLabel: entry.source ? sourceLabel(entry.addonId, entry.source) : undefined,
      };
    }),
  };
}

function bindCandidate(
  addonId: string,
  candidate: ExtensionCandidate,
): ExtensionCandidate | undefined {
  const pinned = PINNED_EXTENSIONS.find((item) => item.candidate.url === candidate.url)?.candidate;
  if (
    (candidate.expectedID !== undefined && candidate.expectedID !== addonId) ||
    (pinned && pinned.expectedID !== addonId)
  )
    return undefined;
  return pinned ?? { ...candidate, expectedID: addonId };
}

export async function resolveWorkspaceExtensionInput(
  addonId: string,
  input: string,
  signal: AbortSignal,
): Promise<readonly ExtensionCandidate[]> {
  signal.throwIfAborted();
  if (addonId === ZOTERO_NEO_PLUGIN_ID) return [];
  if (input.length > MAX_SOURCE_URL) throw new ExtensionSourceError('invalid-source');
  const candidates = await resolveExtensionCandidates(input, signal);
  return candidates.flatMap((candidate) => {
    const bound = bindCandidate(addonId, candidate);
    return bound ? [bound] : [];
  });
}

async function savedCandidate(
  entry: WorkspaceExtension,
  signal: AbortSignal,
): Promise<ExtensionCandidate> {
  const source = portableSource(entry.addonId, entry.source);
  if (!source) throw new ExtensionSourceError('invalid-source');
  if (source.kind === 'xpi') {
    const curated = curatedSource(entry.addonId, source)?.candidate;
    if (curated) return curated;
    const candidates = await resolveExtensionCandidates(source.url, signal);
    const bound =
      candidates.length === 1 &&
      candidates[0].source.kind === 'xpi' &&
      bindCandidate(entry.addonId, candidates[0]);
    if (!bound)
      throw new MainPluginError('identity', 'The selected source belongs to a different extension');
    return bound;
  }
  const candidates = await resolveExtensionCandidates(`${source.owner}/${source.repo}`, signal);
  const matches =
    candidates.length === 1
      ? candidates
      : candidates.filter(
          (candidate) =>
            candidate.source.kind === 'github' && candidate.source.assetName === source.assetName,
        );
  if (matches.length !== 1) throw new ExtensionSourceError('ambiguous-asset');
  const bound = bindCandidate(entry.addonId, matches[0]);
  if (!bound)
    throw new MainPluginError('identity', 'The selected source belongs to a different extension');
  return bound;
}

async function installWithCancellation(
  candidate: ExtensionCandidate,
  context: SettingsOperationContext,
) {
  let cancel: (() => void) | null = null;
  const abort = () => cancel?.();
  context.signal.addEventListener('abort', abort, { once: true });
  try {
    return await installExtension(candidate, {
      signal: context.signal,
      isCurrent: context.isCurrent,
      progress: () => {},
      registerCancel: (next) => {
        cancel = next;
        if (context.signal.aborted) abort();
      },
    });
  } finally {
    context.signal.removeEventListener('abort', abort);
  }
}

const CHANGED = [
  'The installed extension changed since preview. Review it again before restoring.',
  '已安装的扩展在预览后发生了变化，请重新检查后再还原。',
] as const;
const DEFERRED = [
  'Zotero needs a restart before the extension change can be confirmed.',
  'Zotero 需要重启才能确认此扩展变更。',
] as const;
const NOT_CONFIRMED = [
  'Zotero did not confirm the extension change.',
  'Zotero 未确认此扩展变更。',
] as const;

export async function applyWorkspaceExtensions(
  plan: WorkspaceExtensionPlan,
  selected: ReadonlySet<string>,
  replacements: ReadonlyMap<string, ExtensionCandidate>,
  context: SettingsOperationContext,
  verifySource: () => Promise<void>,
): Promise<WorkspaceExtensionReceipt> {
  assertSettingsCurrent(context);
  const skipped = new Map<
    string,
    WorkspaceExtensionReceipt['skipped'][number] & { readonly reasonCN: string }
  >();
  let installed = 0;
  let aligned = 0;
  let pendingRestart = false;
  const alignment: { row: WorkspaceExtensionRow; install?: { pendingRestart: boolean } }[] = [];
  const skip = (
    { addonId, name }: WorkspaceExtension,
    [reason, reasonCN]: readonly [string, string],
    needsSource?: true,
  ) => {
    const previous = skipped.get(addonId);
    skipped.set(addonId, {
      addonId,
      name,
      reason: previous ? `${previous.reason} ${reason}` : reason,
      reasonCN: previous ? `${previous.reasonCN} ${reasonCN}` : reasonCN,
      ...(needsSource || previous?.needsSource ? { needsSource: true as const } : {}),
    });
  };
  const skipError = (entry: WorkspaceExtension, error: unknown, originalDirect = false) => {
    assertSettingsCurrent(context);
    // Gecko groups expired HTTP downloads and temporary outages under the same network code.
    // Keep those retryable; only move a proven unusable source to the repair prompt.
    const needsSource =
      originalDirect &&
      ((error instanceof MainPluginError &&
        (error.code === 'identity' ||
          error.code === 'insecure-source' ||
          error.code === 'invalid-package')) ||
        (error instanceof ExtensionSourceError && error.code === 'invalid-source'));
    skip(
      entry,
      [extensionErrorText(error, false), extensionErrorText(error, true)],
      needsSource ? true : undefined,
    );
  };
  const verify = async () => {
    assertSettingsCurrent(context);
    await verifySource(); // A stale backup stops the entire restore, not just this row.
    assertSettingsCurrent(context);
  };

  for (const row of plan.rows) {
    const { entry, status } = row;
    const { addonId } = entry;
    if (!selected.has(addonId)) continue;
    if (addonId === ZOTERO_NEO_PLUGIN_ID || status === 'blocked') {
      skipError(entry, new MainPluginError('protected', 'This add-on cannot be changed'));
    } else if (status === 'state') {
      alignment.push({ row });
    } else if (status === 'install' || status === 'missing') {
      const replacement = replacements.get(addonId);
      const originalDirect = !replacement && entry.source?.kind === 'xpi';
      let candidate: ExtensionCandidate;
      try {
        const exists = await mainPluginInstalled(addonId);
        assertSettingsCurrent(context);
        if (exists) {
          skip(entry, CHANGED);
          continue;
        }
        const bound = replacement
          ? bindCandidate(addonId, replacement)
          : await savedCandidate(entry, context.signal);
        if (!bound)
          throw new MainPluginError('identity', 'The replacement targets a different extension');
        candidate = bound;
      } catch (error) {
        skipError(entry, error, originalDirect);
        continue;
      }
      await verify();
      try {
        const result = await installWithCancellation(candidate, context);
        assertSettingsCurrent(context);
        if (result) {
          pendingRestart ||= result.pendingRestart;
          alignment.push({ row, install: result });
        } else {
          skip(entry, NOT_CONFIRMED);
        }
      } catch (error) {
        skipError(entry, error, originalDirect);
        if (error instanceof ExtensionSourceWriteError && error.pendingRestart !== null) {
          pendingRestart ||= error.pendingRestart;
          alignment.push({ row, install: { pendingRestart: error.pendingRestart } });
        }
      }
    }
  }

  // New packages must be present in AddonManager before applying or claiming their state.
  for (const { row, install } of alignment) {
    const { entry, currentEnabled } = row;
    const { addonId, enabled } = entry;
    await verify();
    try {
      const current = (await mainInstalledPlugins()).find(({ id }) => id === addonId);
      assertSettingsCurrent(context);
      if (!current || !manageable(current)) {
        skip(entry, !current && install?.pendingRestart ? DEFERRED : CHANGED);
        continue;
      }
      if (install) installed++;
      if (current.enabled === enabled) continue;
      if (!install && current.enabled !== currentEnabled) {
        skip(entry, CHANGED);
        continue;
      }
      if (!(enabled ? current.canEnable : current.canDisable))
        throw new MainPluginError('permission', 'Zotero does not permit the requested state');
      await setMainPluginEnabled(addonId, enabled);
      assertSettingsCurrent(context);
      const updated = (await mainInstalledPlugins()).find(({ id }) => id === addonId);
      assertSettingsCurrent(context);
      pendingRestart ||= updated?.pendingRestart === true;
      if (updated && manageable(updated) && updated.enabled === enabled) aligned++;
      else skip(entry, updated?.pendingRestart ? DEFERRED : NOT_CONFIRMED);
    } catch (error) {
      skipError(entry, error);
    }
  }
  return { installed, aligned, pendingRestart, skipped: [...skipped.values()] };
}

export const workspaceExtensionEngine = {
  capture: captureWorkspaceExtensions,
  inspect: inspectWorkspaceExtensions,
  resolveInput: resolveWorkspaceExtensionInput,
  apply: applyWorkspaceExtensions,
};
