import type { MainWindow } from '../core/contracts';
import { ACTION_LABELS, type ActionId } from '../input/actions';
import { DEFAULT_BINDINGS, type BindingContext, type BindingMap } from '../input/bindings';
import { LocalBindingRuntime } from '../input/local-binding-runtime';
import { nativeReservation, shortcutsForAction } from '../input/shortcut-catalog';
import { keyString } from '../input/keys';
import { serializeBindingTokens } from '../input/key-sequence';
import { bindCompositionState, compositionOwnsKey, isCommittedInput } from '../input/composition';
import { asElement, isEditableElement } from '../platform/dom';
import { PLUGINS_INPUT_ACTIONS, PLUGINS_LIST_ACTIONS } from './plugin-manager-capabilities';
import { THEME_VARS } from '../ui/theme';
import { fuzzyMatchScore } from './picker/fuzzy';
import {
  installedPlugins,
  openPluginInfoURL,
  openPluginPreferences,
  setPluginEnabled,
  ZOTERO_NEO_PLUGIN_ID,
  type InstalledPlugin,
} from './plugin-host';
import type { MainWindowSession } from './session';

const H = 'http://www.w3.org/1999/xhtml';

export interface PluginManagerLogger {
  debug(message: string): void;
  diagnostic(message: string): void;
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
  readonly #logger: PluginManagerLogger;
  readonly #bindings: () => BindingMap;
  readonly #sessions = new WeakSet<MainWindowSession>();

  constructor(logger: PluginManagerLogger, bindings: () => BindingMap = () => DEFAULT_BINDINGS) {
    this.#logger = logger;
    this.#bindings = bindings;
  }

