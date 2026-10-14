import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterInstalledPlugins, PluginManagerPanel } from '../../src/main/plugin-manager';
import type { InstalledPlugin } from '../../src/main/plugin-host';
import { resolveBindings, type BindingMap } from '../../src/input/bindings';
import { ZOTERO_NEO_PLUGIN_ID } from '../../src/main/plugin-host';
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

describe('configurable plugin manager contexts', () => {
  it('executes rebinding for every plugin operation and derives both footer and details discovery', async () => {
    const host = installManagerHost();
    const { window, session } = createPickerHarness();
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
    const panel = new PluginManagerPanel({ debug: vi.fn(), diagnostic: vi.fn() }, () => bindings);
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    const key = (value: string): void =>
      panel.handleKey(pickerKey(value, session.pluginManager.overlay), window, session);
    for (const retired of ['e', 'd', 'p', 'o', 'R', 'L', 'r']) {
      const event = pickerKey(retired, session.pluginManager.overlay);
      panel.handleKey(event, window, session);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(host.alpha.enable).not.toHaveBeenCalled();
    expect(session.pluginManager.footer?.textContent).toContain('<F1>');
    expect(session.pluginManager.details?.textContent).toContain('<F1>');
    key('F1');
    await vi.waitFor(() => expect(session.pluginManager.busy).toBe(false));
    expect(host.alpha.enable).toHaveBeenCalledOnce();
    expect(session.pluginManager.filtered[0]?.enabled).toBe(true);
    expect(session.pluginManager.details?.textContent).toContain('<F2>');
    key('F2');
    await vi.waitFor(() => expect(session.pluginManager.busy).toBe(false));
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
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    expect(host.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads + 1);
    panel.close(session);
  });

  it('rebinds list/search/cancel independently and preserves native query editing and IME', async () => {
    installManagerHost();
    const { window, session } = createPickerHarness();
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
    const panel = new PluginManagerPanel({ debug: vi.fn(), diagnostic: vi.fn() }, () => bindings);
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    for (const retired of ['j', 'ArrowDown', '/', 'Escape', 'q']) {
      const event = pickerKey(retired, session.pluginManager.overlay);
      panel.handleKey(event, window, session);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    panel.handleKey(pickerKey('n', session.pluginManager.overlay), window, session);
    expect(session.pluginManager.selected).toBe(1);
    panel.handleKey(pickerKey('F2', session.pluginManager.overlay), window, session);
    expect(session.pluginManager.selected).toBe(2);
    panel.handleKey(pickerKey('F1', session.pluginManager.overlay), window, session);
    expect(session.pluginManager.selected).toBe(0);
    panel.handleKey(pickerKey('d', session.pluginManager.overlay, { ctrl: true }), window, session);
    expect(session.pluginManager.selected).toBe(2);
    panel.handleKey(pickerKey('u', session.pluginManager.overlay, { ctrl: true }), window, session);
    expect(session.pluginManager.selected).toBe(0);
    panel.handleKey(pickerKey('F3', session.pluginManager.overlay), window, session);
    const input = session.pluginManager.input as HTMLInputElement & { emit(type: string): void };
    expect(window.document.activeElement).toBe(input);
    expect(session.pluginManager.footer?.textContent).toContain('<F4>');
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
    panel.handleKey(altGraph, window, session);
    expect(altGraph.preventDefault).not.toHaveBeenCalled();
    for (const value of ['j', 'Backspace', 'ArrowLeft', 'Tab']) {
      const native = pickerKey(value, input);
      panel.handleKey(native, window, session);
      expect(native.preventDefault).not.toHaveBeenCalled();
    }
    for (const modifiers of [{ ctrl: true }, { shift: true }]) {
      const native = pickerKey('Insert', input, modifiers);
      panel.handleKey(native, window, session);
      expect(native.preventDefault).not.toHaveBeenCalled();
      expect(window.document.activeElement).toBe(input);
    }
    input.emit('compositionstart');
    input.value = 'Beta';
    input.emit('input');
    const ime = pickerKey('F4', input);
    panel.handleKey(ime, window, session);
    expect(ime.preventDefault).not.toHaveBeenCalled();
    expect(session.pluginManager.filtered).toHaveLength(3);
    expect(window.document.activeElement).toBe(input);
    input.emit('compositionend');
    input.emit('input');
    expect(session.pluginManager.filtered.map((plugin) => plugin.id)).toEqual([
      'beta@example.test',
    ]);
    panel.handleKey(pickerKey('F4', input), window, session);
    expect(window.document.activeElement).toBe(session.pluginManager.overlay);
    const outside = pickerKey(
      'F5',
      window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div'),
    );
    panel.handleKey(outside, window, session);
    expect(outside.preventDefault).not.toHaveBeenCalled();
    expect(session.pluginManager.open).toBe(true);
    panel.handleKey(pickerKey('F5', session.pluginManager.overlay), window, session);
    expect(session.pluginManager.open).toBe(false);
  });

  it('fences exact-prefix waits and detached events on focus, close/reopen, IME and disposal', async () => {
    vi.useFakeTimers();
    installManagerHost();
    const { window, session, cleanups } = createPickerHarness();
    const bindings = resolveBindings(
      JSON.stringify({
        'plugins-list:a': 'uiNext',
        'plugins-list:ab': 'pluginsDisable',
        'plugins-input:<F1>': 'uiFocusList',
        'plugins-input:<F1><F1>': 'uiFocusList',
      }),
    );
    const panel = new PluginManagerPanel({ debug: vi.fn(), diagnostic: vi.fn() }, () => bindings);
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    panel.handleKey(pickerKey('a', session.pluginManager.overlay), window, session);
    session.pluginManager.input!.focus();
    vi.advanceTimersByTime(2000);
    expect(session.pluginManager.selected).toBe(0);
    panel.handleKey(pickerKey('F1', session.pluginManager.input), window, session);
    const oldInput = session.pluginManager.input as HTMLInputElement & { emit(type: string): void };
    oldInput.emit('compositionstart');
    vi.advanceTimersByTime(2000);
    expect(window.document.activeElement).toBe(oldInput);
    oldInput.emit('compositionend');
    session.pluginManager.overlay!.focus();
    panel.handleKey(pickerKey('a', session.pluginManager.overlay), window, session);
    const oldOverlay = session.pluginManager.overlay!;
    panel.close(session);
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    oldInput.value = 'stale';
    oldInput.emit('input');
    oldInput.emit('focus');
    const stale = pickerKey('q', oldOverlay);
    panel.handleKey(stale, window, session);
    vi.advanceTimersByTime(2000);
    expect(stale.preventDefault).not.toHaveBeenCalled();
    expect(session.pluginManager.open).toBe(true);
    expect(session.pluginManager.query).toBe('');
    expect(session.pluginManager.selected).toBe(0);
    expect(cleanups).toHaveLength(1);
    panel.handleKey(pickerKey('a', session.pluginManager.overlay), window, session);
    cleanups.forEach((cleanup) => cleanup());
    vi.advanceTimersByTime(2000);
    expect(session.pluginManager.open).toBe(false);
  });

  it('preserves the current query selection when an earlier refresh completes', async () => {
    const host = installManagerHost();
    const { window, session } = createPickerHarness();
    const panel = new PluginManagerPanel({ debug: vi.fn(), diagnostic: vi.fn() });
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    panel.handleKey(pickerKey('j', session.pluginManager.overlay), window, session);
    expect(session.pluginManager.filtered[session.pluginManager.selected]?.id).toBe(host.beta.id);

    const pending = Promise.withResolvers<[typeof host.alpha, typeof host.beta, typeof host.neo]>();
    host.manager.getAddonsByTypes.mockReturnValueOnce(pending.promise);
    const refresh = panel.refresh(window, session);
    const input = session.pluginManager.input as HTMLInputElement & { emit(type: string): void };
    input.value = 'a';
    input.emit('input');
    expect(session.pluginManager.filtered[session.pluginManager.selected]?.id).toBe(host.alpha.id);

    pending.resolve([host.alpha, host.beta, host.neo]);
    await refresh;
    expect(session.pluginManager.query).toBe('a');
    expect(session.pluginManager.filtered[session.pluginManager.selected]?.id).toBe(host.alpha.id);
    panel.handleKey(pickerKey('e', session.pluginManager.overlay), window, session);
    await vi.waitFor(() => expect(session.pluginManager.busy).toBe(false));
    expect(host.alpha.enable).toHaveBeenCalledOnce();
    expect(host.beta.enable).not.toHaveBeenCalled();
    panel.close(session);
  });

  it('preserves permissions, surfaces domain failures and discards lifecycle completion after close/reopen', async () => {
    const host = installManagerHost();
    const { window, session } = createPickerHarness();
    const panel = new PluginManagerPanel({ debug: vi.fn(), diagnostic: vi.fn() });
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    panel.handleKey(pickerKey('G', session.pluginManager.overlay), window, session);
    panel.handleKey(pickerKey('d', session.pluginManager.overlay), window, session);
    expect(host.neo.disable).not.toHaveBeenCalled();
    expect(session.pluginManager.notice).toContain('cannot disable itself');
    panel.handleKey(pickerKey('Home', session.pluginManager.overlay), window, session);
    host.alpha.enable.mockRejectedValueOnce(new Error('host rejected mutation'));
    panel.handleKey(pickerKey('e', session.pluginManager.overlay), window, session);
    await vi.waitFor(() => expect(session.pluginManager.busy).toBe(false));
    expect(session.pluginManager.notice).toContain('host rejected mutation');
    expect(session.pluginManager.open).toBe(true);
    let release: (() => void) | undefined;
    host.alpha.enable.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    panel.handleKey(pickerKey('e', session.pluginManager.overlay), window, session);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    panel.close(session);
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    const loads = host.manager.getAddonsByTypes.mock.calls.length;
    release!();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.pluginManager.notice).toBe('');
    expect(session.pluginManager.busy).toBe(false);
    expect(host.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads);
    panel.close(session);
    host.manager.getAddonsByTypes.mockRejectedValueOnce(new Error('load unavailable'));
    panel.open(window, session);
    await vi.waitFor(() => expect(session.pluginManager.loading).toBe(false));
    expect(session.pluginManager.error).toContain('load unavailable');
    expect(session.pluginManager.list?.textContent).toContain('Unable to load plugins');
    panel.close(session);
  });
});
