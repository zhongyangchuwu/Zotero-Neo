import type { Cleanup } from '../core/cleanup';
import { t } from '../i18n';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { compositionOwnsKey } from '../input/composition';
import { keyString } from '../input/keys';
import { isDeadObject } from '../platform/cross-compartment';
import { mountNativeReactView } from '../platform/native-ui';
import { openSettingsHelp } from '../platform/settings-help';
import type { SettingsSnapshotFiles } from '../platform/settings-snapshots-files';
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
import { assertSettingsCurrent } from './document';
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
  mode: SettingsSnapshotModel['mode'];
  reviewExport?: Set<string>;
  confirmingRestore: boolean;
  includeSecrets: boolean;
  includeLibrarySettings: boolean;
  busy: boolean;
  composition: boolean;
  status: string;
  error: boolean;
  sourcePath: string;
  issues: readonly string[];
  receipt?: SettingsRestoreReceipt;
  document?: SettingsDocument;
  plan?: SettingsSnapshotPlan;
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
      confirmingRestore: false,
      includeSecrets: false,
      includeLibrarySettings: false,
      busy: false,
      composition: false,
      status: '',
      error: false,
      sourcePath: '',
      issues: [],
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
    const language = view.host.language();
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
            label: `${this.#adapterLabel(view, plan.adapterID)} · ${change.category === 'Native options' ? this.#text(view, '常规设置', 'Native options') : change.category}`,
            selected: true,
            fields: [],
          };
          groups.set(groupID, group);
        }
        const preview = (state: typeof change.before): string => {
          if (state.kind === 'reset') return this.#text(view, '默认值', 'Default');
          if (change.secret)
            return state.value
              ? this.#text(view, '已设置', 'Set')
              : this.#text(view, '空', 'Empty');
          if (state.value === '') return this.#text(view, '空', 'Empty');
          if (typeof state.value === 'boolean')
            return state.value ? this.#text(view, '开启', 'On') : this.#text(view, '关闭', 'Off');
          const value = typeof state.value === 'string' ? state.value : JSON.stringify(state.value);
          return value.length > 600 ? `${value.slice(0, 600)}… (${value.length})` : value;
        };
        const selected = view.selected.has(id);
        const nativeLabelKey = `settingsSnapshot.nativePreference.${change.key}`;
        const nativeLabel =
          plan.adapterID === 'zotero' ? t(nativeLabelKey, language) : nativeLabelKey;
        group.fields.push({
          id,
          label: nativeLabel === nativeLabelKey ? change.label : nativeLabel,
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
      chinese: language === 'zh-CN',
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
      mode: view.reviewExport ? 'export' : view.mode,
      exportFromReview: !!view.reviewExport,
      confirmingRestore: view.confirmingRestore,
      adapters: this.#service.adapters.map((adapter) => ({
        ...adapter,
        selected: (view.reviewExport ?? view.adapters).has(adapter.id),
      })),
      includeSecrets: view.includeSecrets,
      includeLibrarySettings: view.includeLibrarySettings,
      busy: view.busy,
      status: view.status,
      error: view.error,
      sourceLabel: view.source?.title ?? view.sourcePath,
      hasPreview: !!view.plan,
      groups: [...groups.values()],
      issues: view.issues,
      receipts:
        view.receipt?.entries.map(
          (entry) =>
            `${this.#adapterLabel(view, entry.adapterID)} · ${entry.key}: ${entry.status}${entry.message ? ` — ${entry.message}` : ''}${entry.requiresRestart ? this.#text(view, '（需重启）', ' (restart required)') : ''}`,
        ) ?? [],
      canApply: !!view.plan && !!view.selected.size,
      selectedCount: view.selected.size,
    };
  }
  #adapterLabel(view: SnapshotView, id: string): string {
    return (
      view.plugins.find((plugin) => plugin.adapterID === id)?.label ??
      this.#service.adapters.find((adapter) => adapter.id === id)?.label ??
      id
    );
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
    view.confirmingRestore = false;
    view.sourceContents = '';
    view.document = undefined;
    view.plan = undefined;
    view.selected.clear();
  }
  #setPlan(view: SnapshotView, plan: SettingsSnapshotPlan, preserve?: ReadonlySet<string>): void {
    view.plan = plan;
    view.confirmingRestore = false;
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
        if (error instanceof SettingsSnapshotError && error.code === 'stale-plan')
          this.#clearReview(view);
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
        if (abort.signal.aborted && !view.reviewExport) this.#clearReview(view);
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
  #chooseSource(view: SnapshotView, path: string, source?: SnapshotAttachmentSource): void {
    this.#clearReview(view);
    for (const key of Object.keys(view.paths)) delete view.paths[key];
    view.receipt = undefined;
    view.issues = [];
    view.source = source;
    view.sourcePath = path;
    view.sourceContainer = undefined;
  }
  async #inspect(
    view: SnapshotView,
    context: SettingsCryptoContext & SettingsPlanContext,
    password = '',
  ): Promise<void> {
    const contents = await this.#readSource(view, context);
    assertSettingsCurrent(context);
    const container = settingsContainerFor(contents);
    view.sourceContainer = container;
    if (container === 'age' && !password) {
      view.status = this.#text(
        view,
        '输入来源密码以解锁预览。',
        'Enter the source password to unlock the preview.',
      );
      return;
    }
    const sourceContext = { ...context, container };
    const document = await this.#codec.open(
      contents,
      container === 'age' ? password : '',
      sourceContext,
    );
    assertSettingsCurrent(sourceContext);
    const plan = await this.#service.plan(document, sourceContext);
    assertSettingsCurrent(sourceContext);
    view.document = document;
    view.sourceContents = contents;
    this.#setPlan(view, plan);
    view.status = '';
  }
  async #assertSourceCurrent(view: SnapshotView, context: SettingsCryptoContext): Promise<void> {
    const contents = await this.#readSource(view, context);
    assertSettingsCurrent(context);
    if (contents !== view.sourceContents) {
      this.#clearReview(view);
      view.sourceContainer = undefined;
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
      if (!choice) {
        view.reviewExport = undefined;
        return;
      }
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
      const issues = captured.issues.map(
        (issue) =>
          `${issue.adapterID ? this.#adapterLabel(view, issue.adapterID) : ''}${issue.key ? ` · ${issue.key}` : ''}: ${issue.message}`,
      );
      view.issues = view.reviewExport ? [...view.issues, ...issues] : issues;
      const labels = captured.document.sections
        .map(({ adapterID }) => this.#adapterLabel(view, adapterID))
        .join('、');
      const fields = captured.document.sections.reduce(
        (count, section) => count + section.entries.length,
        0,
      );
      view.status = this.#text(
        view,
        `已保存到 ${choice.path}（${labels}；${fields} 项设置）。`,
        `Saved to ${choice.path} (${labels}; ${fields} settings).`,
      );
      view.reviewExport = undefined;
    });
  }
  #dispatch(view: SnapshotView, command: SettingsSnapshotCommand): void {
    if (command.type === 'close') {
      this.close(true);
      return;
    }
    if (command.type === 'help') {
      openSettingsHelp('snapshots');
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
        this.#password(view, 'import-password');
        this.#chooseSource(view, source.title, source);
        view.mode = 'import';
        this.#run(view, (context) => this.#inspect(view, context));
        return;
      }
      case 'mode':
        if (view.reviewExport || view.mode === command.value) break;
        this.#password(view, 'export-password');
        this.#password(view, 'export-confirm');
        this.#password(view, 'import-password');
        this.#password(view, 'managed-password');
        this.#clearReview(view);
        view.mode = command.value;
        view.receipt = undefined;
        view.status = '';
        view.error = false;
        view.issues = [];
        break;
      case 'adapter': {
        const adapters = view.reviewExport ?? view.adapters;
        if (this.#service.adapters.some(({ id }) => id === command.id)) {
          if (command.checked) adapters.add(command.id);
          else adapters.delete(command.id);
        }
        break;
      }
      case 'include-secrets':
        view.includeSecrets = view.container === 'age' && command.checked;
        break;
      case 'include-library':
        view.includeLibrarySettings = command.checked;
        break;
      case 'field':
      case 'category':
        view.confirmingRestore = false;
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
        this.#export(view, new Set(view.reviewExport ?? view.adapters));
        return;
      case 'choose-file':
        this.#run(view, async (context) => {
          const path = await this.#files.chooseOpen(view.host.window);
          assertSettingsCurrent(context);
          if (!path) return;
          this.#password(view, 'import-password');
          this.#chooseSource(view, path);
          await this.#inspect(view, { ...context, paths: {} });
        });
        return;
      case 'inspect': {
        if (!view.sourcePath) break;
        const password = this.#password(view, 'import-password');
        this.#clearReview(view);
        view.receipt = undefined;
        view.issues = [];
        this.#run(view, (context) => this.#inspect(view, context, password));
        return;
      }
      case 'export-current': {
        if (!view.plan || !view.selected.size || view.reviewExport) break;
        view.reviewExport = new Set(
          view.plan.plans
            .filter(({ adapterID, changes }) =>
              changes.some(({ key }) => view.selected.has(settingsChangeID(adapterID, key))),
            )
            .map(({ adapterID }) => adapterID),
        );
        view.includeSecrets = false;
        view.includeLibrarySettings = false;
        view.confirmingRestore = false;
        view.status = '';
        view.error = false;
        break;
      }
      case 'return-to-preview':
        this.#password(view, 'export-password');
        this.#password(view, 'export-confirm');
        view.reviewExport = undefined;
        view.status = '';
        view.error = false;
        break;
      case 'review-restore':
        if (view.plan && view.selected.size && !view.reviewExport) view.confirmingRestore = true;
        break;
      case 'cancel-restore':
        view.confirmingRestore = false;
        break;
      case 'map': {
        const change = view.plan?.plans
          .flatMap((plan) => plan.changes)
          .find((entry) => settingsChangeID(entry.adapterID, entry.key) === command.id);
        if (!change?.mapping || !view.document) break;
        view.confirmingRestore = false;
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
        if (!view.plan || !view.selected.size || !view.confirmingRestore || view.reviewExport)
          break;
        const plan = view.plan;
        view.confirmingRestore = false;
        view.status = this.#text(
          view,
          '正在检查并恢复所选设置…',
          'Checking and restoring selected settings…',
        );
        this.#run(view, async (context) => {
          const receipt = await this.#service.apply(plan, new Set(view.selected), context, () =>
            this.#assertSourceCurrent(view, context),
          );
          this.#clearReview(view);
          view.receipt = receipt;
          view.error = receipt.entries.some(
            (entry) => entry.status === 'failed' || entry.status === 'conflict',
          );
          view.status = this.#text(
            view,
            receipt.cancelled
              ? '已停止；已完成的修改保留。请核对逐项结果。'
              : view.error
                ? '部分恢复失败；已完成的修改保留。请核对逐项结果。'
                : '恢复已完成。请核对逐项结果。',
            receipt.cancelled
              ? 'Stopped; completed changes were kept. Review the individual results.'
              : view.error
                ? 'Restore partially failed; completed changes were kept. Review the individual results.'
                : 'Restore complete. Review the individual results.',
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
      if (!view.busy && view.reviewExport) this.#dispatch(view, { type: 'return-to-preview' });
      else if (!view.busy && view.confirmingRestore)
        this.#dispatch(view, { type: 'cancel-restore' });
      else this.close(true);
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
    for (const part of ['export-password', 'export-confirm', 'import-password', 'managed-password'])
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
