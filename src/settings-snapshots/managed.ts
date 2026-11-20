import type { Cleanup } from '../core/cleanup';
import {
  createSnapshotAttachments,
  type SnapshotAttachmentIdentity,
  type SnapshotAttachmentContents,
} from '../platform/settings-snapshot-attachments';
import {
  initializeManagedSnapshots,
  managedSnapshotSemanticIdentity,
  readManagedSnapshotBindings,
  reportManagedSnapshotFailure,
  writeManagedSnapshotBindings,
} from '../platform/settings-snapshot-managed-profile';
import {
  SettingsSnapshotError,
  type SettingsCryptoContext,
  type SettingsDocument,
  type SettingsFileCodec,
  type SettingsOperationContext,
} from './contracts';
import { SETTINGS_CONTAINERS } from './codec';
import { assertSettingsCurrent } from './document';
import type {
  CreateManagedSnapshot,
  ManagedSettingsSnapshotsPort,
  ManagedSnapshotTarget,
  SettingsTemplateCatalogPort,
  SnapshotPluginTemplate,
} from './ports';
import type { SettingsSnapshotService } from './service';

interface Binding {
  readonly target: ManagedSnapshotTarget;
  readonly expected: SnapshotAttachmentIdentity;
  readonly semantic: string | null;
  readonly legacyTemplate?: string;
  readonly retryReason?: 'incompatible-template' | 'capture-failed' | 'download-pending';
  /** Last successful scope baseline; a metadata-only edit does not change published sections. */
  readonly capturedAdapterIDs: readonly string[];
}
interface ProjectedSnapshot {
  readonly document: SettingsDocument;
  readonly capturedAdapterIDs: readonly string[];
  readonly semantic: string | null;
  readonly message: string;
}
interface SnapshotScheduler {
  readonly window: Window;
  readonly controller: AbortController;
  timer: number | null;
  running: boolean;
}
const SYNC_NOTICE =
  'Stored locally; cross-device availability depends on Zotero data and attachment file sync.';
const CONFLICT_NOTICE =
  'The stored snapshot changed outside this binding. Review the current file before choosing which version to keep.';
