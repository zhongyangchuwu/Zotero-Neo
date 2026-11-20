import type { Cleanup } from '../core/cleanup';
import { actionText, t } from '../i18n';
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
  type SettingsChange,
  type SettingsFileCodec,
  type SettingsPlanContext,
  type SettingsRestoreReceipt,
  type SettingsContainer,
} from './contracts';
import { assertSettingsCurrent, sameSettingState } from './document';
import { settingsChangeID, SettingsSnapshotService, type SettingsSnapshotPlan } from './service';
import type {
  SettingsSnapshotCommand,
  SettingsSnapshotField,
  SettingsSnapshotModel,
} from './react-model';
import type { SnapshotTargetForm } from './react-model';
import { settingsContainerFor } from './codec';
import type {
  ManagedSettingsSnapshotsPort,
  ManagedSnapshotTarget,
  SettingsTemplateCatalogPort,
  SnapshotAttachmentSource,
  SnapshotLibraryLocation,
  SnapshotPluginTemplate,
} from './ports';

const DEFAULT_TARGET_TITLE = '[Zotero-Neo] 工作区同步';

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
  refreshChoices?: ReadonlySet<string>;
  awaitingUnlock: boolean;
  conflictTargetID?: string;
  targetPasswordAction?: SettingsSnapshotModel['targetPasswordAction'];
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
  targets: readonly ManagedSnapshotTarget[];
  locations: readonly SnapshotLibraryLocation[];
  sources: readonly SnapshotAttachmentSource[];
  sourceLibraryID: number;
  targetForm: SnapshotTargetForm;
  targetBaseline?: ManagedSnapshotTarget;
  targetScopeEdited: boolean;
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
    root.setAttribute('aria-label', actionText('openSettingsSnapshots', host.language()));
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
      awaitingUnlock: false,
      includeSecrets: false,
      includeLibrarySettings: false,
      busy: false,
      composition: false,
      status: '',
      error: false,
      sourcePath: '',
      issues: [],
      sourceContents: '',
      container: 'json',
      plugins: [],
      targets: [],
      locations: [],
      sources: [],
      sourceLibraryID: 0,
      targetForm: this.#newTargetForm([]),
      targetScopeEdited: false,
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
      errorText: this.#text(
        view,
        '工作区同步与备份界面不可用',
        'Workspace Sync & Backup is unavailable',
      ),
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
    if (this.#catalog || this.#managed)
      this.#run(view, (context) => this.#refresh(view, context, true));
    return () => {
      if (this.#view === view) this.close();
    };
  }
  #newTargetForm(locations: readonly SnapshotLibraryLocation[]): SnapshotTargetForm {
    return {
      adapterIDs: [],
      libraryID: locations.find(({ personal, writable }) => personal && writable)?.libraryID ?? 0,
      collectionID: null,
      title: DEFAULT_TARGET_TITLE,
      container: 'json',
      autoUpdate: true,
      includeSecrets: false,
      includeLibrarySettings: false,
      editingID: null,
    };
  }
  #canAdopt(plan: SettingsSnapshotPlan, selected?: ReadonlySet<string>): boolean {
    return (
      plan.issues.every(({ code }) => code === 'optional-theme-dependency') &&
      plan.plans.every(({ changes }) =>
        changes.every(
          (change) =>
            !change.blocked &&
            (sameSettingState(change.before, change.after) ||
              selected?.has(settingsChangeID(change.adapterID, change.key))),
        ),
      )
    );
  }
  #showsChange(view: SnapshotView, change: SettingsChange): boolean {
    return (
      !view.conflictTargetID || !!change.blocked || !sameSettingState(change.before, change.after)
    );
  }
  #model(view: SnapshotView): SettingsSnapshotModel {
    const language = view.host.language();
    const groups = new Map<
      string,
      { id: string; label: string; selected: boolean; fields: SettingsSnapshotField[] }
    >();
    for (const plan of view.plan?.plans ?? [])
      for (const change of plan.changes) {
        if (!this.#showsChange(view, change)) continue;
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
      title: actionText('openSettingsSnapshots', language),
      container: view.container,
      catalogAvailable: !!this.#catalog,
      managedAvailable: !!this.#managed,
      plugins: view.plugins.map((plugin) => ({
        ...plugin,
        review: plugin.fields.map((field) => ({
          key: field.key,
          portable:
            field.supported &&
            (plugin.status === 'builtin' ||
              (plugin.status === 'reviewed' && plugin.reviewedKeys.includes(field.key))),
          secret: field.secret,
        })),
      })),
      targets: view.targets,
      locations: view.locations,
      sources: view.sources,
      sourceLibraryID: view.sourceLibraryID,
      targetForm: view.targetForm.editingID
        ? view.targetForm
        : { ...view.targetForm, adapterIDs: [...view.adapters] },
      mode: view.reviewExport ? 'export' : view.mode,
      exportFromReview: !!view.reviewExport,
      needsDiffRefresh: !!view.refreshChoices,
      awaitingUnlock: view.awaitingUnlock,
      reviewingConflict: !!view.conflictTargetID,
      canAdoptUnchanged: !!view.conflictTargetID && !!view.plan && this.#canAdopt(view.plan),
      targetPasswordAction: view.targetPasswordAction,
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
    view.refreshChoices = undefined;
    view.awaitingUnlock = false;
    view.sourceContents = '';
    view.document = undefined;
    view.plan = undefined;
    view.selected.clear();
  }
  #invalidatePlan(view: SnapshotView): void {
    view.refreshChoices ??= new Set(view.selected);
    view.plan = undefined;
    view.selected.clear();
    view.issues = [];
  }
  #setPlan(view: SnapshotView, plan: SettingsSnapshotPlan, preserve?: ReadonlySet<string>): void {
    view.plan = plan;
    view.refreshChoices = undefined;
    view.selected.clear();
    for (const adapter of plan.plans)
      for (const change of adapter.changes) {
        const id = settingsChangeID(adapter.adapterID, change.key);
        if (
          !change.blocked &&
          this.#showsChange(view, change) &&
          (preserve ? preserve.has(id) : change.selected)
        )
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
        const code = error instanceof SettingsSnapshotError ? error.code : '';
        const sourceUnavailable = [
          'file-unavailable',
          'missing-attachment',
          'missing-file',
          'download-pending',
          'external-change',
          'attachment-read-failed',
        ].includes(code);
        const stale =
          view.plan &&
          (sourceUnavailable ||
            [
              'stale-plan',
              'source-changed',
              'unsupported-adapter',
              'unsupported-version',
              'blocked-setting',
            ].includes(code));
        if (stale) this.#invalidatePlan(view);
        view.error = !abort.signal.aborted;
        view.status = abort.signal.aborted
          ? this.#text(
              view,
              '已停止；已完成的写入不会撤销。请检查当前设置。',
              'Stopped; completed writes are not rolled back. Review current settings.',
            )
          : stale
            ? sourceUnavailable && error instanceof SettingsSnapshotError
              ? `${error.message} ${this.#text(view, '然后刷新差异。', 'Then refresh changes.')}`
              : this.#text(
                  view,
                  '来源或本机设置已更改。请刷新差异后再恢复。',
                  'Source contents changed or local settings changed. Refresh changes before restoring.',
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
        if (abort.signal.aborted && view.plan && !view.reviewExport) this.#invalidatePlan(view);
        if (this.#current(view)) {
          view.busy = false;
          view.abort = undefined;
          this.#render(view);
        }
      });
  }
  async #refresh(
    view: SnapshotView,
    context: SettingsCryptoContext,
    initial = false,
  ): Promise<void> {
    if (this.#catalog) {
      const plugins = await this.#catalog.list(context);
      assertSettingsCurrent(context);
      view.plugins = plugins;
      const available = new Set(this.#service.adapters.map((adapter) => adapter.id));
      if (initial) for (const id of available) view.adapters.add(id);
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
        view.sourceLibraryID =
          locations.find(({ personal }) => personal)?.libraryID ?? locations[0]?.libraryID ?? 0;
      if (
        !view.targetForm.editingID &&
        !locations.some(
          (location) => location.libraryID === view.targetForm.libraryID && location.writable,
        )
      )
        view.targetForm = {
          ...view.targetForm,
          libraryID: this.#newTargetForm(locations).libraryID,
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
  #chooseSource(
    view: SnapshotView,
    path: string,
    source?: SnapshotAttachmentSource,
    conflictTargetID?: string,
  ): void {
    this.#clearReview(view);
    for (const key of Object.keys(view.paths)) delete view.paths[key];
    view.receipt = undefined;
    view.issues = [];
    view.source = source;
    view.sourcePath = path;
    view.sourceContainer = undefined;
    view.conflictTargetID = conflictTargetID;
    view.status = '';
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
    // An already unlocked document is reusable only for the exact bytes we inspected.
    const unlocked = contents === view.sourceContents ? view.document : undefined;
    if (!unlocked) {
      if (view.document) for (const key of Object.keys(view.paths)) delete view.paths[key];
      view.document = undefined;
      view.sourceContents = '';
    }
    view.awaitingUnlock = container === 'age' && !unlocked;
    if (view.awaitingUnlock && !password) {
      view.status = view.refreshChoices
        ? this.#text(
            view,
            '加密来源已更改，请重新输入密码以刷新差异。',
            'The encrypted source changed. Enter its password again to refresh changes.',
          )
        : this.#text(view, '输入密码以查看差异。', 'Enter the password to view changes.');
      return;
    }
    const sourceContext = { ...context, container, paths: { ...view.paths } };
    const document =
      unlocked ??
      (await this.#codec.open(contents, container === 'age' ? password : '', sourceContext));
    assertSettingsCurrent(sourceContext);
    view.awaitingUnlock = false;
    view.document = document;
    view.sourceContents = contents;
    const plan = await this.#service.plan(document, sourceContext);
    assertSettingsCurrent(sourceContext);
    this.#setPlan(view, plan, view.refreshChoices);
    view.status = '';
  }
  async #assertSourceCurrent(view: SnapshotView, context: SettingsCryptoContext): Promise<void> {
    const contents = await this.#readSource(view, context);
    assertSettingsCurrent(context);
    if (contents !== view.sourceContents) {
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
    if (!adapterIDs.size) return;
    const container = view.container;
    const password = container === 'age' ? this.#password(view, 'export-password') : '';
    if (container === 'age' && !password) {
      view.error = true;
      view.status = this.#text(view, '请输入备份密码。', 'Enter a backup password.');
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
      const captured = await this.#service.capture(
        adapterIDs,
        {
          ...context,
          includeSecrets: container === 'age' && view.includeSecrets,
          includeLibrarySettings: view.includeLibrarySettings,
        },
        { skipFailedAdapters: true },
      );
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
      const skipped = captured.issues.filter(({ code }) => code === 'adapter-skipped').length;
      if (skipped)
        view.status += this.#text(
          view,
          ` 已跳过 ${skipped} 个设置来源，详见下方。`,
          ` ${skipped} settings sources were skipped; see details below.`,
        );
      view.reviewExport = undefined;
    });
  }
  #clearTargetPassword(view: SnapshotView): void {
    this.#password(view, 'managed-password');
    view.targetPasswordAction = undefined;
  }
  #resetTargetForm(view: SnapshotView): void {
    view.targetForm = this.#newTargetForm(view.locations);
    view.targetBaseline = undefined;
    view.targetScopeEdited = false;
    this.#clearTargetPassword(view);
  }
  async #refreshTargets(view: SnapshotView, context: SettingsCryptoContext): Promise<void> {
    if (!this.#managed) return;
    const targets = await this.#managed.list(context);
    assertSettingsCurrent(context);
    view.targets = targets;
  }
  #writeTarget(
    view: SnapshotView,
    command: NonNullable<SettingsSnapshotModel['targetPasswordAction']>,
  ): void {
    const managed = this.#managed;
    const target = view.targets.find(({ id }) => id === command.id);
    if (!managed || !target) return;
    const overwrite = command.type === 'target-overwrite';
    if (
      overwrite
        ? target.status !== 'conflict' ||
          !command.revision ||
          command.revision !== target.conflictRevision
        : target.status === 'conflict'
    ) {
      this.#clearTargetPassword(view);
      this.#render(view);
      return;
    }
    const previous = view.targetPasswordAction;
    if (
      target.container === 'age' &&
      (!previous ||
        previous.id !== command.id ||
        previous.type !== command.type ||
        (overwrite &&
          (previous.type !== 'target-overwrite' || previous.revision !== command.revision)))
    ) {
      this.#clearTargetPassword(view);
      view.targetPasswordAction = command;
      this.#render(view);
      return;
    }
    const password = target.container === 'age' ? this.#password(view, 'managed-password') : '';
    if (target.container === 'age' && !password) return;
    this.#clearTargetPassword(view);
    this.#run(view, async (operation) => {
      const context = { ...operation, container: target.container };
      try {
        const updated = overwrite
          ? await managed.overwrite(target.id, command.revision, password, context)
          : await managed.update(target.id, password, context);
        assertSettingsCurrent(context);
        view.targets = view.targets.map((entry) => (entry.id === updated.id ? updated : entry));
      } catch (error) {
        await this.#refreshTargets(view, context);
        if (
          !overwrite ||
          !(error instanceof SettingsSnapshotError) ||
          !['external-change', 'stale-conflict'].includes(error.code)
        )
          throw error;
        view.error = true;
        view.status = this.#text(
          view,
          '未能覆盖云端。冲突状态已刷新；请检查后再决定是否覆盖。',
          'Could not overwrite the cloud version. Conflict status was refreshed; review it before trying again.',
        );
        return;
      }
      view.status = overwrite
        ? this.#text(
            view,
            '已用本机设置覆盖云端。',
            'Cloud settings were replaced with local settings.',
          )
        : this.#text(view, '已更新文库中的备份。', 'The library backup was updated.');
    });
  }
  #apply(view: SnapshotView): void {
    const { plan, document, conflictTargetID } = view;
    if (!plan || !document || view.reviewExport) return;
    const selected = new Set(view.selected);
    const managed = conflictTargetID ? this.#managed : undefined;
    const resolving = !!managed;
    const coversDiff = resolving && this.#canAdopt(plan, selected);
    if (!selected.size && !coversDiff) return;
    view.status = this.#text(
      view,
      '正在检查并恢复所选设置…',
      'Checking and restoring selected settings…',
    );
    this.#run(view, async (context) => {
      const receipt = selected.size
        ? await this.#service.apply(plan, selected, context, () =>
            this.#assertSourceCurrent(view, context),
          )
        : undefined;
      view.receipt = receipt;
      const successful =
        !receipt ||
        (!receipt.cancelled &&
          receipt.entries.length === selected.size &&
          receipt.entries.every(({ status }) => status === 'applied' || status === 'unchanged'));
      let adopted = false;
      if (managed && conflictTargetID && coversDiff && successful) {
        try {
          // Recheck even unchanged rows: a setting may have drifted after the preview.
          const current = await this.#service.plan(document, context);
          if (this.#canAdopt(current)) {
            await this.#assertSourceCurrent(view, context);
            const target = await managed.adoptCloud(conflictTargetID, view.sourceContents, context);
            assertSettingsCurrent(context);
            view.targets = view.targets.map((entry) => (entry.id === target.id ? target : entry));
            adopted = target.status === 'ready';
          }
        } catch {
          // Local writes, if any, have already completed. Never substitute a cloud upload.
          if (!context.signal.aborted && context.isCurrent()) {
            try {
              await this.#refreshTargets(view, context);
            } catch {
              this.#debug('Settings snapshot target status refresh failed');
            }
          }
        }
      }
      if (resolving && !adopted) this.#invalidatePlan(view);
      else this.#clearReview(view);
      view.error = !successful || (coversDiff && !adopted);
      view.status = receipt?.cancelled
        ? this.#text(
            view,
            '已停止；已完成的修改保留。请核对逐项结果。',
            'Stopped; completed changes were kept. Review the individual results.',
          )
        : !successful
          ? this.#text(
              view,
              '部分恢复失败；已完成的修改保留。请核对逐项结果。',
              'Restore partially failed; completed changes were kept. Review the individual results.',
            )
          : selected.size
            ? this.#text(view, '已恢复所选设置。', 'Selected settings restored.')
            : '';
      if (resolving)
        view.status = [
          view.status,
          adopted
            ? this.#text(view, '已采用云端版本。', 'Cloud version adopted.')
            : this.#text(
                view,
                '同步仍暂停：必须完整应用当前云端版本才能继续。不会自动覆盖云端。',
                'Sync stays paused until the current cloud version is fully applied. Nothing was uploaded.',
              ),
        ]
          .filter(Boolean)
          .join(' ');
      if (receipt?.entries.some((entry) => entry.requiresRestart))
        view.status += this.#text(
          view,
          ' 完全重启 Zotero 后再使用恢复的设置。',
          ' Completely restart Zotero before using the restored settings.',
        );
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
        this.#clearTargetPassword(view);
        this.#run(view, async (context) => {
          await this.#refresh(view, context);
          view.status = this.#text(view, '列表已刷新。', 'Lists refreshed.');
        });
        return;
      case 'container':
        if (command.value !== view.container) {
          this.#password(view, 'export-password');
          view.container = command.value;
          if (command.value === 'json') view.includeSecrets = false;
        }
        break;
      case 'review-field': {
        const plugin = view.plugins.find((entry) => entry.pluginID === command.pluginID),
          field = plugin?.fields.find((entry) => entry.key === command.key);
        const catalog = this.#catalog;
        if (
          !catalog ||
          !plugin ||
          !field?.supported ||
          plugin.status === 'builtin' ||
          plugin.status === 'unavailable'
        )
          break;
        const current = new Set(plugin.status === 'reviewed' ? plugin.reviewedKeys : []);
        const fields = plugin.fields.flatMap((candidate) => {
          if (!candidate.supported) return [];
          const edited = candidate.key === command.key;
          const portable = edited ? command.portable : current.has(candidate.key);
          const secret = candidate.secret || (edited && command.secret);
          return portable || (edited && secret)
            ? [{ key: candidate.key, secret, ...(portable ? {} : { portable: false }) }]
            : [];
        });
        this.#run(view, async (context) => {
          const reviewed = await catalog.review(plugin.pluginID, plugin.revision, fields, context);
          assertSettingsCurrent(context);
          if (command.portable && reviewed.reviewedKeys.includes(command.key))
            view.adapters.add(reviewed.adapterID);
          if (view.plan) this.#invalidatePlan(view);
          await this.#refresh(view, context);
          view.status = this.#text(view, '已更新本机字段选择。', 'Local field selection updated.');
        });
        return;
      }
      case 'scan':
      case 'template-export': {
        const catalog = this.#catalog;
        if (!catalog) break;
        this.#run(view, async (context) => {
          if (command.type === 'scan') {
            await catalog.scan(command.id, context);
            if (view.plan) this.#invalidatePlan(view);
          } else {
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
          if (view.plan) this.#invalidatePlan(view);
          await this.#refresh(view, context);
          view.status = this.#text(
            view,
            '已导入草稿；只有勾选本机支持的字段后，才能备份或恢复这些字段。',
            'Draft imported. Select supported local fields before backing them up or restoring them.',
          );
        });
        return;
      }
      case 'plugin-export':
        this.#export(view, new Set([command.id]));
        return;
      case 'target-form': {
        const previous = view.targetForm;
        const value = command.value;
        const editing = !!previous.editingID;
        const container = editing
          ? previous.container
          : value.includeSecrets
            ? 'age'
            : value.container;
        view.targetForm = {
          ...previous,
          title: value.title,
          collectionID: value.collectionID,
          libraryID: editing ? previous.libraryID : value.libraryID,
          container,
          autoUpdate: container === 'json' && value.autoUpdate,
          includeSecrets: editing ? previous.includeSecrets : value.includeSecrets,
          includeLibrarySettings: editing
            ? previous.includeLibrarySettings
            : value.includeLibrarySettings,
        };
        if (view.targetForm.container !== previous.container) this.#clearTargetPassword(view);
        break;
      }
      case 'target-password-cancel':
        this.#clearTargetPassword(view);
        break;
      case 'target-adapter': {
        if (view.targetBaseline?.kind !== 'workspace') break;
        const ids = new Set(view.targetForm.adapterIDs);
        if (command.checked) {
          if (!this.#service.adapters.some(({ id }) => id === command.id)) break;
          ids.add(command.id);
        } else {
          ids.delete(command.id);
        }
        view.targetScopeEdited = true;
        view.targetForm = { ...view.targetForm, adapterIDs: [...ids] };
        break;
      }
      case 'target-cancel':
        this.#resetTargetForm(view);
        break;
      case 'target-edit': {
        const target = view.targets.find((entry) => entry.id === command.id);
        if (!target || target.status === 'conflict') break;
        this.#clearTargetPassword(view);
        view.targetBaseline = target;
        view.targetScopeEdited = false;
        view.targetForm = {
          adapterIDs: target.adapterIDs,
          libraryID: target.source.libraryID,
          collectionID: target.collectionID,
          title: target.title,
          container: target.container,
          autoUpdate: target.autoUpdate,
          includeSecrets: target.includeSecrets,
          includeLibrarySettings: target.includeLibrarySettings,
          editingID: target.id,
        };
        break;
      }
      case 'target-update':
      case 'target-overwrite':
        this.#writeTarget(view, command);
        return;
      case 'target-preview': {
        const target = view.targets.find((entry) => entry.id === command.id);
        if (!target) break;
        this.#clearTargetPassword(view);
        this.#password(view, 'import-password');
        this.#chooseSource(
          view,
          target.title,
          target.source,
          target.status === 'conflict' ? target.id : undefined,
        );
        view.mode = 'import';
        this.#run(view, (context) => this.#inspect(view, context));
        return;
      }
      case 'target-create':
      case 'target-save':
      case 'target-forget': {
        const managed = this.#managed;
        if (!managed) break;
        const form = view.targetForm;
        const baseline = view.targetBaseline;
        const creating = command.type === 'target-create';
        const library = view.locations.find(({ libraryID }) => libraryID === form.libraryID);
        if (
          creating &&
          (form.editingID || !view.adapters.size || !library?.writable || !form.title.trim())
        )
          break;
        const password =
          creating && form.container === 'age' && !view.targetPasswordAction
            ? this.#password(view, 'managed-password')
            : '';
        if (creating && form.container === 'age' && !password) {
          view.error = true;
          view.status = this.#text(view, '请输入备份密码。', 'Enter a backup password.');
          break;
        }
        this.#clearTargetPassword(view);
        this.#run(view, async (context) => {
          if (command.type === 'target-create') {
            await managed.create(
              {
                adapterIDs: [...view.adapters],
                libraryID: form.libraryID,
                collectionID: form.collectionID,
                title: form.title,
                container: form.container,
                autoUpdate: form.container === 'json' && form.autoUpdate,
                includeSecrets: form.container === 'age' && form.includeSecrets,
                includeLibrarySettings: form.includeLibrarySettings,
              },
              form.container === 'age' ? password : '',
              { ...context, container: form.container },
            );
            this.#resetTargetForm(view);
          } else if (command.type === 'target-save' && form.editingID) {
            if (
              !baseline ||
              baseline.id !== form.editingID ||
              view.targets.some(({ id, status }) => id === baseline.id && status === 'conflict')
            )
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
                ...(view.targetScopeEdited && baseline.kind === 'workspace'
                  ? { adapterIDs: form.adapterIDs }
                  : {}),
                expected: baseline,
              },
              context,
            );
            this.#resetTargetForm(view);
          } else if (command.type === 'target-forget') {
            await managed.forget(command.id, context);
            if (form.editingID === command.id) this.#resetTargetForm(view);
          }
          await this.#refresh(view, context);
          view.status = creating
            ? this.#text(view, '已创建文库同步。', 'Library sync created.')
            : command.type === 'target-forget'
              ? this.#text(
                  view,
                  '已取消本机关联；附件仍保留。',
                  'Local link removed; attachment kept.',
                )
              : this.#text(view, '已保存同步设置。', 'Sync settings saved.');
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
        this.#clearTargetPassword(view);
        this.#password(view, 'import-password');
        this.#chooseSource(view, source.title, source);
        view.mode = 'import';
        this.#run(view, (context) => this.#inspect(view, context));
        return;
      }
      case 'mode':
        if (view.reviewExport || view.mode === command.value) break;
        this.#password(view, 'export-password');
        this.#password(view, 'import-password');
        this.#clearTargetPassword(view);
        this.#chooseSource(view, '');
        view.mode = command.value;
        view.error = false;
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
        view.includeSecrets = command.checked;
        if (command.checked) view.container = 'age';
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
              this.#showsChange(view, change) &&
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
          await this.#inspect(view, context);
        });
        return;
      case 'refresh-diff':
      case 'inspect': {
        if (!view.sourcePath || view.plan || view.mode !== 'import') break;
        if (command.type === 'refresh-diff' && (!view.refreshChoices || view.awaitingUnlock)) break;
        const password =
          command.type === 'inspect' && view.awaitingUnlock
            ? this.#password(view, 'import-password')
            : '';
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
        this.#password(view, 'export-password');
        view.container = 'json';
        view.includeSecrets = false;
        view.includeLibrarySettings = false;
        view.status = '';
        view.error = false;
        break;
      }
      case 'return-to-preview':
        this.#password(view, 'export-password');
        view.reviewExport = undefined;
        view.status = '';
        view.error = false;
        break;
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
      case 'apply':
        this.#apply(view);
        return;
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
      else if (!view.busy && view.targetPasswordAction)
        this.#dispatch(view, { type: 'target-password-cancel' });
      else this.close(true);
    } else if (!view.root.contains(target)) {
      event.preventDefault();
      view.react?.getElement('close')?.focus();
    } else if (key === 'enter' && !view.busy) {
      if (view.awaitingUnlock && target === view.react?.getElement('import-password')) {
        event.preventDefault();
        this.#dispatch(view, { type: 'inspect' });
      } else if (target === view.react?.getElement('export-password')) {
        event.preventDefault();
        this.#dispatch(view, { type: 'export' });
      } else if (target === view.react?.getElement('managed-password')) {
        event.preventDefault();
        this.#dispatch(view, view.targetPasswordAction ?? { type: 'target-create' });
      }
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
    for (const part of ['export-password', 'import-password', 'managed-password'])
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
