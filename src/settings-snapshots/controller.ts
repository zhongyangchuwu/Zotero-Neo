import type { Cleanup } from '../core/cleanup';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import type {
  SettingsFileChoice,
  SettingsSnapshotFiles,
} from '../platform/settings-snapshots-files';
import type { NativeReactView } from '../ui/react/types';
import { PREPARATION_BACKDROP_STYLE, PREPARATION_PANEL_STYLE } from '../ui/react/shells/reader';
import {
  SettingsSnapshotError,
  type SettingsCryptoContext,
  type SettingsDocument,
  type SettingsFileCodec,
  type SettingsPlanContext,
  type SettingsRestoreReceipt,
  type SettingsContainer,
} from './contracts';
import { assertSettingsCurrent, settingStateText } from './document';
import { settingsChangeID, SettingsSnapshotService, type SettingsSnapshotPlan } from './service';
import type {
  SettingsSnapshotCommand,
  SettingsSnapshotField,
  SettingsSnapshotModel,
} from './react-model';
import { settingsContainerFor } from './codec';
import type {
  ManagedSettingsSnapshotsPort,
  ManagedSnapshotTarget,
  SettingsTemplateCatalogPort,
  SnapshotAttachmentSource,
  SnapshotLibraryLocation,
  SnapshotPluginTemplate,
} from './ports';
import type { SnapshotTargetForm } from './react-model';

export interface SettingsSnapshotPresentation {
  readonly window: Window;
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
}
export interface SettingsSnapshotPort {
  open(host: SettingsSnapshotPresentation): Cleanup | null;
  handleKey(event: KeyboardEvent): boolean;
  closeOwner(window: Window): void;
}
interface SnapshotView {
  readonly host: SettingsSnapshotPresentation;
  readonly root: HTMLElement;
  readonly backdrop: HTMLElement;
  readonly focus: HTMLElement | null;
  readonly untheme: Cleanup;
  readonly capture: (event: KeyboardEvent) => void;
  readonly unload: () => void;
  readonly adapters: Set<string>;
  readonly selected: Set<string>;
  readonly paths: Record<string, string>;
  react: NativeReactView<SettingsSnapshotModel> | null;
  mode: 'export' | 'import';
  includeSecrets: boolean;
  includeLibrarySettings: boolean;
  busy: boolean;
  composition: boolean;
  status: string;
  error: boolean;
  sourcePath: string;
  backup: SettingsFileChoice | null;
  issues: readonly string[];
  receipt?: SettingsRestoreReceipt;
  document?: SettingsDocument;
  plan?: SettingsSnapshotPlan;
  /** Operation-only business memory; never persisted, rendered, logged or included in commands. */
  backupPassword: string;
  sourceContents: string;
  source?: SnapshotAttachmentSource;
  sourceContainer?: SettingsContainer;
  container: SettingsContainer;
  plugins: readonly SnapshotPluginTemplate[];
  review: Map<string, Map<string, { portable: boolean; secret: boolean }>>;
  targets: readonly ManagedSnapshotTarget[];
  locations: readonly SnapshotLibraryLocation[];
  sources: readonly SnapshotAttachmentSource[];
  sourceLibraryID: number;
  targetForm: SnapshotTargetForm;
  targetBaseline?: ManagedSnapshotTarget;
  abort?: AbortController;
}