const OBSERVE_CONTENT_CHANGE = { observeContentChange: true } as const;
class ObservedConflict extends SettingsSnapshotError {
  constructor(readonly revision: string) {
    super('external-change', CONFLICT_NOTICE);
  }
}
const POLL_MS = 5 * 60_000;
function reject(code: string, message: string): never {
  throw new SettingsSnapshotError(code, message);
}
function validatePolicy(
  value: Pick<CreateManagedSnapshot, 'container' | 'autoUpdate' | 'includeSecrets'>,
): void {
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_CONTAINERS, value.container))
    reject('invalid-container', 'Choose a supported settings container.');
  const capabilities = SETTINGS_CONTAINERS[value.container];
  if (value.autoUpdate && !capabilities.allowsAutoUpdate)
    reject('encrypted-auto-update', 'This settings container cannot auto-update.');
  if (value.includeSecrets && !capabilities.encrypted)
    reject('plaintext-secrets', 'Unencrypted snapshots cannot include secret fields.');
}
function title(value: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 512)
    reject('invalid-title', 'Enter a snapshot title of at most 512 characters.');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function semantic(document: SettingsDocument): string {
  const { createdAt: _createdAt, ...settings } = document;
  return managedSnapshotSemanticIdentity(
    canonical({
      ...settings,
      sections: settings.sections
        .map((section) => ({
          ...section,
          entries: [...section.entries].sort((left, right) => left.key.localeCompare(right.key)),
        }))
        .sort((left, right) => left.adapterID.localeCompare(right.adapterID)),
    }),
  );
}
function isScope(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 64 &&
    value.every((id) => typeof id === 'string' && /^[a-z][a-z0-9.-]{0,127}$/u.test(id)) &&
    new Set(value).size === value.length
  );
}
function scope(value: readonly string[]): readonly string[] {
  if (!isScope(value)) reject('invalid-scope', 'Choose at least one valid settings adapter.');
  return [...value];
}
function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}
function invalidBindings(): never {
  return reject(
    'binding-storage',
    'Local backup sync links are invalid. No attachments were changed.',
  );
}
function loadBindings(value: unknown): Binding[] {
  if (!Array.isArray(value)) invalidBindings();
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    const binding = entry as
      | (Partial<Omit<Binding, 'target'>> & {
          readonly target?: ManagedSnapshotTarget & { readonly adapterID?: unknown };
          readonly template?: unknown;
        })
      | null;
    const target = binding?.target;
    const expected = binding?.expected;
    if (
      !binding ||
      !target ||
      !expected ||
      typeof target.id !== 'string' ||
      ids.has(target.id) ||
      !target.source ||
      !Number.isInteger(target.source.libraryID) ||
      typeof target.source.itemKey !== 'string' ||
      typeof target.source.title !== 'string' ||
      target.id !== `${target.source.libraryID}:${target.source.itemKey}` ||
      typeof target.title !== 'string' ||
      (target.collectionID !== null && !Number.isInteger(target.collectionID)) ||
      typeof target.autoUpdate !== 'boolean' ||
      typeof target.includeSecrets !== 'boolean' ||
      typeof target.includeLibrarySettings !== 'boolean' ||
      !['ready', 'conflict', 'paused', 'error'].includes(target.status) ||
      (target.status === 'conflict'
        ? typeof target.conflictRevision !== 'string' || !target.conflictRevision
        : target.conflictRevision !== undefined) ||
      typeof target.message !== 'string' ||
      typeof target.updatedAt !== 'string' ||
      typeof expected.path !== 'string' ||
      typeof expected.digest !== 'string' ||
      typeof expected.title !== 'string' ||
      !Array.isArray(expected.collections) ||
      !expected.collections.every(Number.isInteger) ||
      !(binding.semantic === null || typeof binding.semantic === 'string')
    )
      invalidBindings();
    validatePolicy(target);
    ids.add(target.id);
    const old = target.kind === undefined && target.adapterIDs === undefined;
    const kind = old ? 'legacy' : target.kind;
    const adapterIDs = old ? [target.adapterID] : target.adapterIDs;
    const legacyTemplate = old ? binding.template : binding.legacyTemplate;
    const retryReason = binding.retryReason;
    const capturedAdapterIDs = old ? adapterIDs : binding.capturedAdapterIDs;
    if (
      !['workspace', 'legacy'].includes(kind) ||
      !isScope(adapterIDs) ||
      !isScope(capturedAdapterIDs) ||
      (kind === 'legacy'
        ? typeof legacyTemplate !== 'string' ||
          adapterIDs.length !== 1 ||
          !sameScope(adapterIDs, capturedAdapterIDs)
        : legacyTemplate !== undefined) ||
      (retryReason !== undefined &&
        (target.status !== 'paused' ||
          (retryReason !== 'download-pending' &&
            (kind !== 'workspace' ||
              !['incompatible-template', 'capture-failed'].includes(retryReason)))))
    )
      invalidBindings();
    // Copy only the known profile schema. Unknown persisted keys (including credentials) are never re-saved.
    return {
      target: {
        id: target.id,
        kind,
        adapterIDs: [...adapterIDs],
        source: {
          libraryID: target.source.libraryID,
          itemKey: target.source.itemKey,
          title: target.source.title,
        },
        title: target.title,
        collectionID: target.collectionID,
        container: target.container,
        autoUpdate: target.autoUpdate,
        includeSecrets: target.includeSecrets,
        includeLibrarySettings: target.includeLibrarySettings,
        status: target.status,
        ...(target.conflictRevision === undefined
          ? {}
          : { conflictRevision: target.conflictRevision }),
        message: target.message,
        updatedAt: target.updatedAt,
      },
      expected: {
        path: expected.path,
        digest: expected.digest,
        title: expected.title,
        collections: [...expected.collections],
      },
      semantic: binding.semantic,
      ...(typeof legacyTemplate === 'string' ? { legacyTemplate } : {}),
      ...(retryReason === undefined ? {} : { retryReason }),
      capturedAdapterIDs: [...capturedAdapterIDs],
    };
  });
}

