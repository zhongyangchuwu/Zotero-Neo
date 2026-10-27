import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterInstalledPlugins, PluginManagerPanel } from '../../src/modules/extensions/panel';
import { PluginManagerRuntime } from '../../src/modules/extensions/runtime';
import { ModuleHost } from '../../src/core/module-host';
import { createExtensionsModule } from '../../src/modules/extensions';
import type { InstalledPlugin } from '../../src/modules/extensions/host';
import { DEFAULT_BINDINGS, resolveBindings, type BindingMap } from '../../src/input/bindings';
import { ZOTERO_NEO_PLUGIN_ID } from '../../src/modules/extensions/host';
import { createPickerHarness, pickerKey } from './feature-panel-harness';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const plugins: readonly InstalledPlugin[] = [
  {
    id: 'better-bibtex@iris-advies.com',
    name: 'Better BibTeX for Zotero',
    version: '9.1.2',
    enabled: true,
    canEnable: true,
    canDisable: true,
    description: 'Citation key management and BibTeX export',
  },
  {
    id: 'zotero-actions-tags@windingwind.com',
    name: 'Actions & Tags for Zotero',
    version: '2.1.0',
    enabled: false,
    canEnable: true,
    canDisable: true,
    description: '',
  },
  {
    id: 'translate-for-zotero@example.org',
    name: 'Translate for Zotero',
    version: '3.0.0',
    enabled: true,
    canEnable: true,
    canDisable: true,
    description: '',
  },
];

describe('plugin manager filtering', () => {
  it('preserves the native plugin order when the filter is empty', () => {
    expect(filterInstalledPlugins(plugins, '')).toEqual(plugins);
  });

  it('fuzzy-matches plugin name, id, and version', () => {
    expect(filterInstalledPlugins(plugins, 'better bib').map((plugin) => plugin.id)).toEqual([
      'better-bibtex@iris-advies.com',
    ]);
    expect(filterInstalledPlugins(plugins, 'windingwind').map((plugin) => plugin.id)).toEqual([
      'zotero-actions-tags@windingwind.com',
    ]);
    expect(filterInstalledPlugins(plugins, '3.0.0').map((plugin) => plugin.id)).toEqual([
      'translate-for-zotero@example.org',
    ]);
    expect(filterInstalledPlugins(plugins, 'citation key').map((plugin) => plugin.id)).toEqual([
      'better-bibtex@iris-advies.com',
    ]);
  });

  it('rejects plugins whose searchable fields do not match', () => {
    expect(filterInstalledPlugins(plugins, 'nonexistent plugin')).toEqual([]);
  });
});

function installManagerHost() {
  const alpha = {
    id: 'alpha@example.test',
    name: 'Alpha',
    type: 'extension',
    version: '1.0',
    isActive: false,
    permissions: 6,
    homepageURL: 'https://github.com/example/alpha',
    enable: vi.fn(async () => {
      alpha.isActive = true;
    }),
    disable: vi.fn(async () => {
      alpha.isActive = false;
    }),
  };
  const beta = {
    id: 'beta@example.test',
    name: 'Beta',
    type: 'extension',
    version: '2.0',
    isActive: true,
    permissions: 6,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
  };
  const neo = {
    id: ZOTERO_NEO_PLUGIN_ID,
    name: 'Zotero Neo',
    type: 'extension',
    version: '3.0',
    isActive: true,
    permissions: 6,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
  };
  const addons = [alpha, beta, neo];
  const manager = {
    PERM_CAN_ENABLE: 2,
    PERM_CAN_DISABLE: 4,
    getAddonsByTypes: vi.fn(async () => addons),
    getAddonByID: vi.fn(async (id: string) => addons.find((addon) => addon.id === id) ?? null),
  };
  const openPreferences = vi.fn();
  const launchURL = vi.fn();
  vi.stubGlobal('ChromeUtils', { importESModule: () => ({ AddonManager: manager }) });
  vi.stubGlobal('Zotero', {
    locale: 'en-US',
    PreferencePanes: { pluginPanes: [{ id: 'alpha-pane', pluginID: alpha.id }] },
    Utilities: { Internal: { openPreferences } },
    launchURL,
  });
  return { alpha, beta, neo, manager, openPreferences, launchURL };
}

