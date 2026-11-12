import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import { reportDiagnosticError, type Logger } from '../../core/logging';
import { ACTION_LABELS, type ActionId } from '../../input/actions';
import type { BindingContext, BindingMap } from '../../input/bindings';
import { LocalBindingRuntime } from '../../input/local-binding-runtime';
import { nativeReservation, shortcutsForAction } from '../../input/shortcut-catalog';
import { keyString } from '../../input/keys';
import { serializeBindingTokens } from '../../input/key-sequence';
import {
  bindCompositionState,
  compositionOwnsKey,
  isCommittedInput,
} from '../../input/composition';
import { asElement, isEditableElement } from '../../platform/dom';
import { mountNativeReactView } from '../../platform/native-ui';
import type { NativeReactView } from '../../ui/react/types';
import type { ExtensionsReactCommand, ExtensionsReactModel } from './react-model';
import { PLUGINS_INPUT_ACTIONS, PLUGINS_LIST_ACTIONS } from './capabilities';
import { THEME_VARS } from '../../ui/theme';
import { fuzzyMatchScore } from '../../ui/fuzzy';
import {
  installedPlugins,
  openPluginInfoURL,
  openPluginPreferences,
  setPluginEnabled,
  ZOTERO_NEO_PLUGIN_ID,
  type InstalledPlugin,
} from './host';
import type { PluginManagerRuntime } from './runtime';

const H = 'http://www.w3.org/1999/xhtml';

export interface PluginManagerPanelHost {
  readonly window: MainWindow;
  readonly state: PluginManagerRuntime;
  readonly logger: Logger;
  readonly bindings: () => BindingMap;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly isCurrent: () => boolean;
}

export function filterInstalledPlugins(
  plugins: readonly InstalledPlugin[],
  query: string,
): InstalledPlugin[] {
  const needle = query.trim();
  if (!needle) return [...plugins];
  return plugins
    .flatMap((plugin, index) => {
      const search =
        `${plugin.name} ${plugin.id} ${plugin.version} ${plugin.description}`.toLowerCase();
      const score = fuzzyMatchScore(search, needle);
      return score === null ? [] : [{ plugin, index, score }];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ plugin }) => plugin);
}

export class PluginManagerPanel {
  readonly #host: PluginManagerPanelHost;
  #view: NativeReactView<ExtensionsReactModel> | null = null;

  constructor(host: PluginManagerPanelHost) {
    this.#host = host;
  }