  open(window: MainWindow, session: MainWindowSession): void {
    const state = session.pluginManager;
    if (state.open) {
      state.overlay?.focus();
      return;
    }
    if (!this.#sessions.has(session)) {
      this.#sessions.add(session);
      session.cleanup.add(() => this.close(session));
    }

    const doc = window.document;
    const create = (tag: string): HTMLElement => doc.createElementNS(H, tag);
    const overlay = create('div');
    overlay.id = 'zv-plugin-manager';
    overlay.tabIndex = -1;
    overlay.style.cssText = `position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:40px;background:${THEME_VARS.backdrop};color:${THEME_VARS.text};font:13px/1.4 monospace`;

    const panel = create('section');
    panel.style.cssText = `width:min(960px,calc(100vw - 80px));height:min(640px,calc(100vh - 80px));min-width:620px;min-height:420px;display:flex;flex-direction:column;overflow:hidden;background:${THEME_VARS.surface};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 24px 70px ${THEME_VARS.shadow}`;

    const header = create('header');
    header.style.cssText = `display:flex;align-items:center;gap:14px;padding:12px 14px;background:${THEME_VARS.elevated};border-bottom:1px solid ${THEME_VARS.border}`;
    const title = create('strong');
    title.textContent = 'Plugin Manager';
    title.style.cssText = 'font-size:14px;white-space:nowrap';
    const count = create('span');
    count.style.cssText = `color:${THEME_VARS.muted};white-space:nowrap`;
    const input = doc.createElementNS(H, 'input') as HTMLInputElement;
    input.type = 'text';
    input.placeholder = 'Filter installed plugins';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.cssText = `flex:1;min-width:140px;padding:6px 9px;color:${THEME_VARS.text};background:${THEME_VARS.input};border:1px solid ${THEME_VARS.border};border-radius:5px;outline:none;font:inherit`;
    header.append(title, count, input);

    const content = create('div');
    content.style.cssText =
      'display:grid;grid-template-columns:minmax(260px,42%) minmax(320px,58%);flex:1;min-height:0';

    const list = create('div');
    list.tabIndex = -1;
    list.style.cssText = `overflow:auto;min-height:0;padding:7px 0;border-right:1px solid ${THEME_VARS.border};outline:none`;

    const details = create('div');
    details.tabIndex = -1;
    details.style.cssText = `overflow:auto;min-height:0;padding:20px 22px;background:${THEME_VARS.elevated};white-space:pre-wrap;outline:none`;

    content.append(list, details);

    const footer = create('footer');
    footer.style.cssText = `padding:7px 12px;color:${THEME_VARS.muted};border-top:1px solid ${THEME_VARS.border};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;

    panel.append(header, content, footer);
    overlay.append(panel);
    (doc.body ?? doc.documentElement).append(overlay);

    state.open = true;
    state.loading = true;
    state.busy = false;
    state.error = '';
    state.notice = '';
    state.query = '';
    state.selected = 0;
    state.overlay = overlay;
    state.list = list;
    state.details = details;
    state.count = count;
    state.input = input;
    state.footer = footer;
    state.previousElement = doc.activeElement;
    state.themeCleanup = session.theme.add(overlay);
    state.composition = { active: false };
    state.localBindings = new LocalBindingRuntime({
      bindings: this.#bindings,
      execute: (action, event) =>
        state.open && state.overlay === overlay && this.execute(action, event, window, session),
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timer) => window.clearTimeout(timer),
    });
    const compositionCleanup = bindCompositionState(input, state.composition);
    const localBindings = state.localBindings;
    const deactivate = (): void => localBindings?.deactivate();
    const focus = (): void => {
      if (!state.open || state.overlay !== overlay) return;
      deactivate();
      this.renderFooter(session);
    };
    input.addEventListener('compositionstart', deactivate);
    overlay.addEventListener('focusout', deactivate);
    input.addEventListener('focus', focus);

    const onInput = (event: Event): void => {
      if (
        !state.open ||
        state.overlay !== overlay ||
        !isCommittedInput(event, state.composition.active)
      )
        return;
      state.query = input.value;
      state.selected = 0;
      this.filter(session);
      this.render(session);
    };
    input.addEventListener('input', onInput);
    state.inputCleanup = () => {
      compositionCleanup();
      input.removeEventListener('input', onInput);
      input.removeEventListener('compositionstart', deactivate);
      input.removeEventListener('focus', focus);
      overlay.removeEventListener('focusout', deactivate);
    };

    overlay.addEventListener('mousedown', (event) => {
      if (state.open && state.overlay === overlay && event.target === overlay) this.close(session);
    });

    overlay.focus();
    this.render(session);
    void this.refresh(window, session);
  }

  close(session: MainWindowSession): void {
    const state = session.pluginManager;
    if (!state.open) return;
    state.generation += 1;
    state.localBindings?.dispose();
    state.localBindings = null;
    state.inputCleanup?.();
    state.inputCleanup = null;
    state.themeCleanup?.();
    state.themeCleanup = null;
    state.overlay?.remove();
    state.open = false;
    state.loading = false;
    state.busy = false;
    state.plugins = [];
    state.filtered = [];
    state.selected = 0;
    state.query = '';
    state.notice = '';
    state.overlay = null;
    state.list = null;
    state.details = null;
    state.count = null;
    state.input = null;
    state.footer = null;
    try {
      if (state.previousElement?.isConnected) (state.previousElement as HTMLElement).focus();
    } catch {}
    state.previousElement = null;
  }

  handleKey(event: KeyboardEvent, window: MainWindow, session: MainWindowSession): void {
    const state = session.pluginManager;
    if (!state.open) return;
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
    this.renderFooter(session, context);
    if (state.localBindings?.handle(event, context)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
    event.stopPropagation();
    void window;
  }

  private execute(
    action: ActionId,
    _event: KeyboardEvent | null,
    window: MainWindow,
    session: MainWindowSession,
  ): boolean {
    const state = session.pluginManager;
    switch (action) {
      case 'uiFocusList':
        state.overlay?.focus();
        this.renderFooter(session);
        break;
      case 'uiCancel':
        this.close(session);
        break;
      case 'uiSearch':
        state.input?.focus();
        state.input?.select();
        break;
      case 'uiNext':
        this.move(session, 1);
        break;
      case 'uiPrevious':
        this.move(session, -1);
        break;
      case 'uiFirst':
        this.select(session, 0);
        break;
      case 'uiLast':
        this.select(session, Math.max(0, state.filtered.length - 1));
        break;
      case 'uiPageDown':
        this.move(session, 8);
        break;
      case 'uiPageUp':
        this.move(session, -8);
        break;
      case 'pluginsRefresh':
        void this.refresh(window, session);
        break;
      case 'pluginsEnable':
        void this.setEnabled(window, session, true);
        break;
      case 'pluginsDisable':
        void this.setEnabled(window, session, false);
        break;
      case 'pluginsPreferences':
        this.openPreferences(session);
        break;
      case 'pluginsHomepage':
        this.openInfo(session, 'homepage');
        break;
      case 'pluginsReadme':
        this.openInfo(session, 'readme');
        break;
      case 'pluginsGitLog':
        this.openInfo(session, 'git-log');
        break;
      default:
        return false;
    }
    return true;
  }

  async refresh(window: MainWindow, session: MainWindowSession): Promise<void> {
    const state = session.pluginManager;
    if (!state.open) return;
    const generation = ++state.generation;
    state.loading = true;
    state.error = '';
    this.render(session);
    try {
      const plugins = await installedPlugins();
      if (!state.open || state.generation !== generation) return;
      const selectedID = state.filtered[state.selected]?.id;
      state.plugins = plugins;
      this.filter(session);
      const selectedIndex = selectedID
        ? state.filtered.findIndex((plugin) => plugin.id === selectedID)
        : -1;
      state.selected =
        selectedIndex >= 0
          ? selectedIndex
          : Math.min(state.selected, Math.max(0, state.filtered.length - 1));
    } catch (error) {
      if (!state.open || state.generation !== generation) return;
      state.error = String(error);
      this.#logger.debug(`plugin manager load failed: ${String(error)}`);
      this.#logger.diagnostic(`plugin manager load failed: ${String(error)}`);
    } finally {
      if (!state.open || state.generation !== generation) return;
      state.loading = false;
      this.render(session);
      void window;
    }
  }

  private async setEnabled(
    window: MainWindow,
    session: MainWindowSession,
    enabled: boolean,
  ): Promise<void> {
    const state = session.pluginManager;
    const plugin = state.filtered[state.selected];
    if (!plugin || state.busy) return;

    if (plugin.enabled === enabled) {
      state.notice = `${plugin.name} is already ${enabled ? 'enabled' : 'disabled'}`;
      this.renderFooter(session);
      return;
    }
    if (enabled && !plugin.canEnable) {
      state.notice = `${plugin.name} cannot be enabled by the user`;
      this.renderFooter(session);
      return;
    }
    if (!enabled && !plugin.canDisable) {
      state.notice =
        plugin.id === ZOTERO_NEO_PLUGIN_ID
          ? 'Zotero Neo cannot disable itself from inside Plugin Manager'
          : `${plugin.name} cannot be disabled by the user`;
      this.renderFooter(session);
      return;
    }

    const overlay = state.overlay;
    state.busy = true;
    state.notice = `${enabled ? 'Enabling' : 'Disabling'} ${plugin.name}…`;
    this.render(session);
    try {
      await setPluginEnabled(plugin.id, enabled);
      if (!state.open || state.overlay !== overlay) return;
      state.notice = `${enabled ? 'Enabled' : 'Disabled'} ${plugin.name}`;
      await this.refresh(window, session);
    } catch (error) {
      if (!state.open || state.overlay !== overlay) return;
      state.notice = `Failed to ${enabled ? 'enable' : 'disable'} ${plugin.name}: ${String(error)}`;
      this.#logger.debug(`plugin manager lifecycle action failed: ${String(error)}`);
      this.#logger.diagnostic(`plugin manager lifecycle action failed: ${String(error)}`);
    } finally {
      if (!state.open || state.overlay !== overlay) return;
      state.busy = false;
      this.render(session);
    }
  }

  private openPreferences(session: MainWindowSession): void {
    const state = session.pluginManager;
    const plugin = state.filtered[state.selected];
    if (!plugin || state.busy) return;
    if (!plugin.preferencePaneID) {
      state.notice = `${plugin.name} has no registered Zotero settings pane`;
      this.renderFooter(session);
      return;
    }
    if (!openPluginPreferences(plugin.id)) {
      state.notice = `Unable to open settings for ${plugin.name}`;
      this.renderFooter(session);
      return;
    }
    state.notice = `Opened settings for ${plugin.name}`;
    this.renderFooter(session);
  }

  private openInfo(session: MainWindowSession, kind: 'homepage' | 'readme' | 'git-log'): void {
    const state = session.pluginManager;
    const plugin = state.filtered[state.selected];
    if (!plugin || state.busy) return;

    const target =
      kind === 'homepage'
        ? plugin.homepageURL
        : kind === 'readme'
          ? plugin.readmeURL
          : plugin.gitLogURL;
    const label = kind === 'git-log' ? 'git log' : kind;
    if (!target) {
      state.notice = `${plugin.name} has no ${label} link`;
      this.renderFooter(session);
      return;
    }
    if (!openPluginInfoURL(target)) {
      state.notice = `Unable to open ${label} for ${plugin.name}`;
      this.renderFooter(session);
      return;
    }
    state.notice = `Opened ${label} for ${plugin.name}`;
    this.renderFooter(session);
  }

  private filter(session: MainWindowSession): void {
    const state = session.pluginManager;
    state.filtered = filterInstalledPlugins(state.plugins, state.query);
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, state.filtered.length - 1)));
  }

  private move(session: MainWindowSession, amount: number): void {
    const state = session.pluginManager;
    if (!state.filtered.length) return;
    this.select(session, Math.max(0, Math.min(state.filtered.length - 1, state.selected + amount)));
  }

  private select(session: MainWindowSession, index: number): void {
    const state = session.pluginManager;
    if (!state.filtered.length) {
      state.selected = 0;
      this.render(session);
      return;
    }
    state.selected = Math.max(0, Math.min(state.filtered.length - 1, index));
    this.render(session);
  }

  private render(session: MainWindowSession): void {
    const state = session.pluginManager;
    const list = state.list;
    if (!list) return;

    state.count!.textContent = state.loading
      ? 'Loading…'
      : `${state.filtered.length}/${state.plugins.length}`;

    list.replaceChildren();
    if (state.loading && !state.plugins.length) {
      list.textContent = 'Loading installed plugins…';
      list.style.color = THEME_VARS.muted;
      this.renderDetails(session);
      this.renderFooter(session);
      return;
    }
    if (state.error) {
      list.textContent = `Unable to load plugins: ${state.error.slice(0, 120)}`;
      list.style.color = THEME_VARS.error;
      this.renderDetails(session);
      this.renderFooter(session);
      return;
    }
    list.style.color = THEME_VARS.text;
    if (!state.filtered.length) {
      list.textContent = state.query.trim() ? 'No matching plugins' : 'No installed plugins';
      this.renderDetails(session);
      this.renderFooter(session);
      return;
    }

    const doc = list.ownerDocument;
    state.filtered.forEach((plugin, index) => {
      const row = doc.createElementNS(H, 'div');
      const selected = index === state.selected;
      row.dataset.zvPluginIndex = String(index);
      row.style.cssText = `display:flex;align-items:center;gap:10px;padding:7px 12px;cursor:pointer;color:${selected ? THEME_VARS.selectedText : THEME_VARS.text};background:${selected ? THEME_VARS.selected : 'transparent'};border-left:3px solid ${selected ? THEME_VARS.accent : 'transparent'}`;
      const marker = doc.createElementNS(H, 'span');
      marker.textContent = plugin.enabled ? '●' : '○';
      marker.style.cssText = `color:${plugin.enabled ? THEME_VARS.success : THEME_VARS.muted}`;
      const label = doc.createElementNS(H, 'span');
      label.textContent = plugin.name;
      label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis';
      const version = doc.createElementNS(H, 'span');
      version.textContent = plugin.version || '—';
      version.style.cssText = `color:${THEME_VARS.muted};font-size:11px`;
      row.append(marker, label, version);
      row.addEventListener('click', () => {
        if (!state.open || state.list !== list || row.parentElement !== list) return;
        state.localBindings?.deactivate();
        state.list?.focus();
        this.select(session, index);
      });
      list.append(row);
    });

    list.children[state.selected]?.scrollIntoView({ block: 'nearest' });
    this.renderDetails(session);
    this.renderFooter(session);
  }

  private renderDetails(session: MainWindowSession): void {
    const state = session.pluginManager;
    const details = state.details;
    if (!details) return;
    const bindings = this.#bindings();
    const plugin = state.filtered[state.selected];
    if (!plugin) {
      details.textContent = state.loading ? 'Loading plugin details…' : 'No plugin selected.';
      return;
    }

    details.replaceChildren();
    const doc = details.ownerDocument;
    const title = doc.createElementNS(H, 'div');
    title.textContent = plugin.name;
    title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:18px';
    const status = doc.createElementNS(H, 'div');
    status.textContent = plugin.enabled ? 'Enabled' : 'Disabled';
    status.style.cssText = `display:inline-block;margin-bottom:18px;padding:3px 8px;border-radius:999px;color:${plugin.enabled ? THEME_VARS.success : THEME_VARS.muted};border:1px solid ${plugin.enabled ? THEME_VARS.success : THEME_VARS.border}`;
    const meta = doc.createElementNS(H, 'div');
    meta.style.cssText = 'display:grid;grid-template-columns:90px 1fr;gap:8px 14px';
    const add = (labelText: string, value: string): void => {
      const label = doc.createElementNS(H, 'span');
      label.textContent = labelText;
      label.style.color = THEME_VARS.muted;
      const content = doc.createElementNS(H, 'span');
      content.textContent = value;
      content.style.overflowWrap = 'anywhere';
      meta.append(label, content);
    };
    add('Version', plugin.version || 'Unknown');
    add('Plugin ID', plugin.id);
    add('Settings', plugin.preferencePaneID ? 'Available' : 'Not registered');

    const description = doc.createElementNS(H, 'div');
    description.style.cssText = `margin-top:18px;padding-top:16px;border-top:1px solid ${THEME_VARS.border};color:${plugin.description ? THEME_VARS.text : THEME_VARS.muted};white-space:pre-wrap;overflow-wrap:anywhere`;
    description.textContent = plugin.description || 'No description provided by the plugin.';

    const links = doc.createElementNS(H, 'div');
    links.style.cssText = `margin-top:18px;display:flex;flex-wrap:wrap;gap:8px 14px;color:${THEME_VARS.muted}`;
    const linkEntries: Array<[string, string | undefined]> = [
      ['Homepage', plugin.homepageURL],
      [
        'Repository',
        plugin.repositoryURL === plugin.homepageURL ? undefined : plugin.repositoryURL,
      ],
      ['README', plugin.readmeURL],
      ['Git log', plugin.gitLogURL],
    ];
    for (const [labelText, url] of linkEntries) {
      if (!url) continue;
      const link = doc.createElementNS(H, 'button') as HTMLButtonElement;
      link.type = 'button';
      link.textContent = labelText;
      link.title = url;
      link.style.cssText = `padding:0;border:0;background:none;color:${THEME_VARS.accent};font:inherit;text-decoration:underline;cursor:pointer`;
      link.addEventListener('click', () => {
        if (state.open && state.details === details && links.parentElement === details)
          openPluginInfoURL(url);
      });
      links.append(link);
    }

    const actions = doc.createElementNS(H, 'div');
    actions.style.cssText = `margin-top:24px;padding-top:16px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted}`;
    const hints = [
      !plugin.enabled && plugin.canEnable
        ? this.hint(bindings, 'plugins-list', 'pluginsEnable')
        : null,
      plugin.enabled && plugin.canDisable
        ? this.hint(bindings, 'plugins-list', 'pluginsDisable')
        : null,
      plugin.preferencePaneID ? this.hint(bindings, 'plugins-list', 'pluginsPreferences') : null,
      plugin.homepageURL ? this.hint(bindings, 'plugins-list', 'pluginsHomepage') : null,
      plugin.readmeURL ? this.hint(bindings, 'plugins-list', 'pluginsReadme') : null,
      plugin.gitLogURL ? this.hint(bindings, 'plugins-list', 'pluginsGitLog') : null,
    ].filter((hint): hint is string => !!hint);
    actions.textContent = hints.length
      ? `Shortcuts\n${hints.join('  ·  ')}`
      : 'No additional shortcuts available';

    details.append(title, status, meta, description);
    if (links.childElementCount) details.append(links);
    details.append(actions);
  }

  private renderFooter(session: MainWindowSession, context?: BindingContext): void {
    const state = session.pluginManager;
    if (!state.footer) return;
    const bindings = this.#bindings();
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
      (session.window.document.activeElement === state.input ? 'plugins-input' : 'plugins-list');
    const navigation =
      ownedContext === 'plugins-input'
        ? PLUGINS_INPUT_ACTIONS
        : PLUGINS_LIST_ACTIONS.filter(
            (action) => !action.startsWith('plugins') || action === 'pluginsRefresh',
          );
    const hints = navigation
      .map((action) => this.hint(bindings, ownedContext, action))
      .filter(Boolean);
    state.footer.textContent = `${[...hints, ...(ownedContext === 'plugins-list' ? actions : [])].join(' · ')}${state.query.trim() ? ` · filter: ${state.query.trim()}` : ''}${busy}${notice}`;
  }

  private hint(bindings: BindingMap, context: BindingContext, action: ActionId): string | null {
    const keys = shortcutsForAction(bindings, context, action);
    return keys.length ? `${keys.join('/')} ${ACTION_LABELS[action].en}` : null;
  }
}
