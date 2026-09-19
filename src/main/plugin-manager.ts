import type { MainWindow } from '../core/contracts';
import { keyString } from '../input/keys';
import { THEME_VARS } from '../ui/theme';
import { fuzzyMatchScore } from './picker/fuzzy';
import {
  installedPlugins,
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
      const search = `${plugin.name} ${plugin.id} ${plugin.version}`.toLowerCase();
      const score = fuzzyMatchScore(search, needle);
      return score === null ? [] : [{ plugin, index, score }];
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ plugin }) => plugin);
}

export class PluginManagerPanel {
  readonly #logger: PluginManagerLogger;

  constructor(logger: PluginManagerLogger) {
    this.#logger = logger;
  }

  open(window: MainWindow, session: MainWindowSession): void {
    const state = session.pluginManager;
    if (state.open) {
      state.overlay?.focus();
      return;
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
    input.placeholder = '/ Filter installed plugins';
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
    state.commandBuffer = '';
    state.overlay = overlay;
    state.list = list;
    state.details = details;
    state.count = count;
    state.input = input;
    state.footer = footer;
    state.previousElement = doc.activeElement;
    state.themeCleanup = session.theme.add(overlay);

    const onInput = (): void => {
      state.query = input.value;
      state.selected = 0;
      this.filter(session);
      this.render(session);
    };
    input.addEventListener('input', onInput);
    state.inputCleanup = () => input.removeEventListener('input', onInput);

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close(session);
    });

    overlay.focus();
    this.render(session);
    void this.refresh(window, session);
  }

  close(session: MainWindowSession): void {
    const state = session.pluginManager;
    if (!state.open) return;
    state.generation += 1;
    session.window.clearTimeout(state.commandTimer);
    state.commandTimer = undefined;
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
    state.commandBuffer = '';
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

    const inputFocused = event.target === state.input;
    if (inputFocused) {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        state.input?.blur();
        state.overlay?.focus();
      }
      return;
    }

    const key = keyString(event);
    const consume = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };
    if (!key) {
      event.stopPropagation();
      return;
    }

    if (key === 'escape' || key === 'q') {
      consume();
      this.close(session);
      return;
    }
    if (key === '/') {
      consume();
      state.input?.focus();
      state.input?.select();
      return;
    }
    if (key === 'r') {
      consume();
      void this.refresh(window, session);
      return;
    }
    if (key === 'e') {
      consume();
      void this.setEnabled(window, session, true);
      return;
    }
    if (key === 'd') {
      consume();
      void this.setEnabled(window, session, false);
      return;
    }
    if (key === 'p') {
      consume();
      this.openPreferences(session);
      return;
    }
    if (key === 'G' || key === 'end') {
      consume();
      this.select(session, Math.max(0, state.filtered.length - 1));
      return;
    }
    if (key === 'home') {
      consume();
      this.select(session, 0);
      return;
    }
    if (key === 'g') {
      consume();
      if (state.commandBuffer === 'g') {
        this.clearCommand(session);
        this.select(session, 0);
      } else {
        state.commandBuffer = 'g';
        session.window.clearTimeout(state.commandTimer);
        state.commandTimer = session.window.setTimeout(() => this.clearCommand(session), 700);
        this.renderFooter(session, 'g … (gg top)');
      }
      return;
    }
    this.clearCommand(session);

    if (key === 'j' || key === 'arrowdown') {
      consume();
      this.move(session, 1);
      return;
    }
    if (key === 'k' || key === 'arrowup') {
      consume();
      this.move(session, -1);
      return;
    }
    if (key === 'ctrl+d' || key === 'ctrl+u') {
      consume();
      this.move(session, key === 'ctrl+d' ? 8 : -8);
      return;
    }

    consume();
  }

  async refresh(window: MainWindow, session: MainWindowSession): Promise<void> {
    const state = session.pluginManager;
    if (!state.open) return;
    const generation = ++state.generation;
    const selectedID = state.filtered[state.selected]?.id;
    state.loading = true;
    state.error = '';
    this.render(session);
    try {
      const plugins = await installedPlugins();
      if (!state.open || state.generation !== generation) return;
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
      state.overlay?.focus();
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

    state.busy = true;
    state.notice = `${enabled ? 'Enabling' : 'Disabling'} ${plugin.name}…`;
    this.render(session);
    try {
      await setPluginEnabled(plugin.id, enabled);
      state.notice = `${enabled ? 'Enabled' : 'Disabled'} ${plugin.name}`;
      await this.refresh(window, session);
    } catch (error) {
      state.notice = `Failed to ${enabled ? 'enable' : 'disable'} ${plugin.name}: ${String(error)}`;
      this.#logger.debug(`plugin manager lifecycle action failed: ${String(error)}`);
      this.#logger.diagnostic(`plugin manager lifecycle action failed: ${String(error)}`);
    } finally {
      if (!state.open) return;
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

  private clearCommand(session: MainWindowSession): void {
    const state = session.pluginManager;
    session.window.clearTimeout(state.commandTimer);
    state.commandTimer = undefined;
    state.commandBuffer = '';
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
      row.addEventListener('click', () => this.select(session, index));
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

    const actions = doc.createElementNS(H, 'div');
    actions.style.cssText = `margin-top:24px;padding-top:16px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted}`;
    const hints = [
      !plugin.enabled && plugin.canEnable ? 'e  Enable' : null,
      plugin.enabled && plugin.canDisable ? 'd  Disable' : null,
      plugin.preferencePaneID ? 'p  Settings' : null,
    ].filter((hint): hint is string => !!hint);
    actions.textContent = hints.length ? `Actions\n${hints.join('  ·  ')}` : 'No lifecycle actions available';

    details.append(title, status, meta, actions);
  }

  private renderFooter(session: MainWindowSession, message?: string): void {
    const state = session.pluginManager;
    if (!state.footer) return;
    if (message) {
      state.footer.textContent = message;
      return;
    }
    const plugin = state.filtered[state.selected];
    const actions = plugin
      ? [
          !plugin.enabled && plugin.canEnable ? 'e enable' : null,
          plugin.enabled && plugin.canDisable ? 'd disable' : null,
          plugin.preferencePaneID ? 'p settings' : null,
        ].filter((hint): hint is string => !!hint)
      : [];
    const notice = state.notice ? ` · ${state.notice}` : '';
    const busy = state.busy ? ' · working…' : '';
    state.footer.textContent = `j/k move · gg/G top/bottom · / filter · r refresh${actions.length ? ` · ${actions.join(' · ')}` : ''} · Esc/q close${state.query.trim() ? ` · filter: ${state.query.trim()}` : ''}${busy}${notice}`;
  }
}
