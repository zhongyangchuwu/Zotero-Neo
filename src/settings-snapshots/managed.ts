import type { Cleanup } from '../core/cleanup';
import {
  createSnapshotAttachments,
  type SnapshotAttachmentIdentity,
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
  readonly template: string;
}
const SYNC_NOTICE =
  'Stored locally; cross-device availability depends on Zotero data and attachment file sync.';
const POLL_MS = 60_000;
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
function loadBindings(value: unknown): Binding[] {
  if (!Array.isArray(value))
    reject('binding-storage', 'Local snapshot bindings are invalid. No attachments were changed.');
  const ids = new Set<string>();
  for (const entry of value) {
    const binding = entry as Partial<Binding> | null;
    const target = binding?.target;
    const expected = binding?.expected;
    if (
      !target ||
      !expected ||
      typeof target.id !== 'string' ||
      ids.has(target.id) ||
      typeof target.adapterID !== 'string' ||
      !target.source ||
      !Number.isInteger(target.source.libraryID) ||
      typeof target.source.itemKey !== 'string' ||
      target.id !== `${target.source.libraryID}:${target.source.itemKey}` ||
      typeof target.title !== 'string' ||
      (target.collectionID !== null && !Number.isInteger(target.collectionID)) ||
      typeof target.autoUpdate !== 'boolean' ||
      typeof target.includeSecrets !== 'boolean' ||
      typeof target.includeLibrarySettings !== 'boolean' ||
      !['ready', 'paused', 'error'].includes(target.status) ||
      typeof target.message !== 'string' ||
      typeof target.updatedAt !== 'string' ||
      typeof expected.path !== 'string' ||
      typeof expected.digest !== 'string' ||
      typeof expected.title !== 'string' ||
      !Array.isArray(expected.collections) ||
      !expected.collections.every(Number.isInteger) ||
      typeof binding?.template !== 'string' ||
      !(binding.semantic === null || typeof binding.semantic === 'string')
    )
      reject(
        'binding-storage',
        'Local snapshot bindings are invalid. No attachments were changed.',
      );
    validatePolicy(target);
    ids.add(target.id);
  }
  // Copy only the known profile schema. Unknown persisted keys (including credentials) are never re-saved.
  return value.map((binding: Binding) => ({
    target: {
      id: binding.target.id,
      adapterID: binding.target.adapterID,
      source: {
        libraryID: binding.target.source.libraryID,
        itemKey: binding.target.source.itemKey,
        title: binding.target.source.title,
      },
      title: binding.target.title,
      collectionID: binding.target.collectionID,
      container: binding.target.container,
      autoUpdate: binding.target.autoUpdate,
      includeSecrets: binding.target.includeSecrets,
      includeLibrarySettings: binding.target.includeLibrarySettings,
      status: binding.target.status,
      message: binding.target.message,
      updatedAt: binding.target.updatedAt,
    },
    expected: {
      path: binding.expected.path,
      digest: binding.expected.digest,
      title: binding.expected.title,
      collections: [...binding.expected.collections],
    },
    semantic: binding.semantic,
    template: binding.template,
  }));
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
  let timer: { window: Window; id: number } | null = null;
  let scheduler: AbortController | null = null;
  let schedulerGeneration = 0;
  let backgroundFailure: SettingsSnapshotError | null = null;

  function fence<T extends SettingsOperationContext>(context: T): T {
    return { ...context, isCurrent: () => !disposed && context.isCurrent() };
  }
  async function initialize(context: SettingsOperationContext): Promise<void> {
    assertSettingsCurrent(context);
    await initializeManagedSnapshots();
    assertSettingsCurrent(context);
    if (bindings === null) bindings = loadBindings(readManagedSnapshotBindings());
  }
  function serialized<T>(
    context: SettingsOperationContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = queue.then(async () => {
      assertSettingsCurrent(context);
      await initialize(context);
      return operation();
    });
    queue = result.catch(() => undefined);
    return result;
  }
  function save(next: Binding[]): void {
    writeManagedSnapshotBindings(next);
    bindings = next;
  }
  function replace(binding: Binding): void {
    save(
      (bindings ?? []).map((entry) => (entry.target.id === binding.target.id ? binding : entry)),
    );
  }
  function get(id: string): Binding {
    const binding = bindings?.find((entry) => entry.target.id === id);
    if (!binding) reject('missing-binding', 'This device has no binding for the snapshot.');
    return binding;
  }
  function visible(target: ManagedSnapshotTarget): ManagedSnapshotTarget {
    return { ...target, source: { ...target.source } };
  }
  async function template(
    adapterID: string,
    context: SettingsOperationContext,
  ): Promise<SnapshotPluginTemplate> {
    const templates = await catalog.list(context);
    assertSettingsCurrent(context);
    const current = templates.find(
      (entry) =>
        entry.adapterID === adapterID &&
        (entry.status === 'builtin' || entry.status === 'reviewed'),
    );
    if (!current || !catalog.adapters.some((adapter) => adapter.id === adapterID))
      reject(
        'incompatible-template',
        'The plugin or its locally reviewed field template is unavailable. Create a new snapshot after reviewing the current template.',
      );
    return current;
  }
  function paused(binding: Binding, error: unknown): void {
    const known =
      error instanceof SettingsSnapshotError
        ? error
        : new SettingsSnapshotError(
            'managed-operation-failed',
            'The managed snapshot operation failed. Existing attachment data was retained; inspect it before creating a new binding.',
          );
    replace({
      ...binding,
      target: { ...binding.target, status: 'paused', message: known.message },
    });
  }
  async function refresh(binding: Binding, context: SettingsOperationContext): Promise<Binding> {
    const current = await carrier.inspect(binding.target.source, binding.expected, context);
    assertSettingsCurrent(context);
    if (JSON.stringify(current.identity) === JSON.stringify(binding.expected)) return binding;
    const collectionID =
      binding.target.collectionID !== null &&
      current.identity.collections.includes(binding.target.collectionID)
        ? binding.target.collectionID
        : (current.identity.collections[0] ?? null);
    const next: Binding = {
      ...binding,
      expected: current.identity,
      target: {
        ...binding.target,
        source: current.source,
        title: current.identity.title,
        collectionID,
      },
    };
    replace(next);
    return next;
  }
  async function publish(
    binding: Binding,
    password: string,
    context: SettingsCryptoContext,
    automatic: boolean,
  ): Promise<ManagedSnapshotTarget> {
    validatePolicy(binding.target);
    if (binding.target.status !== 'ready')
      reject(
        'paused-target',
        'This target is paused. Preserve or inspect the attachment, then explicitly create a new snapshot to resume.',
      );
    if (SETTINGS_CONTAINERS[binding.target.container].requiresPassword && !password)
      reject('invalid-password', 'A non-empty password is required');
    try {
      const current = await template(binding.target.adapterID, context);
      if (current.revision !== binding.template)
        reject(
          'incompatible-template',
          'The reviewed template changed. Existing snapshot data is preserved; create a new snapshot using the current template.',
        );
      binding = await refresh(binding, context);
      const captured = await service.capture(new Set([binding.target.adapterID]), {
        ...context,
        container: binding.target.container,
        includeSecrets: binding.target.includeSecrets,
        includeLibrarySettings: binding.target.includeLibrarySettings,
      });
      assertSettingsCurrent(context);
      if (captured.issues.some((issue) => issue.severity === 'error'))
        reject('capture-failed', 'The selected plugin settings could not be captured completely.');
      const identity = binding.target.container === 'json' ? semantic(captured.document) : null;
      if (automatic && identity === binding.semantic) return visible(binding.target);
      const text = await codec.seal(captured.document, password, context, binding.target.container);
      assertSettingsCurrent(context);
      const stored = await carrier.publish(binding.target.source, binding.expected, text, context);
      assertSettingsCurrent(context);
      const next: Binding = {
        ...binding,
        expected: stored.identity,
        semantic: identity,
        target: {
          ...binding.target,
          source: stored.source,
          updatedAt: new Date().toISOString(),
          message: SYNC_NOTICE,
        },
      };
      replace(next);
      return visible(next.target);
    } catch (error) {
      if (!disposed && !context.signal.aborted && context.isCurrent()) {
        if (automatic && error instanceof SettingsSnapshotError && error.code === 'busy') {
          replace({
            ...binding,
            target: {
              ...binding.target,
              message: 'Auto-update deferred while another settings operation is running.',
            },
          });
        } else paused(binding, error);
      }
      throw error;
    }
  }
  function stopScheduler(): void {
    schedulerGeneration++;
    scheduler?.abort();
    scheduler = null;
    if (timer) timer.window.clearTimeout(timer.id);
    timer = null;
  }
  function schedule(): void {
    if (disposed || !windows.size || timer || !scheduler) return;
    const window = windows.values().next().value as Window;
    const controller = scheduler;
    const generation = schedulerGeneration;
    timer = {
      window,
      id: window.setTimeout(() => {
        timer = null;
        const context = fence({
          window,
          signal: controller.signal,
          isCurrent: () => generation === schedulerGeneration && windows.size > 0,
        });
        void serialized(context, async () => {
          const targets = [...(bindings ?? [])].filter(
            (binding) => binding.target.status === 'ready' && binding.target.autoUpdate,
          );
          for (const binding of targets) {
            assertSettingsCurrent(context);
            try {
              await publish(binding, '', context, true);
            } catch (error) {
              if (controller.signal.aborted || !context.isCurrent()) return;
              reportManagedSnapshotFailure();
              if (!(error instanceof SettingsSnapshotError) || error.code === 'binding-storage')
                backgroundFailure = new SettingsSnapshotError(
                  'scheduler-failed',
                  'Snapshot auto-update failed and local status could not be confirmed; inspect the attachment and profile binding storage.',
                );
            }
          }
        })
          .catch(() => {
            if (!context.isCurrent() || controller.signal.aborted) return;
            backgroundFailure = new SettingsSnapshotError(
              'scheduler-failed',
              'Snapshot auto-update could not initialize. No attachment was automatically restored.',
            );
            reportManagedSnapshotFailure();
          })
          .finally(() => {
            if (generation === schedulerGeneration) schedule();
          });
      }, POLL_MS),
    };
  }

  return {
    start(window): Cleanup {
      if (disposed) return () => undefined;
      const lease = {};
      windows.set(lease, window);
      if (!scheduler) {
        scheduler = new (window as Window & typeof globalThis).AbortController();
        const controller = scheduler;
        const generation = schedulerGeneration;
        const context = fence({
          signal: controller.signal,
          isCurrent: () => generation === schedulerGeneration && windows.size > 0,
        });
        void serialized(context, async () => {
          await catalog.list(context);
          assertSettingsCurrent(context);
        })
          .then(() => {
            if (context.isCurrent() && !controller.signal.aborted) schedule();
          })
          .catch(() => {
            if (!context.isCurrent() || controller.signal.aborted) return;
            backgroundFailure = new SettingsSnapshotError(
              'scheduler-initialization',
              'Snapshot auto-update initialization failed. Open Settings Snapshots to inspect local state.',
            );
            reportManagedSnapshotFailure();
          });
      }
      return () => {
        windows.delete(lease);
        if (!windows.size) stopScheduler();
        else if (timer?.window === window) {
          timer.window.clearTimeout(timer.id);
          timer = null;
          schedule();
        }
      };
    },
    list(context) {
      const current = fence(context);
      return serialized(current, async () => {
        if (backgroundFailure) throw backgroundFailure;
        for (const binding of [...(bindings ?? [])]) {
          if (binding.target.status !== 'ready') continue;
          try {
            const currentTemplate = await template(binding.target.adapterID, current);
            if (currentTemplate.revision !== binding.template)
              reject(
                'incompatible-template',
                'The reviewed template changed. Create a new snapshot to use it.',
              );
            await refresh(binding, current);
          } catch (error) {
            assertSettingsCurrent(current);
            paused(binding, error);
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
      return serialized(current, async () => (await carrier.read(source, current)).text);
    },
    create(request, password, context) {
      const current = fence(context);
      return serialized(current, async () => {
        if (request.consent !== true)
          reject(
            'consent-required',
            'Explicit consent is required: this creates a visible library attachment containing selected settings, and availability on other devices requires both Zotero data sync and attachment file sync.',
          );
        validatePolicy(request);
        title(request.title);
        const currentTemplate = await template(request.adapterID, current);
        const captured = await service.capture(new Set([request.adapterID]), {
          ...current,
          container: request.container,
          includeSecrets: request.includeSecrets,
          includeLibrarySettings: request.includeLibrarySettings,
        });
        assertSettingsCurrent(current);
        if (captured.issues.some((issue) => issue.severity === 'error'))
          reject(
            'capture-failed',
            'The selected plugin settings could not be captured completely.',
          );
        const text = await codec.seal(captured.document, password, current, request.container);
        assertSettingsCurrent(current);
        const stored = await carrier.create(request, text, current);
        assertSettingsCurrent(current);
        const target: ManagedSnapshotTarget = {
          id: `${stored.source.libraryID}:${stored.source.itemKey}`,
          adapterID: request.adapterID,
          source: stored.source,
          title: request.title,
          collectionID: request.collectionID,
          container: request.container,
          autoUpdate: request.autoUpdate,
          includeSecrets: request.includeSecrets,
          includeLibrarySettings: request.includeLibrarySettings,
          status: 'ready',
          message: SYNC_NOTICE,
          updatedAt: new Date().toISOString(),
        };
        save([
          ...(bindings ?? []),
          {
            target,
            expected: stored.identity,
            semantic: request.container === 'json' ? semantic(captured.document) : null,
            template: currentTemplate.revision,
          },
        ]);
        return visible(target);
      });
    },
    update(id, password, context) {
      const current = fence(context);
      return serialized(current, () => publish(get(id), password, current, false));
    },
    configure(id, options, context) {
      const current = fence(context);
      return serialized(current, async () => {
        let binding = get(id);
        validatePolicy({ ...binding.target, autoUpdate: options.autoUpdate });
        title(options.title);
        try {
          if (binding.target.status !== 'ready')
            reject(
              'paused-target',
              'This binding is paused. Create a new snapshot rather than overwriting recovery data.',
            );
          const assertBaseline = () => {
            if (
              binding.target.title !== options.expected.title ||
              binding.target.collectionID !== options.expected.collectionID ||
              binding.target.autoUpdate !== options.expected.autoUpdate
            )
              reject(
                'stale-target',
                'The target changed after configuration was opened. Existing metadata was preserved; refresh and reopen the configuration.',
              );
          };
          assertBaseline();
          const currentTemplate = await template(binding.target.adapterID, current);
          if (currentTemplate.revision !== binding.template)
            reject(
              'incompatible-template',
              'The reviewed template changed. Create a new snapshot using the current template.',
            );
          binding = await refresh(binding, current);
          assertBaseline();
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
          const next: Binding = {
            ...binding,
            expected: stored.identity,
            target: {
              ...binding.target,
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
            current.isCurrent() &&
            !current.signal.aborted &&
            !(error instanceof SettingsSnapshotError && error.code === 'stale-target')
          )
            paused(binding, error);
          throw error;
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
      stopScheduler();
      windows.clear();
    },
  };
}