function shouldAutoUpdate({ target, retryReason }: Binding): boolean {
  return target.autoUpdate && (target.status === 'ready' || retryReason !== undefined);
}

/** One application-owned scheduler; attachments are carriers, never automatic restore inputs. */
export function createManagedSettingsSnapshots(
  service: SettingsSnapshotService,
  codec: SettingsFileCodec,
  catalog: SettingsTemplateCatalogPort,
): ManagedSettingsSnapshotsPort {
  const carrier = createSnapshotAttachments();
  const windows = new Map<object, Window>();
  let bindings: Binding[] | null = null;
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();
  let startup: AbortController | null = null;
  let scheduler: SnapshotScheduler | null = null;
  let backgroundFailure: SettingsSnapshotError | null = null;

  function fence<T extends SettingsOperationContext>(context: T): T {
    return { ...context, isCurrent: () => !disposed && context.isCurrent() };
  }
  async function initialize(context: SettingsOperationContext): Promise<void> {
    assertSettingsCurrent(context);
    await initializeManagedSnapshots();
    assertSettingsCurrent(context);
    if (bindings === null) {
      bindings = loadBindings(readManagedSnapshotBindings());
      if (backgroundFailure?.code === 'scheduler-initialization') backgroundFailure = null;
      reconcileScheduler();
    }
  }
  function serialized<T>(
    context: SettingsOperationContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = queue.then(async () => {
      if (bindings === null) await initialize(context);
      assertSettingsCurrent(context);
      return operation();
    });
    queue = result.catch(() => undefined);
    return result;
  }
  function save(next: Binding[]): void {
    writeManagedSnapshotBindings(next);
    bindings = next;
    reconcileScheduler();
  }
  function replace(binding: Binding): void {
    save(
      (bindings ?? []).map((entry) => (entry.target.id === binding.target.id ? binding : entry)),
    );
  }
  function get(id: string): Binding {
    const binding = bindings?.find((entry) => entry.target.id === id);
    if (!binding)
      reject('missing-binding', 'This device has no local sync link for the library backup.');
    return binding;
  }
  function visible(target: ManagedSnapshotTarget): ManagedSnapshotTarget {
    return { ...target, adapterIDs: [...target.adapterIDs], source: { ...target.source } };
  }
  async function availableTemplates(
    context: SettingsOperationContext,
  ): Promise<ReadonlyMap<string, SnapshotPluginTemplate>> {
    const templates = await catalog.list(context);
    assertSettingsCurrent(context);
    const installed = new Set(catalog.adapters.map((adapter) => adapter.id));
    return new Map(
      templates
        .filter(
          (template) =>
            (template.status === 'builtin' || template.status === 'reviewed') &&
            installed.has(template.adapterID),
        )
        .map((template) => [template.adapterID, template]),
    );
  }
  function candidates(
    adapterIDs: readonly string[],
    available: ReadonlyMap<string, SnapshotPluginTemplate>,
    previouslyCaptured: readonly string[],
    legacyTemplate?: string,
  ): string[] {
    // Workspace membership is locally configured; eligibility and fields come only from
    // the current local review. Legacy bindings retain their frozen single-template revision.
    const ids = adapterIDs.filter((id) => {
      const template = available.get(id);
      return template && (legacyTemplate === undefined || template.revision === legacyTemplate);
    });
    const unavailable = previouslyCaptured.filter(
      (id) => adapterIDs.includes(id) && !ids.includes(id),
    );
    if (unavailable.length)
      reject(
        'incompatible-template',
        `Previously backed up plugin settings are unavailable or need fresh local review (${unavailable.join(', ')}). The stored file was not overwritten.`,
      );
    if (!ids.length)
      reject(
        'capture-failed',
        'None of the selected plugins has an available, locally approved settings template.',
      );
    return ids;
  }
  async function project(
    target: Pick<
      ManagedSnapshotTarget,
      'kind' | 'adapterIDs' | 'container' | 'includeSecrets' | 'includeLibrarySettings'
    >,
    available: ReadonlyMap<string, SnapshotPluginTemplate>,
    previouslyCaptured: readonly string[],
    context: SettingsCryptoContext,
    legacyTemplate?: string,
  ): Promise<ProjectedSnapshot> {
    const ids = candidates(target.adapterIDs, available, previouslyCaptured, legacyTemplate);
    const captured = await service.capture(
      new Set(ids),
      {
        ...context,
        container: target.container,
        includeSecrets: target.includeSecrets,
        includeLibrarySettings: target.includeLibrarySettings,
      },
      target.kind === 'workspace' ? { skipFailedAdapters: true } : undefined,
    );
    assertSettingsCurrent(context);
    const capturedAdapterIDs = captured.document.sections.map((section) => section.adapterID);
    const missing = previouslyCaptured.filter(
      (id) => target.adapterIDs.includes(id) && !capturedAdapterIDs.includes(id),
    );
    if (missing.length || captured.issues.some((issue) => issue.severity === 'error'))
      reject(
        'capture-failed',
        'Previously backed up plugin settings could not be captured completely. The stored file was not overwritten.',
      );
    const skipped = target.adapterIDs.filter((id) => !capturedAdapterIDs.includes(id));
    return {
      document: captured.document,
      capturedAdapterIDs,
      semantic: target.container === 'json' ? semantic(captured.document) : null,
      message: skipped.length
        ? `${SYNC_NOTICE} Not captured: ${skipped.map((id) => available.get(id)?.label ?? id).join(', ')}. Review the selected plugins to retry.`
        : SYNC_NOTICE,
    };
  }
  function withIdentity(binding: Binding, observed: SnapshotAttachmentContents): Binding {
    const { identity, source } = observed;
    const { collectionID } = binding.target;
    return {
      ...binding,
      expected: identity,
      target: {
        ...binding.target,
        source,
        title: identity.title,
        collectionID:
          collectionID !== null && identity.collections.includes(collectionID)
            ? collectionID
            : (identity.collections[0] ?? null),
      },
    };
  }
  function markConflict(binding: Binding, revision: string): void {
    if (binding.target.conflictRevision === revision) return;
    const { retryReason: _retryReason, ...confirmed } = binding;
    replace({
      ...confirmed,
      target: {
        ...binding.target,
        status: 'conflict',
        conflictRevision: revision,
        message: CONFLICT_NOTICE,
      },
    });
  }
  async function observe(binding: Binding, context: SettingsOperationContext) {
    const observed = await carrier.inspect(
      binding.target.source,
      binding.expected,
      context,
      OBSERVE_CONTENT_CHANGE,
    );
    assertSettingsCurrent(context);
    return observed;
  }
  async function reviewed(
    binding: Binding,
    revision: string,
    context: SettingsOperationContext,
  ): Promise<SnapshotAttachmentContents> {
    const observed = await observe(binding, context);
    if (observed.identity.digest !== revision) throw new ObservedConflict(observed.identity.digest);
    return observed;
  }
  async function refresh(binding: Binding, context: SettingsOperationContext): Promise<Binding> {
    const observed = await reviewed(binding, binding.expected.digest, context);
    if (JSON.stringify(observed.identity) === JSON.stringify(binding.expected)) return binding;
    const next = withIdentity(binding, observed);
    replace(next);
    return next;
  }
  async function recordFailure(
    binding: Binding,
    error: unknown,
    context: SettingsOperationContext,
    automatic = false,
  ): Promise<unknown> {
    if (context.signal.aborted || !context.isCurrent()) return error;
    if (error instanceof ObservedConflict) {
      markConflict(binding, error.revision);
      return error;
    }
    if (error instanceof SettingsSnapshotError && error.code === 'external-change') {
      try {
        // Native compare-and-swap may have caught a newer file after the first review.
        const observed = await observe(binding, context);
        if (
          binding.target.status === 'conflict' ||
          observed.identity.digest !== binding.expected.digest
        ) {
          markConflict(binding, observed.identity.digest);
          return error;
        }
      } catch (observingError) {
        if (context.signal.aborted || !context.isCurrent()) return error;
        error = observingError;
      }
    }
    const known =
      error instanceof SettingsSnapshotError
        ? error
        : new SettingsSnapshotError(
            'managed-operation-failed',
            'The snapshot operation could not be confirmed. Inspect the stored attachment before retrying.',
          );
    if (['cancelled', 'binding-storage', 'stale-target', 'stale-conflict'].includes(known.code))
      return known;
    const { conflictRevision: _conflictRevision, ...target } = binding.target;
    let next: ManagedSnapshotTarget = { ...target, status: 'paused', message: known.message };
    if (automatic && known.code === 'busy')
      next = {
        ...binding.target,
        message: 'Auto-update deferred while another settings operation is running.',
      };
    else if (
      target.status === 'conflict' &&
      ['busy', 'capture-failed', 'incompatible-template'].includes(known.code)
    )
      next = { ...binding.target, message: known.message };
    let retryReason: Binding['retryReason'];
    if (automatic && known.code === 'busy') retryReason = binding.retryReason;
    else if (
      next.status === 'paused' &&
      (known.code === 'download-pending' ||
        (target.kind === 'workspace' &&
          (known.code === 'incompatible-template' || known.code === 'capture-failed')))
    )
      retryReason = known.code;
    if (
      next.status !== binding.target.status ||
      next.message !== binding.target.message ||
      retryReason !== binding.retryReason
    ) {
      const { retryReason: _retryReason, ...confirmed } = binding;
      replace({
        ...confirmed,
        target: next,
        ...(retryReason === undefined ? {} : { retryReason }),
      });
    }
    return known;
  }
  function settle(
    binding: Binding,
    observed: SnapshotAttachmentContents,
    captured: Pick<ProjectedSnapshot, 'semantic' | 'capturedAdapterIDs' | 'message'>,
  ): ManagedSnapshotTarget {
    const { conflictRevision: _conflictRevision, ...target } = binding.target;
    const { retryReason: _retryReason, ...confirmed } = binding;
    const next = withIdentity(
      {
        ...confirmed,
        semantic: captured.semantic,
        capturedAdapterIDs: captured.capturedAdapterIDs,
        target: {
          ...target,
          status: 'ready',
          updatedAt: new Date().toISOString(),
          message: captured.message,
        },
      },
      observed,
    );
    replace(next);
    return visible(next.target);
  }
  async function publish(
    binding: Binding,
    password: string,
    context: SettingsCryptoContext,
    automatic: boolean,
    expectedRevision?: string,
  ): Promise<ManagedSnapshotTarget> {
    validatePolicy(binding.target);
    if (expectedRevision !== undefined) {
      if (
        binding.target.status !== 'conflict' ||
        binding.target.conflictRevision !== expectedRevision
      )
        reject(
          'stale-conflict',
          'The conflicting snapshot changed. Review its current contents before overwriting.',
        );
    } else if (binding.target.status !== 'ready' && binding.retryReason === undefined) {
      reject(
        'paused-target',
        'This snapshot is not ready to update. Inspect its status before continuing.',
      );
    }
    if (SETTINGS_CONTAINERS[binding.target.container].requiresPassword && !password)
      reject('invalid-password', 'A non-empty password is required');
    try {
      const available = await availableTemplates(context);
      const conflict =
        expectedRevision === undefined ? null : await reviewed(binding, expectedRevision, context);
      if (!conflict) binding = await refresh(binding, context);
      const captured = await project(
        binding.target,
        available,
        binding.capturedAdapterIDs,
        context,
        binding.legacyTemplate,
      );
      if (automatic && captured.semantic === binding.semantic) {
        const target = { ...binding.target, status: 'ready' as const, message: captured.message };
        const { retryReason, ...confirmed } = binding;
        if (retryReason || target.message !== binding.target.message)
          replace({ ...confirmed, target });
        return visible(target);
      }
      const text = await codec.seal(captured.document, password, context, binding.target.container);
      assertSettingsCurrent(context);
      const stored = await carrier.publish(
        binding.target.source,
        conflict?.identity ?? binding.expected,
        text,
        context,
      );
      assertSettingsCurrent(context);
      return settle(binding, stored, captured);
    } catch (error) {
      throw await recordFailure(binding, error, context, automatic);
    }
  }
  function stopScheduler(): void {
    const previous = scheduler;
    scheduler = null;
    if (!previous) return;
    if (previous.timer !== null) previous.window.clearTimeout(previous.timer);
    previous.controller.abort();
  }
  function reconcileScheduler(): void {
    const window = windows.values().next().value;
    if (!window) {
      const previous = startup;
      startup = null;
      previous?.abort();
    }
    if (scheduler && scheduler.window !== window) stopScheduler();
    if (!window || !bindings?.some(shouldAutoUpdate)) {
      // A running batch has no timer and still needs to report the outcome of its last write.
      if (!scheduler?.running) stopScheduler();
      return;
    }
    if (scheduler) return;
    const current: SnapshotScheduler = {
      window,
      controller: new (window as Window & typeof globalThis).AbortController(),
      timer: null,
      running: false,
    };
    scheduler = current;
    schedule(current);
  }
  async function updateEligibleBindings(context: SettingsCryptoContext): Promise<void> {
    for (const binding of bindings ?? []) {
      if (!shouldAutoUpdate(binding)) continue;
      assertSettingsCurrent(context);
      try {
        await publish(binding, '', context, true);
      } catch (error) {
        if (context.signal.aborted || !context.isCurrent()) return;
        if (error instanceof SettingsSnapshotError && error.code === binding.retryReason) continue;
        reportManagedSnapshotFailure();
        if (!(error instanceof SettingsSnapshotError) || error.code === 'binding-storage')
          backgroundFailure = new SettingsSnapshotError(
            'scheduler-failed',
            'Auto-update could not confirm the local sync link. Inspect the library backup in Workspace Sync & Backup.',
          );
      }
    }
  }
  function schedule(current: SnapshotScheduler): void {
    const { window, controller } = current;
    current.timer = window.setTimeout(() => {
      if (scheduler !== current) return;
      current.timer = null;
      const context = fence({
        window,
        signal: controller.signal,
        isCurrent: () => scheduler === current,
      });
      void serialized(context, async () => {
        current.running = true;
        try {
          await updateEligibleBindings(context);
        } finally {
          current.running = false;
        }
      })
        .catch(() => {
          if (!context.isCurrent() || controller.signal.aborted) return;
          backgroundFailure = new SettingsSnapshotError(
            'scheduler-failed',
            'Library backup auto-update failed. No attachment was automatically restored.',
          );
          reportManagedSnapshotFailure();
        })
        .finally(() => {
          if (scheduler !== current) return;
          if (bindings?.some(shouldAutoUpdate)) schedule(current);
          else stopScheduler();
        });
    }, POLL_MS);
  }

  return {
    start(window): Cleanup {
      if (disposed) return () => undefined;
      const lease = {};
      windows.set(lease, window);
      reconcileScheduler();
      if (bindings === null && !startup) {
        // Loading profile policy does not belong to any one window.
        const controller = new (window as Window & typeof globalThis).AbortController();
        startup = controller;
        const context = fence({
          signal: controller.signal,
          isCurrent: () => startup === controller,
        });
        void initialize(context)
          .catch(() => {
            if (!context.isCurrent() || bindings !== null) return;
            backgroundFailure = new SettingsSnapshotError(
              'scheduler-initialization',
              'Library backup auto-update could not start. Open Workspace Sync & Backup to inspect the local sync links.',
            );
            reportManagedSnapshotFailure();
          })
          .finally(() => {
            if (startup === controller) startup = null;
          });
      }
      return () => {
        if (windows.delete(lease)) reconcileScheduler();
      };
    },
    list(context) {
      const current = fence(context);
      return serialized(current, async () => {
        if (backgroundFailure) throw backgroundFailure;
        let available: ReadonlyMap<string, SnapshotPluginTemplate> | undefined;
        for (let binding of bindings ?? []) {
          try {
            if (binding.target.status === 'conflict') {
              const observed = await observe(binding, current);
              markConflict(binding, observed.identity.digest);
            } else {
              binding = await refresh(binding, current);
              const canResume =
                binding.retryReason === 'incompatible-template' ||
                binding.retryReason === 'download-pending';
              if (binding.target.status === 'ready' || canResume) {
                available ??= await availableTemplates(current);
                candidates(
                  binding.target.adapterIDs,
                  available,
                  binding.capturedAdapterIDs,
                  binding.legacyTemplate,
                );
                if (canResume) {
                  const { retryReason: _retryReason, ...confirmed } = binding;
                  replace({
                    ...confirmed,
                    target: { ...confirmed.target, status: 'ready', message: SYNC_NOTICE },
                  });
                }
              }
            }
          } catch (error) {
            assertSettingsCurrent(current);
            const failure = await recordFailure(binding, error, current);
            if (failure instanceof SettingsSnapshotError && failure.code === 'binding-storage')
              throw failure;
          }
        }
        return (bindings ?? []).map((binding) => visible(binding.target));
      });
    },
    locations(context) {
      const current = fence(context);
      return serialized(current, () => carrier.locations(current));
    },
    sources(libraryID, context) {
      const current = fence(context);
      return serialized(current, () => carrier.sources(libraryID, current));
    },
    read(source, context) {
      const current = fence(context);
      return serialized(current, async () => {
        const observed = await carrier.read(source, current);
        assertSettingsCurrent(current);
        return observed.text;
      });
    },
    create(request, password, context) {
      const current = fence(context);
      return serialized(current, async () => {
        validatePolicy(request);
        title(request.title);
        const adapterIDs = scope(request.adapterIDs);
        if (SETTINGS_CONTAINERS[request.container].requiresPassword && !password)
          reject('invalid-password', 'A non-empty password is required');
        const available = await availableTemplates(current);
        const kind = 'workspace' as const;
        const captured = await project({ ...request, kind, adapterIDs }, available, [], current);
        const text = await codec.seal(captured.document, password, current, request.container);
        assertSettingsCurrent(current);
        const stored = await carrier.create(request, text, current);
        assertSettingsCurrent(current);
        const target: ManagedSnapshotTarget = {
          id: `${stored.source.libraryID}:${stored.source.itemKey}`,
          kind,
          adapterIDs,
          source: stored.source,
          title: stored.identity.title,
          collectionID: request.collectionID,
          container: request.container,
          autoUpdate: request.autoUpdate,
          includeSecrets: request.includeSecrets,
          includeLibrarySettings: request.includeLibrarySettings,
          status: 'ready',
          message: captured.message,
          updatedAt: new Date().toISOString(),
        };
        save([
          ...(bindings ?? []),
          {
            target,
            expected: stored.identity,
            semantic: captured.semantic,
            capturedAdapterIDs: captured.capturedAdapterIDs,
          },
        ]);
        return visible(target);
      });
    },
    update(id, password, context) {
      const current = fence(context);
      return serialized(current, () => publish(get(id), password, current, false));
    },
    overwrite(id, expectedRevision, password, context) {
      const current = fence(context);
      return serialized(current, () => {
        if (!expectedRevision)
          reject('stale-conflict', 'Review the current conflicting version before overwriting.');
        return publish(get(id), password, current, false, expectedRevision);
      });
    },
    adoptCloud(id, sourceContents, context) {
      const current = fence(context);
      return serialized(current, async () => {
        const binding = get(id);
        const revision = binding.target.conflictRevision;
        if (binding.target.status !== 'conflict' || !revision)
          reject(
            'stale-conflict',
            'There is no conflicting version to adopt. Refresh the snapshot.',
          );
        const verifySource = async () => {
          const observed = await reviewed(binding, revision, current);
          if (observed.text !== sourceContents)
            reject(
              'stale-conflict',
              'The stored file no longer matches the restored snapshot. Review its current contents before continuing.',
            );
          return observed;
        };
        try {
          const restored = await verifySource();
          if (binding.target.container === 'age')
            return settle(binding, restored, {
              semantic: null,
              capturedAdapterIDs: binding.capturedAdapterIDs,
              message: SYNC_NOTICE,
            });
          const available = await availableTemplates(current);
          // Only capture locally authorized state for the baseline. Never adopt template permissions
          // or use remote settings as input to the next automatic publication.
          const captured = await project(
            binding.target,
            available,
            binding.capturedAdapterIDs,
            current,
            binding.legacyTemplate,
          );
          const observed = await verifySource();
          return settle(binding, observed, captured);
        } catch (error) {
          throw await recordFailure(binding, error, current);
        }
      });
    },
    configure(id, options, context) {
      const current = fence(context);
      return serialized(current, async () => {
        let binding = get(id);
        validatePolicy({ ...binding.target, autoUpdate: options.autoUpdate });
        title(options.title);
        const adapterIDs =
          options.adapterIDs === undefined ? binding.target.adapterIDs : scope(options.adapterIDs);
        if (binding.target.kind === 'legacy' && !sameScope(adapterIDs, binding.target.adapterIDs))
          reject('immutable-scope', 'The plugin scope of a legacy snapshot cannot be changed.');
        const editingScope =
          binding.target.kind === 'workspace' && options.adapterIDs !== undefined;
        if (
          binding.target.status !== 'ready' &&
          (binding.target.status === 'conflict' || !editingScope)
        )
          reject(
            'paused-target',
            'This binding is not ready to configure. Inspect its status first.',
          );
        const assertBaseline = () => {
          if (
            binding.target.title !== options.expected.title ||
            binding.target.collectionID !== options.expected.collectionID ||
            binding.target.autoUpdate !== options.expected.autoUpdate ||
            !sameScope(binding.target.adapterIDs, options.expected.adapterIDs)
          )
            reject(
              'stale-target',
              'The target changed after configuration was opened. Existing metadata was preserved; refresh and reopen the configuration.',
            );
        };
        try {
          assertBaseline();
          binding = await refresh(binding, current);
          assertBaseline();
          const available = await availableTemplates(current);
          candidates(adapterIDs, available, binding.capturedAdapterIDs, binding.legacyTemplate);
          const stored = await carrier.configure(
            binding.target.source,
            binding.expected,
            {
              title: options.title,
              collectionID:
                options.collectionID === options.expected.collectionID
                  ? undefined
                  : options.collectionID,
            },
            current,
          );
          assertSettingsCurrent(current);
          const { retryReason: _retryReason, ...confirmed } = binding;
          const next: Binding = {
            ...confirmed,
            expected: stored.identity,
            target: {
              ...binding.target,
              adapterIDs,
              status: 'ready',
              message: editingScope
                ? `${SYNC_NOTICE} Update the snapshot to back up the newly selected scope.`
                : binding.target.message,
              title: options.title,
              collectionID: options.collectionID,
              autoUpdate: options.autoUpdate,
              source: stored.source,
            },
          };
          replace(next);
          return visible(next.target);
        } catch (error) {
          if (
            editingScope &&
            error instanceof SettingsSnapshotError &&
            ['incompatible-template', 'capture-failed'].includes(error.code)
          )
            throw error;
          throw await recordFailure(binding, error, current);
        }
      });
    },
    forget(id, context) {
      const current = fence(context);
      return serialized(current, async () => {
        get(id);
        assertSettingsCurrent(current);
        save((bindings ?? []).filter((binding) => binding.target.id !== id));
      });
    },
    dispose() {
      disposed = true;
      windows.clear();
      reconcileScheduler();
    },
  };
}