/** One application-owned dialog; adapters own semantics and files own ciphertext publication. */
export class SettingsSnapshotController implements SettingsSnapshotPort {
  readonly #service: SettingsSnapshotService;
  readonly #codec: SettingsFileCodec;
  readonly #files: SettingsSnapshotFiles;
  readonly #debug: (message: string) => void;
  readonly #catalog?: SettingsTemplateCatalogPort;
  readonly #managed?: ManagedSettingsSnapshotsPort;
  #view: SnapshotView | null = null;
  constructor(
    service: SettingsSnapshotService,
    codec: SettingsFileCodec,
    files: SettingsSnapshotFiles,
    debug: (message: string) => void,
    dependencies: {
      readonly catalog?: SettingsTemplateCatalogPort;
      readonly managed?: ManagedSettingsSnapshotsPort;
    } = {},
  ) {
    this.#service = service;
    this.#codec = codec;
    this.#files = files;
    this.#debug = debug;
    this.#catalog = dependencies.catalog;
    this.#managed = dependencies.managed;
  }
  #text(view: SnapshotView, cn: string, en: string): string {
    return view.host.language() === 'zh-CN' ? cn : en;
  }
  #current(view: SnapshotView): boolean {
    return (
      this.#view === view &&
      view.host.isCurrent() &&
      !isDeadObject(view.root) &&
      view.root.isConnected
    );
  }
  open(host: SettingsSnapshotPresentation): Cleanup | null {
    if (!host.isCurrent()) return null;
    this.close();
    const doc = host.window.document;
    const backdrop = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLElement;
    backdrop.style.cssText = PREPARATION_BACKDROP_STYLE;
    const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'section') as HTMLElement;
    root.style.cssText = PREPARATION_PANEL_STYLE;
    root.className = 'neo-ui';
    root.dataset.neoSettingsSnapshots = '1';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute(
      'aria-label',
      host.language() === 'zh-CN' ? '设置快照' : 'Settings snapshots',
    );
    const focus = doc.activeElement as HTMLElement | null;
    backdrop.append(root);
    doc.documentElement.append(backdrop);
    const view: SnapshotView = {
      host,
      root,
      backdrop,
      focus,
      untheme: host.themeRoot(backdrop),
      capture: (event) => {
        this.handleKey(event);
      },
      unload: () => this.closeOwner(host.window),
      adapters: new Set(this.#service.adapters.map(({ id }) => id)),
      selected: new Set(),
      paths: Object.create(null) as Record<string, string>,
      react: null,
      mode: 'export',
      includeSecrets: false,
      includeLibrarySettings: false,
      busy: false,
      composition: false,
      status: '',
      error: false,
      sourcePath: '',
      backup: null,
      issues: [],
      backupPassword: '',
      sourceContents: '',
      container: 'age',
      plugins: [],
      review: new Map(),
      targets: [],
      locations: [],
      sources: [],
      sourceLibraryID: 0,
      targetForm: {
        adapterID: this.#service.adapters[0]?.id ?? '',
        libraryID: 0,
        collectionID: null,
        title: 'Settings snapshot',
        container: 'age',
        autoUpdate: false,
        includeSecrets: false,
        includeLibrarySettings: false,
        consent: false,
        editingID: null,
      },
    };
    this.#view = view;
    root.addEventListener('compositionstart', () => {
      view.composition = true;
    });
    root.addEventListener('compositionend', () => {
      view.composition = false;
    });
    host.window.addEventListener('keydown', view.capture, true);
    host.window.addEventListener('unload', view.unload, { once: true });
    view.react = mountNativeReactView<SettingsSnapshotModel, SettingsSnapshotCommand>({
      surface: 'settings-snapshots',
      root,
      model: this.#model(view),
      isCurrent: () => this.#current(view),
      loadingText: this.#text(view, '正在载入…', 'Loading…'),
      errorText: this.#text(view, '设置快照界面不可用', 'Settings snapshots interface unavailable'),
      onError: () => this.#debug('Settings snapshots interface failed'),
      dispatch: (command) => {
        if (this.#current(view)) this.#dispatch(view, command);
      },
    });
    root.focus();
    void view.react.ready
      .then(() => {
        if (this.#current(view) && root.contains(doc.activeElement))
          view.react?.getElement('close')?.focus();
      })
      .catch(() => this.#debug('Settings snapshots interface failed'));
    if (this.#catalog || this.#managed) this.#run(view, (context) => this.#refresh(view, context));
    return () => {
      if (this.#view === view) this.close();
    };
  }
  #model(view: SnapshotView): SettingsSnapshotModel {
    const groups = new Map<
      string,
      { id: string; label: string; selected: boolean; fields: SettingsSnapshotField[] }
    >();
    for (const plan of view.plan?.plans ?? [])
      for (const change of plan.changes) {
        const id = settingsChangeID(plan.adapterID, change.key),
          groupID = settingsChangeID(plan.adapterID, change.category);
        let group = groups.get(groupID);
        if (!group) {
          group = {
            id: groupID,
            label: `${plan.adapterID} · ${change.category}`,
            selected: true,
            fields: [],
          };
          groups.set(groupID, group);
        }
        const preview = (state: typeof change.before): string => {
          const value = settingStateText(state, change.secret);
          return value.length > 600 ? `${value.slice(0, 600)}… (${value.length})` : value;
        };
        const selected = view.selected.has(id);
        group.fields.push({
          id,
          label: change.label,
          before: preview(change.before),
          after: preview(change.after),
          selected,
          secret: change.secret,
          requiresRestart: change.requiresRestart,
          blocked: change.blocked,
          canMap: !!change.mapping,
        });
        if (!change.blocked && !selected) group.selected = false;
      }
    return {
      chinese: view.host.language() === 'zh-CN',
      container: view.container,
      sourceContainer: view.sourceContainer,
      catalogAvailable: !!this.#catalog,
      managedAvailable: !!this.#managed,
      plugins: view.plugins.map((plugin) => ({
        ...plugin,
        review: plugin.fields.map((field) => ({
          key: field.key,
          portable: view.review.get(plugin.pluginID)?.get(field.key)?.portable ?? false,
          secret: view.review.get(plugin.pluginID)?.get(field.key)?.secret ?? field.secret,
        })),
      })),
      targets: view.targets,
      locations: view.locations,
      sources: view.sources,
      sourceLibraryID: view.sourceLibraryID,
      targetForm: view.targetForm,
      mode: view.mode,
      adapters: this.#service.adapters.map((adapter) => ({
        ...adapter,
        selected: view.adapters.has(adapter.id),
      })),
      includeSecrets: view.includeSecrets,
      includeLibrarySettings: view.includeLibrarySettings,
      busy: view.busy,
      status: view.status,
      error: view.error,
      sourcePath: view.sourcePath,
      backupPath: view.backup?.path ?? '',
      groups: [...groups.values()],
      issues: view.issues,
      receipts:
        view.receipt?.entries.map(
          (entry) =>
            `${entry.adapterID} · ${entry.key}: ${entry.status}${entry.message ? ` — ${entry.message}` : ''}${entry.requiresRestart ? this.#text(view, '（需重启）', ' (restart required)') : ''}`,
        ) ?? [],
      canApply: !!view.plan && !!view.selected.size && !!view.backup && !!view.backupPassword,
      selectedCount: view.selected.size,
    };
  }
  #render(view: SnapshotView): void {
    if (this.#current(view)) view.react?.update(this.#model(view));
  }
  #password(view: SnapshotView, part: string): string {
    const input = view.react?.getElement(part) as HTMLInputElement | null;
    const value = input?.value ?? '';
    if (input) input.value = '';
    return value;
  }
  #clearReview(view: SnapshotView): void {
    view.backupPassword = '';
    view.sourceContents = '';
    view.document = undefined;
    view.plan = undefined;
    view.selected.clear();
  }
  #setPlan(view: SnapshotView, plan: SettingsSnapshotPlan, preserve?: ReadonlySet<string>): void {
    view.plan = plan;
    view.selected.clear();
    for (const adapter of plan.plans)
      for (const change of adapter.changes) {
        const id = settingsChangeID(adapter.adapterID, change.key);
        if (!change.blocked && (preserve ? preserve.has(id) : change.selected))
          view.selected.add(id);
      }
    view.issues = plan.issues.map(
      (issue) => `${issue.adapterID ?? ''}${issue.key ? ` · ${issue.key}` : ''}: ${issue.message}`,
    );
  }
  #run(
    view: SnapshotView,
    task: (context: SettingsCryptoContext & SettingsPlanContext) => Promise<void>,
  ): void {
    if (view.busy || !this.#current(view)) return;
    const abort = new (view.host.window as Window & typeof globalThis).AbortController();
    view.abort = abort;
    view.busy = true;
    view.error = false;
    const context = {
      window: view.host.window,
      signal: abort.signal,
      isCurrent: () => this.#current(view) && view.abort === abort,
      paths: { ...view.paths },
      container: view.mode === 'import' ? view.sourceContainer : view.container,
    };
    this.#render(view);
    void task(context)
      .catch((error: unknown) => {
        if (!this.#current(view)) return;
        view.error = !abort.signal.aborted;
        view.status = abort.signal.aborted
          ? this.#text(
              view,
              '已停止；已接纳的写入不会撤销。重新选择文件以检查当前配置。',
              'Stopped; admitted writes are not rolled back. Select the file again to inspect current settings.',
            )
          : error instanceof SettingsSnapshotError
            ? error.message
            : this.#text(
                view,
                '配置操作失败；未记录敏感错误信息。',
                'Settings operation failed; sensitive error details were not recorded.',
              );
        if (!(error instanceof SettingsSnapshotError))
          this.#debug('Settings snapshots operation failed');
      })
      .finally(() => {
        if (abort.signal.aborted) this.#clearReview(view);
        if (this.#current(view)) {
          view.busy = false;
          view.abort = undefined;
          this.#render(view);
        }
      });
  }
  async #refresh(view: SnapshotView, context: SettingsCryptoContext): Promise<void> {
    if (this.#catalog) {
      const plugins = await this.#catalog.list(context);
      assertSettingsCurrent(context);
      view.plugins = plugins;
      view.review.clear();
      for (const plugin of plugins)
        view.review.set(
          plugin.pluginID,
          new Map(
            plugin.fields.map((field) => [
              field.key,
              {
                portable:
                  field.supported &&
                  (plugin.status === 'builtin' || plugin.reviewedKeys.includes(field.key)),
                secret: field.secret,
              },
            ]),
          ),
        );
      const available = new Set(this.#service.adapters.map((adapter) => adapter.id));
      for (const id of view.adapters) {
        if (available.has(id)) continue;
        view.adapters.delete(id);
        view.issues = [
          ...view.issues,
          this.#text(
            view,
            `${id} 不再受支持，已跳过。`,
            `${id} is no longer supported and was skipped.`,
          ),
        ];
      }
      if (!view.targetForm.editingID && !available.has(view.targetForm.adapterID))
        view.targetForm = { ...view.targetForm, adapterID: this.#service.adapters[0]?.id ?? '' };
    }
    if (this.#managed) {
      const [targets, locations] = await Promise.all([
        this.#managed.list(context),
        this.#managed.locations(context),
      ]);
      assertSettingsCurrent(context);
      view.targets = targets;
      view.locations = locations;
      if (!locations.some((location) => location.libraryID === view.sourceLibraryID))
        view.sourceLibraryID = locations[0]?.libraryID ?? 0;
      if (
        !locations.some(
          (location) => location.libraryID === view.targetForm.libraryID && location.writable,
        )
      )
        view.targetForm = {
          ...view.targetForm,
          libraryID: locations.find((location) => location.writable)?.libraryID ?? 0,
          collectionID: null,
        };
      view.sources = view.locations.length
        ? await this.#managed.sources(view.sourceLibraryID, context)
        : [];
      assertSettingsCurrent(context);
    }
  }
  #readSource(view: SnapshotView, context: SettingsCryptoContext): Promise<string> {
    if (view.source && this.#managed) return this.#managed.read(view.source, context);
    return this.#files.read(view.sourcePath, context);
  }
  async #assertSourceCurrent(view: SnapshotView, context: SettingsCryptoContext): Promise<void> {
    const contents = await this.#readSource(view, context);
    assertSettingsCurrent(context);
    if (contents !== view.sourceContents) {
      this.#clearReview(view);
      throw new SettingsSnapshotError(
        'source-changed',
        this.#text(
          view,
          '来源内容已更改；请重新预览。',
          'Source contents changed; inspect the source again.',
        ),
      );
    }
  }
  #export(view: SnapshotView, adapterIDs: ReadonlySet<string>): void {
    const password = this.#password(view, 'export-password'),
      confirm = this.#password(view, 'export-confirm'),
      container = view.container;
    if (container === 'age' && (!password || password !== confirm)) {
      view.error = true;
      view.status = this.#text(
        view,
        '请输入一致的非空密码。',
        'Enter matching nonempty passwords.',
      );
      this.#render(view);
      return;
    }
    this.#run(view, async (operation) => {
      const context = { ...operation, container };
      const choice = await this.#files.chooseSave(
        view.host.window,
        `zotero-neo-settings-${new Date().toISOString().slice(0, 10)}.${container}`,
      );
      assertSettingsCurrent(context);
      if (!choice) return;
      const captured = await this.#service.capture(adapterIDs, {
        ...context,
        includeSecrets: container === 'age' && view.includeSecrets,
        includeLibrarySettings: view.includeLibrarySettings,
      });
      const contents = await this.#codec.seal(
        captured.document,
        container === 'age' ? password : '',
        context,
        container,
      );
      await this.#files.write(choice, contents, context);
      assertSettingsCurrent(context);
      view.issues = captured.issues.map(
        (issue) =>
          `${issue.adapterID ?? ''}${issue.key ? ` · ${issue.key}` : ''}: ${issue.message}`,
      );
      view.status = this.#text(
        view,
        '快照已保存并读回核对。请自行保管文件与密码。',
        'Snapshot saved and verified by readback. Keep the file and password yourself.',
      );
    });
  }
  #dispatch(view: SnapshotView, command: SettingsSnapshotCommand): void {
    if (command.type === 'close') {
      this.close(true);
      return;
    }
    if (command.type === 'stop') {
      view.abort?.abort();
      return;
    }
    if (view.busy) return;
    switch (command.type) {
      case 'refresh':
        this.#run(view, async (context) => {
          await this.#refresh(view, context);
          view.status = this.#text(view, '列表已刷新。', 'Lists refreshed.');
        });
        return;
      case 'container':
        view.container = command.value;
        if (command.value === 'json') view.includeSecrets = false;
        this.#password(view, 'export-password');
        this.#password(view, 'export-confirm');
        break;
      case 'review-field': {
        const plugin = view.plugins.find((entry) => entry.pluginID === command.pluginID),
          field = plugin?.fields.find((entry) => entry.key === command.key);
        if (field?.supported)
          view.review.get(command.pluginID)?.set(command.key, {
            portable: command.portable,
            secret: field.secret || command.secret,
          });
        break;
      }
      case 'scan':
      case 'review':
      case 'template-export': {
        const catalog = this.#catalog;
        if (!catalog) break;
        const plugin = view.plugins.find((entry) => entry.pluginID === command.id);
        this.#run(view, async (context) => {
          if (command.type === 'scan') {
            await catalog.scan(command.id, context);
          } else if (command.type === 'review' && plugin) {
            const fields = [...(view.review.get(command.id) ?? [])]
              .filter(([, field]) => field.portable)
              .map(([key, field]) => ({ key, secret: field.secret }));
            const reviewed = await catalog.review(command.id, plugin.revision, fields, context);
            assertSettingsCurrent(context);
            view.adapters.add(reviewed.adapterID);
            this.#clearReview(view);
          } else if (command.type === 'template-export') {
            const choice = await this.#files.chooseSave(
              view.host.window,
              'zotero-neo-settings-template.json',
            );
            assertSettingsCurrent(context);
            if (!choice) return;
            const text = await catalog.exportTemplate(command.id, context);
            await this.#files.write(choice, text, { ...context, container: 'json' });
          }
          await this.#refresh(view, context);
          view.status = this.#text(
            view,
            '模板操作完成；模板只包含字段元数据，不含配置值。',
            'Template operation completed; templates contain field metadata only, never settings values.',
          );
        });
        return;
      }
      case 'template-import': {
        const catalog = this.#catalog;
        if (!catalog) break;
        this.#run(view, async (context) => {
          const path = await this.#files.chooseOpen(view.host.window);
          assertSettingsCurrent(context);
          if (!path) return;
          const text = await this.#files.read(path, context);
          await catalog.importTemplate(text, context);
          this.#clearReview(view);
          await this.#refresh(view, context);
          view.status = this.#text(
            view,
            '模板已作为草稿导入；需重新检查本机字段并明确审核。',
            'Template imported as a draft; inspect local fields and explicitly review it again.',
          );
        });
        return;
      }
      case 'plugin-export':
        this.#export(view, new Set([command.id]));
        return;
      case 'target-form':
        view.targetForm = {
          ...command.value,
          autoUpdate: command.value.container === 'json' && command.value.autoUpdate,
          includeSecrets: command.value.container === 'age' && command.value.includeSecrets,
        };
        this.#password(view, 'managed-password');
        break;
      case 'target-cancel':
        view.targetForm = { ...view.targetForm, editingID: null, consent: false };
        delete view.targetBaseline;
        this.#password(view, 'managed-password');
        break;
      case 'target-edit': {
        const target = view.targets.find((entry) => entry.id === command.id);
        if (!target) break;
        view.targetBaseline = target;
        view.targetForm = {
          adapterID: target.adapterID,
          libraryID: target.source.libraryID,
          collectionID: target.collectionID,
          title: target.title,
          container: target.container,
          autoUpdate: target.autoUpdate,
          includeSecrets: target.includeSecrets,
          includeLibrarySettings: target.includeLibrarySettings,
          consent: false,
          editingID: target.id,
        };
        this.#password(view, 'managed-password');
        break;
      }
      case 'target-create':
      case 'target-save':
      case 'target-update':
      case 'target-forget': {
        const managed = this.#managed;
        if (!managed) break;
        const password = this.#password(view, 'managed-password'),
          form = view.targetForm,
          baseline = view.targetBaseline;
        this.#run(view, async (context) => {
          if (command.type === 'target-create') {
            await managed.create(
              {
                adapterID: form.adapterID,
                libraryID: form.libraryID,
                collectionID: form.collectionID,
                title: form.title,
                container: form.container,
                autoUpdate: form.container === 'json' && form.autoUpdate,
                includeSecrets: form.container === 'age' && form.includeSecrets,
                includeLibrarySettings: form.includeLibrarySettings,
                consent: form.consent,
              },
              form.container === 'age' ? password : '',
              { ...context, container: form.container },
            );
            view.targetForm = { ...form, consent: false };
          } else if (command.type === 'target-save' && form.editingID) {
            if (!baseline || baseline.id !== form.editingID)
              throw new SettingsSnapshotError(
                'stale-target',
                'Reopen the target configuration before saving.',
              );
            await managed.configure(
              form.editingID,
              {
                title: form.title,
                collectionID: form.collectionID,
                autoUpdate: form.container === 'json' && form.autoUpdate,
                expected: baseline,
              },
              context,
            );
            view.targetForm = { ...form, editingID: null, consent: false };
            delete view.targetBaseline;
          } else if (command.type === 'target-update') {
            const target = view.targets.find((entry) => entry.id === command.id);
            if (!target)
              throw new SettingsSnapshotError(
                'target-missing',
                'The snapshot target is no longer available.',
              );
            await managed.update(command.id, target.container === 'age' ? password : '', {
              ...context,
              container: target.container,
            });
          } else if (command.type === 'target-forget') {
            await managed.forget(command.id, context);
          }
          await this.#refresh(view, context);
          view.status = this.#text(
            view,
            '托管快照操作完成；忘记仅移除本机绑定，不会删除附件。',
            'Managed snapshot operation completed; forgetting removes only the local binding, never the attachment.',
          );
        });
        return;
      }
      case 'source-library':
        this.#run(view, async (context) => {
          if (!this.#managed) return;
          const sources = await this.#managed.sources(command.libraryID, context);
          assertSettingsCurrent(context);
          view.sourceLibraryID = command.libraryID;
          view.sources = sources;
        });
        return;
      case 'source': {
        const source = view.sources.find(
          (entry) => entry.libraryID === command.libraryID && entry.itemKey === command.itemKey,
        );
        if (!source) break;
        this.#clearReview(view);
        for (const key of Object.keys(view.paths)) delete view.paths[key];
        view.receipt = undefined;
        view.issues = [];
        view.source = source;
        view.sourcePath = source.title;
        view.sourceContainer = undefined;
        view.backup = null;
        view.mode = 'import';
        this.#password(view, 'import-password');
        this.#password(view, 'backup-password');
        view.status = this.#text(
          view,
          '已选择附件。预览不会写入配置。',
          'Attachment selected. Preview never writes settings.',
        );
        break;
      }
      case 'mode':
        this.#password(view, 'export-password');
        this.#password(view, 'export-confirm');
        this.#password(view, 'import-password');
        this.#password(view, 'backup-password');
        this.#password(view, 'managed-password');
        this.#clearReview(view);
        view.mode = command.value;
        view.receipt = undefined;
        view.status = '';
        view.error = false;
        view.issues = [];
        break;
      case 'adapter':
        if (this.#service.adapters.some(({ id }) => id === command.id)) {
          if (command.checked) view.adapters.add(command.id);
          else view.adapters.delete(command.id);
        }
        break;
      case 'include-secrets':
        view.includeSecrets = view.container === 'age' && command.checked;
        break;
      case 'include-library':
        view.includeLibrarySettings = command.checked;
        break;
      case 'field':
      case 'category':
        for (const plan of view.plan?.plans ?? [])
          for (const change of plan.changes) {
            const id = settingsChangeID(plan.adapterID, change.key);
            if (
              !change.blocked &&
              (command.type === 'field'
                ? id === command.id
                : settingsChangeID(plan.adapterID, change.category) === command.id)
            ) {
              if (command.checked) view.selected.add(id);
              else view.selected.delete(id);
            }
          }
        break;
      case 'export':
        this.#export(view, new Set(view.adapters));
        return;
      case 'choose-file':
        this.#clearReview(view);
        view.receipt = undefined;
        view.issues = [];
        this.#password(view, 'import-password');
        this.#password(view, 'backup-password');
        this.#run(view, async (context) => {
          const path = await this.#files.chooseOpen(view.host.window);
          assertSettingsCurrent(context);
          if (!path) return;
          for (const key of Object.keys(view.paths)) delete view.paths[key];
          view.sourcePath = path;
          view.source = undefined;
          view.sourceContainer = undefined;
          view.backup = null;
          view.status = this.#text(
            view,
            '输入源文件密码（仅 age 需要）以及独立的恢复前加密备份密码；尚未修改配置。',
            'Enter the source password (age only) and an independent encrypted-backup password; no settings have changed.',
          );
        });
        return;
      case 'inspect': {
        const password = this.#password(view, 'import-password'),
          backupPassword = this.#password(view, 'backup-password');
        if (!view.sourcePath || !backupPassword) {
          view.error = true;
          view.status = this.#text(
            view,
            '先选择来源并输入恢复前加密备份密码（导入明文也必须提供）。',
            'Choose a source and enter the encrypted-backup password, required even for plaintext imports.',
          );
          break;
        }
        this.#clearReview(view);
        view.receipt = undefined;
        view.issues = [];
        view.status = this.#text(
          view,
          '正在完整认证与解密；尚未修改配置…',
          'Authenticating and decrypting the complete file; no settings are changed…',
        );
        this.#run(view, async (context) => {
          const contents = await this.#readSource(view, context);
          assertSettingsCurrent(context);
          const container = settingsContainerFor(contents);
          view.sourceContainer = container;
          const sourceContext = { ...context, container };
          const document = await this.#codec.open(
            contents,
            container === 'age' ? password : '',
            sourceContext,
          );
          assertSettingsCurrent(sourceContext);
          const plan = await this.#service.plan(document, sourceContext);
          assertSettingsCurrent(context);
          // Each authenticated review gets a fresh destination, not an earlier overwrite grant.
          view.backup = view.source
            ? null
            : { path: this.#files.backupPath(view.sourcePath), replace: false };
          view.document = document;
          view.backupPassword = backupPassword;
          view.sourceContents = contents;
          view.sourceContainer = container;
          this.#setPlan(view, plan);
          view.status = this.#text(
            view,
            '请检查并选择恢复项。秘密不显示，长值预览会截断；写入前必须保存加密备份。',
            'Review and select settings. Secrets are hidden and long previews truncated; an encrypted backup must be saved before any write.',
          );
        });
        return;
      }
      case 'choose-backup':
        this.#run(view, async (context) => {
          const choice = await this.#files.chooseSave(
            view.host.window,
            'zotero-neo-settings-before.age',
          );
          assertSettingsCurrent(context);
          if (choice) view.backup = choice;
        });
        return;
      case 'map': {
        const change = view.plan?.plans
          .flatMap((plan) => plan.changes)
          .find((entry) => settingsChangeID(entry.adapterID, entry.key) === command.id);
        if (!change?.mapping || !view.document) break;
        const document = view.document,
          selected = new Set(view.selected);
        this.#run(view, async (context) => {
          const path = await this.#files.choosePath(view.host.window, change.mapping!.kind);
          assertSettingsCurrent(context);
          if (!path) return;
          view.paths[command.id] = path;
          const plan = await this.#service.plan(document, { ...context, paths: { ...view.paths } });
          assertSettingsCurrent(context);
          this.#setPlan(view, plan, selected);
        });
        return;
      }
      case 'apply': {
        if (!view.plan || !view.backupPassword || !view.backup || !view.selected.size) break;
        const plan = view.plan,
          password = view.backupPassword,
          backupChoice = view.backup;
        view.status = this.#text(
          view,
          '正在保存加密备份；完成后逐项恢复。停止不会撤销已接纳的写入。',
          'Saving an encrypted backup, then restoring each selected setting. Stop does not roll back admitted writes.',
        );
        this.#run(view, async (context) => {
          await this.#assertSourceCurrent(view, context);
          const receipt = await this.#service.apply(
            plan,
            new Set(view.selected),
            context,
            async (backup) => {
              const ciphertext = await this.#codec.seal(
                backup,
                password,
                { ...context, container: 'age' },
                'age',
              );
              await this.#files.write(backupChoice, ciphertext, context);
              assertSettingsCurrent(context);
              await this.#assertSourceCurrent(view, context);
              return backupChoice.path;
            },
          );
          this.#clearReview(view);
          view.receipt = receipt;
          view.error = receipt.entries.some(
            (entry) => entry.status === 'failed' || entry.status === 'conflict',
          );
          view.status = this.#text(
            view,
            receipt.cancelled
              ? '已停止；已接纳的修改保留。请核对逐项回执，备份使用独立的备份密码。'
              : view.error
                ? '部分恢复失败；已接纳的修改保留。请核对逐项回执，备份使用独立的备份密码。'
                : '恢复操作已完成。请核对逐项回执；需要回退时，以备份密码导入恢复前备份。',
            receipt.cancelled
              ? 'Stopped; admitted changes are retained. Inspect the receipts. Use the independent backup password.'
              : view.error
                ? 'Restore partially failed; admitted changes are retained. Inspect the receipts. Use the independent backup password.'
                : 'Restore completed. Inspect the receipts; import the pre-restore backup with its backup password to recover.',
          );
          if (receipt.entries.some((entry) => entry.requiresRestart))
            view.status += this.#text(
              view,
              ' 完全重启 Zotero 后再使用恢复的设置。',
              ' Completely restart Zotero before using the restored settings.',
            );
        });
        return;
      }
    }
    this.#render(view);
  }
  handleKey(event: KeyboardEvent): boolean {
    const view = this.#view,
      target = event.target as Node | null;
    if (
      !view ||
      !this.#current(view) ||
      !target ||
      target.ownerDocument !== view.root.ownerDocument
    )
      return false;
    event.stopImmediatePropagation();
    if (compositionOwnsKey(event, view.composition)) return true;
    const key = keyString(event);
    if (key === 'escape') {
      event.preventDefault();
      this.close(true);
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      view.react?.getElement('close')?.focus();
    } else if (key === 'tab' || key === 'shift+tab') {
      const controls = (
        Array.from(
          view.root.querySelectorAll<HTMLElement>('input,select,textarea,button,summary'),
        ) as HTMLElement[]
      ).filter((element) => !element.matches(':disabled') && element.getClientRects().length);
      if (key === 'tab' && target === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      } else if (key === 'shift+tab' && target === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
    }
    return true;
  }
  closeOwner(window: Window): void {
    if (this.#view?.host.window === window) this.close();
  }
  close(restore = false): void {
    const view = this.#view;
    if (!view) return;
    const ownedFocus = view.root.contains(view.root.ownerDocument.activeElement);
    this.#view = null;
    view.abort?.abort();
    this.#clearReview(view);
    for (const part of [
      'export-password',
      'export-confirm',
      'import-password',
      'backup-password',
      'managed-password',
    ])
      this.#password(view, part);
    if (!isDeadObject(view.host.window)) {
      view.host.window.removeEventListener('keydown', view.capture, true);
      view.host.window.removeEventListener('unload', view.unload);
    }
    try {
      view.react?.dispose();
    } finally {
      view.untheme();
      if (!isDeadObject(view.backdrop)) view.backdrop.remove();
    }
    if (restore && ownedFocus && view.host.isCurrent() && view.focus?.isConnected)
      view.focus.focus();
  }
  dispose(): void {
    this.close();
    this.#codec.dispose();
  }
}