function createPanelFixture(
  bindings: () => BindingMap = () => DEFAULT_BINDINGS,
  themeRoot?: (root: HTMLElement) => () => void,
) {
  const { window, session } = createPickerHarness();
  const state = new PluginManagerRuntime();
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  const panel = host.activate('extensions', (scope) => {
    const instance = new PluginManagerPanel({
      window,
      state,
      logger,
      bindings,
      themeRoot: themeRoot ?? ((root) => session.theme.add(root)),
      isCurrent: () => scope.isCurrent(),
    });
    scope.add(() => instance.close());
    return instance;
  });
  return { window, state, host, panel };
}

describe('configurable plugin manager contexts', () => {
  it('executes rebinding for every plugin operation and derives both footer and details discovery', async () => {
    const host = installManagerHost();
    const bindings = resolveBindings(
      JSON.stringify({
        'plugins-list:e': null,
        'plugins-list:d': null,
        'plugins-list:p': null,
        'plugins-list:o': null,
        'plugins-list:R': null,
        'plugins-list:L': null,
        'plugins-list:r': null,
        'plugins-list:<F1>': 'pluginsEnable',
        'plugins-list:<F2>': 'pluginsDisable',
        'plugins-list:<F3>': 'pluginsPreferences',
        'plugins-list:<F4>': 'pluginsHomepage',
        'plugins-list:<F5>': 'pluginsReadme',
        'plugins-list:<F6>': 'pluginsGitLog',
        'plugins-list:<F7>': 'pluginsRefresh',
      }),
    );
    const { state, panel } = createPanelFixture(() => bindings);
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const key = (value: string): void => panel.handleKey(pickerKey(value, state.overlay));
    for (const retired of ['e', 'd', 'p', 'o', 'R', 'L', 'r']) {
      const event = pickerKey(retired, state.overlay);
      panel.handleKey(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(host.alpha.enable).not.toHaveBeenCalled();
    expect(state.footer?.textContent).toContain('<F1>');
    expect(state.details?.textContent).toContain('<F1>');
    key('F1');
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(host.alpha.enable).toHaveBeenCalledOnce();
    expect(state.filtered[0]?.enabled).toBe(true);
    expect(state.details?.textContent).toContain('<F2>');
    key('F2');
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(host.alpha.disable).toHaveBeenCalledOnce();
    key('F3');
    expect(host.openPreferences).toHaveBeenCalledWith('alpha-pane');
    key('F4');
    key('F5');
    key('F6');
    expect(host.launchURL.mock.calls.map(([url]) => url)).toEqual([
      'https://github.com/example/alpha',
      'https://github.com/example/alpha#readme',
      'https://github.com/example/alpha/commits',
    ]);
    const loads = host.manager.getAddonsByTypes.mock.calls.length;
    key('F7');
    await vi.waitFor(() => expect(state.loading).toBe(false));
    expect(host.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads + 1);
    panel.close();
  });

  it('rebinds list/search/cancel independently and preserves native query editing and IME', async () => {
    installManagerHost();
    let bindings: BindingMap = resolveBindings(
      JSON.stringify({
        'plugins-list:j': null,
        'plugins-list:<Down>': null,
        'plugins-list:n': 'uiNext',
        'plugins-list:gg': null,
        'plugins-list:<F1>': 'uiFirst',
        'plugins-list:G': null,
        'plugins-list:<F2>': 'uiLast',
        'plugins-list:/': null,
        'plugins-list:<F3>': 'uiSearch',
        'plugins-input:<Esc>': null,
        'plugins-input:<F4>': 'uiFocusList',
        'plugins-list:q': null,
        'plugins-list:<Esc>': null,
        'plugins-list:<F5>': 'uiCancel',
      }),
    );
    const { window, state, panel } = createPanelFixture(() => bindings);
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    for (const retired of ['j', 'ArrowDown', '/', 'Escape', 'q']) {
      const event = pickerKey(retired, state.overlay);
      panel.handleKey(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    panel.handleKey(pickerKey('n', state.overlay));
    expect(state.selected).toBe(1);
    panel.handleKey(pickerKey('F2', state.overlay));
    expect(state.selected).toBe(2);
    panel.handleKey(pickerKey('F1', state.overlay));
    expect(state.selected).toBe(0);
    panel.handleKey(pickerKey('d', state.overlay, { ctrl: true }));
    expect(state.selected).toBe(2);
    panel.handleKey(pickerKey('u', state.overlay, { ctrl: true }));
    expect(state.selected).toBe(0);
    panel.handleKey(pickerKey('F3', state.overlay));
    const input = state.input as HTMLInputElement & { emit(type: string): void };
    expect(window.document.activeElement).toBe(input);
    expect(state.footer?.textContent).toContain('<F4>');
    bindings = {
      ...bindings,
      'plugins-input:j': 'uiFocusList',
      'plugins-input:<BS>': 'uiFocusList',
      'plugins-input:<C-M-l>': 'uiFocusList',
      'plugins-input:<C-Insert>': 'uiFocusList',
      'plugins-input:<S-Insert>': 'uiFocusList',
    };
    const altGraph = Object.assign(pickerKey('l', input, { ctrl: true }), {
      altKey: true,
      getModifierState: (modifier: string) => modifier === 'AltGraph',
    });
    panel.handleKey(altGraph);
    expect(altGraph.preventDefault).not.toHaveBeenCalled();
    for (const value of ['j', 'Backspace', 'ArrowLeft', 'Tab']) {
      const native = pickerKey(value, input);
      panel.handleKey(native);
      expect(native.preventDefault).not.toHaveBeenCalled();
    }
    for (const modifiers of [{ ctrl: true }, { shift: true }]) {
      const native = pickerKey('Insert', input, modifiers);
      panel.handleKey(native);
      expect(native.preventDefault).not.toHaveBeenCalled();
      expect(window.document.activeElement).toBe(input);
    }
    input.emit('compositionstart');
    input.value = 'Beta';
    input.emit('input');
    const ime = pickerKey('F4', input);
    panel.handleKey(ime);
    expect(ime.preventDefault).not.toHaveBeenCalled();
    expect(state.filtered).toHaveLength(3);
    expect(window.document.activeElement).toBe(input);
    input.emit('compositionend');
    input.emit('input');
    expect(state.filtered.map((plugin) => plugin.id)).toEqual(['beta@example.test']);
    panel.handleKey(pickerKey('F4', input));
    expect(window.document.activeElement).toBe(state.overlay);
    const outside = pickerKey(
      'F5',
      window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div'),
    );
    panel.handleKey(outside);
    expect(outside.preventDefault).not.toHaveBeenCalled();
    expect(state.open).toBe(true);
    panel.handleKey(pickerKey('F5', state.overlay));
    expect(state.open).toBe(false);
  });

  it('fences exact-prefix waits and detached events on focus, close/reopen, IME and disposal', async () => {
    vi.useFakeTimers();
    installManagerHost();
    const bindings = resolveBindings(
      JSON.stringify({
        'plugins-list:a': 'uiNext',
        'plugins-list:ab': 'pluginsDisable',
        'plugins-input:<F1>': 'uiFocusList',
        'plugins-input:<F1><F1>': 'uiFocusList',
      }),
    );
    const { window, state, panel, host } = createPanelFixture(() => bindings);
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('a', state.overlay));
    state.input!.focus();
    vi.advanceTimersByTime(2000);
    expect(state.selected).toBe(0);
    panel.handleKey(pickerKey('F1', state.input));
    const oldInput = state.input as HTMLInputElement & { emit(type: string): void };
    oldInput.emit('compositionstart');
    vi.advanceTimersByTime(2000);
    expect(window.document.activeElement).toBe(oldInput);
    oldInput.emit('compositionend');
    state.overlay!.focus();
    panel.handleKey(pickerKey('a', state.overlay));
    const oldOverlay = state.overlay!;
    panel.close();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    oldInput.value = 'stale';
    oldInput.emit('input');
    oldInput.emit('focus');
    const stale = pickerKey('q', oldOverlay);
    panel.handleKey(stale);
    vi.advanceTimersByTime(2000);
    expect(stale.preventDefault).not.toHaveBeenCalled();
    expect(state.open).toBe(true);
    expect(state.query).toBe('');
    expect(state.selected).toBe(0);
    panel.handleKey(pickerKey('a', state.overlay));
    host.dispose();
    vi.advanceTimersByTime(2000);
    expect(state.open).toBe(false);
  });

  it('preserves the current query selection when an earlier refresh completes', async () => {
    const host = installManagerHost();
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('j', state.overlay));
    expect(state.filtered[state.selected]?.id).toBe(host.beta.id);

    const pending = Promise.withResolvers<[typeof host.alpha, typeof host.beta, typeof host.neo]>();
    host.manager.getAddonsByTypes.mockReturnValueOnce(pending.promise);
    const refresh = panel.refresh();
    const input = state.input as HTMLInputElement & { emit(type: string): void };
    input.value = 'a';
    input.emit('input');
    expect(state.filtered[state.selected]?.id).toBe(host.alpha.id);

    pending.resolve([host.alpha, host.beta, host.neo]);
    await refresh;
    expect(state.query).toBe('a');
    expect(state.filtered[state.selected]?.id).toBe(host.alpha.id);
    panel.handleKey(pickerKey('e', state.overlay));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(host.alpha.enable).toHaveBeenCalledOnce();
    expect(host.beta.enable).not.toHaveBeenCalled();
    panel.close();
  });

  it('preserves permissions, surfaces domain failures and discards lifecycle completion after close/reopen', async () => {
    const host = installManagerHost();
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('G', state.overlay));
    panel.handleKey(pickerKey('d', state.overlay));
    expect(host.neo.disable).not.toHaveBeenCalled();
    expect(state.notice).toContain('cannot disable itself');
    panel.handleKey(pickerKey('Home', state.overlay));
    host.alpha.enable.mockRejectedValueOnce(new Error('host rejected mutation'));
    panel.handleKey(pickerKey('e', state.overlay));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(state.notice).toContain('host rejected mutation');
    expect(state.open).toBe(true);
    let release: (() => void) | undefined;
    host.alpha.enable.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    panel.handleKey(pickerKey('e', state.overlay));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    panel.close();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const loads = host.manager.getAddonsByTypes.mock.calls.length;
    release!();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.notice).toBe('');
    expect(state.busy).toBe(false);
    expect(host.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads);
    panel.close();
    host.manager.getAddonsByTypes.mockRejectedValueOnce(new Error('load unavailable'));
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    expect(state.error).toContain('load unavailable');
    expect(state.list?.textContent).toContain('Unable to load plugins');
    panel.close();
  });

  it('does not let a detached overlay close its replacement panel', async () => {
    installManagerHost();
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const oldOverlay = state.overlay as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    panel.close();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));

    oldOverlay.emit('mousedown', { target: oldOverlay });

    expect(state.open).toBe(true);
    expect(state.overlay?.isConnected).toBe(true);
    panel.close();
  });

  it('releases its overlay and input ownership even when theme cleanup fails', async () => {
    installManagerHost();
    const failure = new Error('theme cleanup failed');
    const { state, panel } = createPanelFixture(undefined, () => () => {
      throw failure;
    });
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const overlay = state.overlay!;

    expect(() => panel.close()).toThrow(failure);

    expect(state.open).toBe(false);
    expect(state.localBindings).toBeNull();
    expect(overlay.isConnected).toBe(false);
  });
});