  open(): void {
    if (!this.#host.isCurrent()) return;
    const state = this.#host.state;
    if (state.open) {
      if (state.overlay?.ownerDocument === this.#host.window.document) {
        state.overlay.focus();
        return;
      }
      this.close();
    }
    const window = this.#host.window;
    let pendingOverlay: HTMLElement | null = null;
    try {
      const doc = window.document;
      const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
      const overlay = create('div');
      pendingOverlay = overlay;
      overlay.id = 'zv-plugin-manager';
      overlay.tabIndex = -1;
      overlay.style.cssText = `position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:40px;background:${THEME_VARS.backdrop};color:${THEME_VARS.text};font:13px/1.4 monospace`;

      const root = create('div');
      overlay.append(root);
      (doc.body ?? doc.documentElement).append(overlay);

      state.open = true;
      state.loading = true;
      state.busy = false;
      state.error = '';
      state.notice = '';
      state.query = '';
      state.selected = 0;
      state.overlay = overlay;
      state.list = null;
      state.details = null;
      state.count = null;
      state.input = null;
      state.footer = null;
      state.previousElement = doc.activeElement;
      const themeCleanup = this.#host.themeRoot(overlay);
      if (state.overlay !== overlay) {
        const failure = new CleanupFailure();
        failure.run(themeCleanup);
        failure.run(() => overlay.remove());
        failure.rethrow();
        return;
      }
      state.themeCleanup = themeCleanup;
      if (!this.#host.isCurrent()) {
        this.close();
        return;
      }
      state.composition = { active: false };
      state.localBindings = new LocalBindingRuntime({
        bindings: this.#host.bindings,
        execute: (action, event) =>
          this.#host.isCurrent() &&
          state.open &&
          state.overlay === overlay &&
          this.execute(action, event),
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        clearTimer: (timer) => window.clearTimeout(timer),
      });
      const localBindings = state.localBindings;
      const deactivate = (): void => localBindings?.deactivate();
      const focus = (): void => {
        if (!this.#host.isCurrent() || !state.open || state.overlay !== overlay) return;
        deactivate();
        this.renderFooter();
      };
      const current = (): boolean =>
        this.#host.isCurrent() &&
        state.open &&
        state.overlay === overlay &&
        window.document === doc &&
        overlay.isConnected;
      const view = mountNativeReactView<ExtensionsReactModel, ExtensionsReactCommand>({
        surface: 'extensions',
        root,
        model: this.model(),
        dispatch: (command) => this.dispatch(command),
        isCurrent: current,
        loadingText: 'Preparing Plugin Manager…',
        errorText: 'Could not load Plugin Manager. Press Escape to close.',
        onError: (error) =>
          reportDiagnosticError(this.#host.logger, 'Plugin manager renderer failed', error),
      });
      this.#view = view;
      void view.ready.then(
        () => {
          if (!current()) return;
          const input = view.getElement('input') as HTMLInputElement | null;
          const list = view.getElement('list');
          if (!input || !list) return;
          state.input = input;
          state.list = list;
          state.details = view.getElement('details');
          state.count = view.getElement('count');
          state.footer = view.getElement('footer');
          const compositionCleanup = bindCompositionState(input, state.composition);
          const onInput = (event: Event): void => {
            if (!current() || !isCommittedInput(event, state.composition.active)) return;
            state.query = input.value;
            state.selected = 0;
            this.filter();
            this.render();
          };
          input.addEventListener('compositionstart', deactivate);
          overlay.addEventListener('focusout', deactivate);
          input.addEventListener('focus', focus);
          input.addEventListener('input', onInput);
          state.inputCleanup = () => {
            compositionCleanup();
            input.removeEventListener('input', onInput);
            input.removeEventListener('compositionstart', deactivate);
            input.removeEventListener('focus', focus);
            overlay.removeEventListener('focusout', deactivate);
          };
          this.render();
        },
        () => undefined,
      );

      overlay.addEventListener('mousedown', (event) => {
        if (
          this.#host.isCurrent() &&
          state.open &&
          state.overlay === overlay &&
          event.target === overlay
        )
          this.close();
      });

      overlay.focus();
      this.render();
      void this.refresh();
    } catch (error) {
      const failure = new CleanupFailure();
      if (state.overlay === pendingOverlay) failure.run(() => this.close());
      failure.run(() => pendingOverlay?.remove());
      try {
        failure.rethrow();
      } catch (cleanupError) {
        reportDiagnosticError(
          this.#host.logger,
          'Plugin manager open cleanup failed',
          cleanupError,
        );
      }
      reportDiagnosticError(this.#host.logger, 'Plugin manager open failed', error);
      throw error;
    }
  }

  /** Retires the old interaction before releasing resources that may re-enter the module. */
  close(): void {
    const state = this.#host.state;
    if (!state.open) return;
    const generation = ++state.generation;
    const { localBindings, inputCleanup, themeCleanup, overlay, previousElement } = state;
    const view = this.#view;
    this.#view = null;
    state.open = false;
    state.localBindings = null;
    state.inputCleanup = null;
    state.themeCleanup = null;
    state.previousElement = null;
    state.loading = false;
    state.busy = false;
    state.plugins = [];
    state.filtered = [];
    state.selected = 0;
    state.query = '';
    state.notice = '';
    state.error = '';
    state.overlay = null;
    state.list = null;
    state.details = null;
    state.count = null;
    state.input = null;
    state.footer = null;
    const failure = new CleanupFailure();
    failure.run(() => localBindings?.dispose());
    failure.run(() => inputCleanup?.());
    failure.run(() => view?.dispose());
    failure.run(() => themeCleanup?.());
    failure.run(() => overlay?.remove());
    try {
      if (
        this.#host.isCurrent() &&
        state.generation === generation &&
        !state.open &&
        overlay?.ownerDocument === this.#host.window.document &&
        previousElement?.isConnected
      )
        (previousElement as HTMLElement).focus();
    } catch {}
    try {
      failure.rethrow();
    } catch (error) {
      reportDiagnosticError(this.#host.logger, 'Plugin manager cleanup failed', error);
      throw error;
    }
  }

  handleKey(event: KeyboardEvent): void {
    const state = this.#host.state;
    if (
      !this.#host.isCurrent() ||
      !state.open ||
      state.overlay?.ownerDocument !== this.#host.window.document
    )
      return;
    const eventTarget = asElement(event.target);
    let target = eventTarget;
    while (
      target &&
      target !== state.input &&
      target !== state.overlay &&
      target !== state.list &&
      target !== state.details
    )
      target = target.parentElement;
    if (!target) {
      state.localBindings?.deactivate();
      return;
    }
    if (
      eventTarget?.localName === 'button' ||
      (eventTarget !== state.input && isEditableElement(eventTarget))
    ) {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    if (
      compositionOwnsKey(event, state.composition.active) ||
      event.getModifierState?.('AltGraph')
    ) {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    const context = target === state.input ? 'plugins-input' : 'plugins-list';
    const key = keyString(event);
    if (key && nativeReservation(context, serializeBindingTokens([key])) === 'exclusive') {
      state.localBindings?.deactivate();
      event.stopPropagation();
      return;
    }
    this.renderFooter(context);
    if (state.localBindings?.handle(event, context)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
    event.stopPropagation();
  }

  private execute(action: ActionId, _event: KeyboardEvent | null): boolean {
    const state = this.#host.state;
    if (!this.#host.isCurrent() || !state.open) return false;
    switch (action) {
      case 'uiFocusList':
        state.overlay?.focus();
        this.renderFooter();
        break;
      case 'uiCancel':
        this.close();
        break;
      case 'uiSearch':
        state.input?.focus();
        state.input?.select();
        break;
      case 'uiNext':
        this.move(1);
        break;
      case 'uiPrevious':
        this.move(-1);
        break;
      case 'uiFirst':
        this.select(0);
        break;
      case 'uiLast':
        this.select(Math.max(0, state.filtered.length - 1));
        break;
      case 'uiPageDown':
        this.move(8);
        break;
      case 'uiPageUp':
        this.move(-8);
        break;
      case 'pluginsRefresh':
        void this.refresh();
        break;
      case 'pluginsEnable':
        void this.setEnabled(true);
        break;
      case 'pluginsDisable':
        void this.setEnabled(false);
        break;
      case 'pluginsPreferences':
        this.openPreferences();
        break;
      case 'pluginsHomepage':
        this.openInfo('homepage');
        break;
      case 'pluginsReadme':
        this.openInfo('readme');
        break;
      case 'pluginsGitLog':
        this.openInfo('git-log');
        break;
      default:
        return false;
    }
    return true;
  }

  async refresh(): Promise<void> {
    const state = this.#host.state;
    if (!this.#host.isCurrent() || !state.open) return;
    const document = state.overlay?.ownerDocument;
    const generation = ++state.generation;
    state.loading = true;
    state.error = '';
    this.render();
    try {
      const plugins = await installedPlugins();
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.generation !== generation ||
        this.#host.window.document !== document
      )
        return;
      const selectedID = state.filtered[state.selected]?.id;
      state.plugins = plugins;
      this.filter();
      const selectedIndex = selectedID
        ? state.filtered.findIndex((plugin) => plugin.id === selectedID)
        : -1;
      state.selected =
        selectedIndex >= 0
          ? selectedIndex
          : Math.min(state.selected, Math.max(0, state.filtered.length - 1));
    } catch (error) {
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.generation !== generation ||
        this.#host.window.document !== document
      )
        return;
      state.error = String(error);
      this.#host.logger.debug(`plugin manager load failed: ${String(error)}`);
      this.#host.logger.diagnostic(`plugin manager load failed: ${String(error)}`);
    } finally {
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.generation !== generation ||
        this.#host.window.document !== document
      )
        return;
      state.loading = false;
      this.render();
    }
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!this.#host.isCurrent() || !state.open || !plugin || state.busy) return;

    if (plugin.enabled === enabled) {
      state.notice = `${plugin.name} is already ${enabled ? 'enabled' : 'disabled'}`;
      this.renderFooter();
      return;
    }
    if (enabled && !plugin.canEnable) {
      state.notice = `${plugin.name} cannot be enabled by the user`;
      this.renderFooter();
      return;
    }
    if (!enabled && !plugin.canDisable) {
      state.notice =
        plugin.id === ZOTERO_NEO_PLUGIN_ID
          ? 'Zotero Neo cannot disable itself from inside Plugin Manager'
          : `${plugin.name} cannot be disabled by the user`;
      this.renderFooter();
      return;
    }

    const overlay = state.overlay;
    const document = overlay?.ownerDocument;
    state.busy = true;
    state.notice = `${enabled ? 'Enabling' : 'Disabling'} ${plugin.name}…`;
    this.render();
    try {
      await setPluginEnabled(plugin.id, enabled);
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.overlay !== overlay ||
        this.#host.window.document !== document
      )
        return;
      state.notice = `${enabled ? 'Enabled' : 'Disabled'} ${plugin.name}`;
      await this.refresh();
    } catch (error) {
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.overlay !== overlay ||
        this.#host.window.document !== document
      )
        return;
      state.notice = `Failed to ${enabled ? 'enable' : 'disable'} ${plugin.name}: ${String(error)}`;
      this.#host.logger.debug(`plugin manager lifecycle action failed: ${String(error)}`);
      this.#host.logger.diagnostic(`plugin manager lifecycle action failed: ${String(error)}`);
    } finally {
      if (
        !this.#host.isCurrent() ||
        !state.open ||
        state.overlay !== overlay ||
        this.#host.window.document !== document
      )
        return;
      state.busy = false;
      this.render();
    }
  }

  private openPreferences(): void {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!this.#host.isCurrent() || !state.open || !plugin || state.busy) return;
    if (!plugin.preferencePaneID) {
      state.notice = `${plugin.name} has no registered Zotero settings pane`;
      this.renderFooter();
      return;
    }
    if (!openPluginPreferences(plugin.id)) {
      state.notice = `Unable to open settings for ${plugin.name}`;
      this.renderFooter();
      return;
    }
    state.notice = `Opened settings for ${plugin.name}`;
    this.renderFooter();
  }

  private openInfo(kind: 'homepage' | 'readme' | 'git-log'): void {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    if (!this.#host.isCurrent() || !state.open || !plugin || state.busy) return;

    const target =
      kind === 'homepage'
        ? plugin.homepageURL
        : kind === 'readme'
          ? plugin.readmeURL
          : plugin.gitLogURL;
    const label = kind === 'git-log' ? 'git log' : kind;
    if (!target) {
      state.notice = `${plugin.name} has no ${label} link`;
      this.renderFooter();
      return;
    }
    if (!openPluginInfoURL(target)) {
      state.notice = `Unable to open ${label} for ${plugin.name}`;
      this.renderFooter();
      return;
    }
    state.notice = `Opened ${label} for ${plugin.name}`;
    this.renderFooter();
  }

  private filter(): void {
    const state = this.#host.state;
    state.filtered = filterInstalledPlugins(state.plugins, state.query);
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, state.filtered.length - 1)));
  }

  private move(amount: number): void {
    const state = this.#host.state;
    if (!state.filtered.length) return;
    this.select(Math.max(0, Math.min(state.filtered.length - 1, state.selected + amount)));
  }

  private select(index: number): void {
    const state = this.#host.state;
    if (!state.filtered.length) {
      state.selected = 0;
      this.render();
      return;
    }
    state.selected = Math.max(0, Math.min(state.filtered.length - 1, index));
    this.render();
  }

  private dispatch(command: ExtensionsReactCommand): void {
    const state = this.#host.state;
    if (!this.#host.isCurrent() || !state.open) return;
    if (command.type === 'select') {
      if (
        !Number.isInteger(command.index) ||
        command.index < 0 ||
        command.index >= state.filtered.length
      )
        return;
      state.localBindings?.deactivate();
      state.list?.focus();
      this.select(command.index);
      return;
    }
    const plugin = state.filtered[state.selected];
    if (!plugin) return;
    const url =
      command.kind === 'homepage'
        ? plugin.homepageURL
        : command.kind === 'repository'
          ? plugin.repositoryURL
          : command.kind === 'readme'
            ? plugin.readmeURL
            : command.kind === 'git-log'
              ? plugin.gitLogURL
              : undefined;
    if (url) openPluginInfoURL(url);
  }

  private render(): void {
    this.#view?.update(this.model());
    const state = this.#host.state;
    if (!state.loading && !state.error && state.filtered.length)
      state.list?.children[state.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private model(context?: BindingContext): ExtensionsReactModel {
    const state = this.#host.state;
    const plugin = state.filtered[state.selected];
    const bindings = this.#host.bindings();
    const actions = plugin
      ? [
          !plugin.enabled && plugin.canEnable
            ? this.hint(bindings, 'plugins-list', 'pluginsEnable')
            : null,
          plugin.enabled && plugin.canDisable
            ? this.hint(bindings, 'plugins-list', 'pluginsDisable')
            : null,
          plugin.preferencePaneID
            ? this.hint(bindings, 'plugins-list', 'pluginsPreferences')
            : null,
          plugin.homepageURL ? this.hint(bindings, 'plugins-list', 'pluginsHomepage') : null,
          plugin.readmeURL ? this.hint(bindings, 'plugins-list', 'pluginsReadme') : null,
          plugin.gitLogURL ? this.hint(bindings, 'plugins-list', 'pluginsGitLog') : null,
        ].filter((hint): hint is string => !!hint)
      : [];
    const loading = state.loading && !state.plugins.length;
    return {
      plugins: state.filtered.map((item) => ({
        id: item.id,
        name: item.name,
        version: item.version,
        enabled: item.enabled,
        canEnable: item.canEnable,
        canDisable: item.canDisable,
        description: item.description,
        homepageURL: item.homepageURL,
        repositoryURL: item.repositoryURL,
        readmeURL: item.readmeURL,
        gitLogURL: item.gitLogURL,
        preferencePaneID: item.preferencePaneID,
      })),
      selected: state.selected,
      query: state.query,
      count: state.loading ? 'Loading…' : `${state.filtered.length}/${state.plugins.length}`,
      listMessage: loading
        ? 'Loading installed plugins…'
        : state.error
          ? `Unable to load plugins: ${state.error.slice(0, 120)}`
          : !state.filtered.length
            ? state.query.trim()
              ? 'No matching plugins'
              : 'No installed plugins'
            : '',
      listStatus: loading ? 'muted' : state.error ? 'error' : 'normal',
      loading: state.loading,
      shortcuts: actions.length
        ? `Shortcuts\n${actions.join('  ·  ')}`
        : 'No additional shortcuts available',
      footer: this.footer(context),
    };
  }

  private renderFooter(context?: BindingContext): void {
    this.#view?.update(this.model(context));
  }

  private footer(context?: BindingContext): string {
    const state = this.#host.state;
    const bindings = this.#host.bindings();
    const plugin = state.filtered[state.selected];
    const actions = plugin
      ? [
          !plugin.enabled && plugin.canEnable
            ? this.hint(bindings, 'plugins-list', 'pluginsEnable')
            : null,
          plugin.enabled && plugin.canDisable
            ? this.hint(bindings, 'plugins-list', 'pluginsDisable')
            : null,
          plugin.preferencePaneID
            ? this.hint(bindings, 'plugins-list', 'pluginsPreferences')
            : null,
          plugin.homepageURL ? this.hint(bindings, 'plugins-list', 'pluginsHomepage') : null,
          plugin.readmeURL ? this.hint(bindings, 'plugins-list', 'pluginsReadme') : null,
          plugin.gitLogURL ? this.hint(bindings, 'plugins-list', 'pluginsGitLog') : null,
        ].filter((hint): hint is string => !!hint)
      : [];
    const notice = state.notice ? ` · ${state.notice}` : '';
    const busy = state.busy ? ' · working…' : '';
    const ownedContext =
      context ??
      (this.#host.window.document.activeElement === state.input ? 'plugins-input' : 'plugins-list');
    const navigation =
      ownedContext === 'plugins-input'
        ? PLUGINS_INPUT_ACTIONS
        : PLUGINS_LIST_ACTIONS.filter(
            (action) => !action.startsWith('plugins') || action === 'pluginsRefresh',
          );
    const hints = navigation
      .map((action) => this.hint(bindings, ownedContext, action))
      .filter(Boolean);
    return `${[...hints, ...(ownedContext === 'plugins-list' ? actions : [])].join(' · ')}${state.query.trim() ? ` · filter: ${state.query.trim()}` : ''}${busy}${notice}`;
  }

  private hint(bindings: BindingMap, context: BindingContext, action: ActionId): string | null {
    const keys = shortcutsForAction(bindings, context, action);
    return keys.length ? `${keys.join('/')} ${ACTION_LABELS[action].en}` : null;
  }
}