function createModuleFixture(themeRoot?: (root: HTMLElement) => () => void) {
  const { window, session, bodyChildren } = createPickerHarness();
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  const module = createExtensionsModule(host, {
    window,
    logger,
    bindings: () => DEFAULT_BINDINGS,
    themeRoot: themeRoot ?? ((root) => session.theme.add(root)),
  });
  return { host, module, bodyChildren };
}

function panelElements(overlay: HTMLElement) {
  const panel = overlay.children[0] as HTMLElement;
  const header = panel.children[0] as HTMLElement;
  const content = panel.children[1] as HTMLElement;
  return {
    input: header.children[2] as HTMLInputElement & { emit(type: string): void },
    list: content.children[0] as HTMLElement,
    details: content.children[1] as HTMLElement,
  };
}

describe('extensions module lifetime', () => {
  it('does not paint or respond to detached events after retirement during a pending refresh', async () => {
    const native = installManagerHost();
    const pending =
      Promise.withResolvers<[typeof native.alpha, typeof native.beta, typeof native.neo]>();
    native.manager.getAddonsByTypes.mockReturnValueOnce(pending.promise);
    const { host, module, bodyChildren } = createModuleFixture();
    expect(module.open('main-normal')).toBe(true);
    const overlay = bodyChildren[0] as HTMLElement & {
      emit(type: string, event?: Partial<Event>): void;
    };
    const { input, list, details } = panelElements(overlay);
    host.dispose();
    expect(module.isOpen).toBe(false);
    expect(overlay.isConnected).toBe(false);
    const before = [list.textContent, details.textContent];

    input.value = 'Beta';
    input.emit('input');
    overlay.emit('mousedown', { target: overlay });
    const key = pickerKey('q', overlay);
    module.handleKey(key);
    pending.resolve([native.alpha, native.beta, native.neo]);
    await pending.promise;
    // The native bridge and panel each resume through several promise layers.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(key.preventDefault).not.toHaveBeenCalled();
    expect([list.textContent, details.textContent]).toEqual(before);
    expect(module.isOpen).toBe(false);
  });

  it('lets an admitted native mutation finish without painting a retired panel', async () => {
    const native = installManagerHost();
    const pending = Promise.withResolvers<void>();
    native.alpha.enable.mockReturnValueOnce(pending.promise);
    const { host, module, bodyChildren } = createModuleFixture();
    module.open('main-normal');
    const overlay = bodyChildren[0];
    const { list, details } = panelElements(overlay);
    await vi.waitFor(() => expect(list.textContent).toContain('Alpha'));
    module.handleKey(pickerKey('e', overlay));
    await vi.waitFor(() => expect(native.alpha.enable).toHaveBeenCalledOnce());
    const loads = native.manager.getAddonsByTypes.mock.calls.length;
    host.dispose();
    const before = [list.textContent, details.textContent];
    pending.resolve();
    await pending.promise;
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(native.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads);
    expect([list.textContent, details.textContent]).toEqual(before);
    expect(module.isOpen).toBe(false);
    expect(overlay.isConnected).toBe(false);
  });

  it('keeps two window hosts independent when one is retired', async () => {
    installManagerHost();
    const first = createModuleFixture();
    const second = createModuleFixture();
    expect(first.module.open('main-normal')).toBe(true);
    expect(second.module.open('reader-normal')).toBe(true);
    const firstOverlay = first.bodyChildren[0];
    const secondOverlay = second.bodyChildren[0];
    const firstPanel = panelElements(firstOverlay);
    const secondPanel = panelElements(secondOverlay);
    await vi.waitFor(() => expect(secondPanel.list.textContent).toContain('Beta'));
    await vi.waitFor(() => expect(firstPanel.list.textContent).toContain('Beta'));
    firstPanel.input.value = 'Beta';
    firstPanel.input.emit('input');
    expect(firstPanel.list.textContent).not.toContain('Alpha');
    expect(secondPanel.list.textContent).toContain('Alpha');
    first.host.dispose();
    expect(first.module.isOpen).toBe(false);
    expect(firstOverlay.isConnected).toBe(false);
    expect(second.module.isOpen).toBe(true);
    expect(secondOverlay.isConnected).toBe(true);
    second.module.handleKey(pickerKey('q', secondOverlay));
    expect(second.module.isOpen).toBe(false);
    second.host.dispose();
  });

  it('releases a partially opened panel when theme acquisition throws', () => {
    installManagerHost();
    const failure = new Error('theme acquisition failed');
    const { host, module, bodyChildren } = createModuleFixture(() => {
      throw failure;
    });
    expect(() => module.open('main-normal')).toThrow(failure);
    expect(module.isOpen).toBe(false);
    expect(bodyChildren.every((overlay) => !overlay.isConnected)).toBe(true);
    host.dispose();
  });
});
