import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterInstalledPlugins, PluginManagerPanel } from '../../src/modules/extensions/panel';
import { PluginManagerRuntime } from '../../src/modules/extensions/runtime';
import { ModuleHost } from '../../src/core/module-host';
import { createExtensionsModule } from '../../src/modules/extensions';
import type { InstalledPlugin } from '../../src/modules/extensions/host';
import { DEFAULT_BINDINGS, resolveBindings, type BindingMap } from '../../src/input/bindings';
import { ZOTERO_NEO_PLUGIN_ID } from '../../src/modules/extensions/host';
import {
  ExtensionSourceWriteError,
  forgetExtensionSource,
  installExtension,
  updateExtension,
} from '../../src/modules/extensions/operations';
import type * as ExtensionOperations from '../../src/modules/extensions/operations';
import { createPickerHarness, pickerKey } from './feature-panel-harness';
import type {
  ExtensionsReactCommand,
  ExtensionsReactModel,
} from '../../src/modules/extensions/react-model';

vi.mock('../../src/modules/extensions/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof ExtensionOperations>();
  return {
    ...actual,
    installExtension: vi.fn(actual.installExtension),
    updateExtension: vi.fn(actual.updateExtension),
    forgetExtensionSource: vi.fn(),
  };
});

vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView(options: {
    root: HTMLElement;
    model: ExtensionsReactModel;
    dispatch: (command: ExtensionsReactCommand) => void;
    isCurrent: () => boolean;
  }) {
    const create = (tag: string) =>
      options.root.ownerDocument.createElementNS(
        'http://www.w3.org/1999/xhtml',
        tag,
      ) as HTMLElement;
    const panel = create('section');
    const header = create('header');
    const title = create('strong');
    const count = create('span');
    const input = create('input');
    const content = create('div');
    const list = create('div');
    const details = create('div');
    const footer = create('footer');
    const restart = create('div');
    const inline = create('div');
    header.append(title, count, input);
    content.append(list, details);
    panel.append(header, content, footer, restart, inline);
    options.root.append(panel);
    const parts: Record<string, HTMLElement> = { input, list, details, count, footer };
    let source: HTMLInputElement | null = null;
    let disposed = false;
    const update = (model: ExtensionsReactModel): void => {
      if (disposed || !options.isCurrent()) return;
      count.textContent = model.count;
      footer.textContent = model.footer;
      restart.textContent = model.needsRestart ? 'Restart required' : '';
      if (model.inline?.kind === 'source' && !source) {
        source = create('input') as HTMLInputElement;
        parts['install-input'] = source;
        inline.append(source);
      } else if (model.inline?.kind !== 'source' && source) {
        inline.replaceChildren();
        delete parts['install-input'];
        source = null;
      }
      const selected = model.plugins[model.selected];
      details.textContent = selected
        ? `${selected.name} ${model.shortcuts}`
        : 'No plugin selected.';
      if (model.listMessage) {
        list.replaceChildren();
        list.textContent = model.listMessage;
      } else {
        list.replaceChildren(
          ...model.plugins.map((plugin, index) => {
            const row = create('div');
            row.textContent = plugin.name;
            row.addEventListener('click', () => options.dispatch({ type: 'select', index }));
            return row;
          }),
        );
      }
    };
    update(options.model);
    return {
      ready: Promise.resolve(),
      update,
      getElement: (part: string) => (disposed ? null : (parts[part] ?? null)),
      dispose: () => {
        disposed = true;
      },
    };
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const plugins: readonly InstalledPlugin[] = [
  {
    id: 'better-bibtex@iris-advies.com',
    name: 'Better BibTeX for Zotero',
    version: '9.1.2',
    enabled: true,
    canEnable: true,
    canDisable: true,
    canUninstall: true,
    description: 'Citation key management and BibTeX export',
  },
  {
    id: 'zotero-actions-tags@windingwind.com',
    name: 'Actions & Tags for Zotero',
    version: '2.1.0',
    enabled: false,
    canEnable: true,
    canDisable: true,
    canUninstall: true,
    description: '',
  },
  {
    id: 'translate-for-zotero@example.org',
    name: 'Translate for Zotero',
    version: '3.0.0',
    enabled: true,
    canEnable: true,
    canDisable: true,
    canUninstall: true,
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
    permissions: 7,
    pendingOperations: 0,
    updateURL: 'https://example.test/alpha-updates.json',
    findUpdates(listener: { onUpdateFinished: (addon: unknown, error: number) => void }) {
      listener.onUpdateFinished(alpha, 0);
    },
    homepageURL: 'https://github.com/example/alpha',
    enable: vi.fn(async () => {
      alpha.isActive = true;
    }),
    disable: vi.fn(async () => {
      alpha.isActive = false;
    }),
    uninstall: vi.fn(async (): Promise<void> => {
      addons.splice(addons.indexOf(alpha), 1);
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
    permissions: 7,
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
  };
  const addons = [alpha, beta, neo];
  const manager = {
    PERM_CAN_UNINSTALL: 1,
    PERM_CAN_ENABLE: 2,
    PERM_CAN_DISABLE: 4,
    PENDING_INSTALL: 8,
    PENDING_UPGRADE: 16,
    UPDATE_WHEN_USER_REQUESTED: 1,
    UPDATE_STATUS_NO_ERROR: 0,
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
  language: 'en' | 'zh-CN' = 'en',
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
      language: () => language,
    });
    scope.add(() => instance.close());
    return instance;
  });
  return { window, state, host, panel, logger };
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
    expect(state.footer?.textContent).not.toContain('<F1>');
    expect(state.footer?.textContent).toBe('k/j Move · / Filter · i Install · <Esc> Close');
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
    expect(state.footer?.textContent).toBe('k/n Move · <F3> Filter · i Install · <F5> Close');
    for (const retired of ['j', 'ArrowDown', '/', 'Escape', 'q']) {
      const event = pickerKey(retired, state.overlay);
      panel.handleKey(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    panel.handleKey(pickerKey('n', state.overlay));
    expect(state.selected).toBe(1);
    panel.handleKey(pickerKey('F2', state.overlay));
    expect(state.filtered[state.selected]?.id).toBe(state.filtered.at(-1)?.id);
    panel.handleKey(pickerKey('F1', state.overlay));
    expect(state.selected).toBe(0);
    panel.handleKey(pickerKey('d', state.overlay, { ctrl: true }));
    expect(state.filtered[state.selected]?.id).toBe(state.filtered.at(-1)?.id);
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
    expect(state.filtered.map(({ id }) => id)).toEqual([
      'alpha@example.test',
      'beta@example.test',
      ZOTERO_NEO_PLUGIN_ID,
    ]);
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

  it('keeps native pending restart status after reopen and a no-update check', async () => {
    const native = installManagerHost();
    const { state, panel, window } = createPanelFixture();
    const confirm = vi.fn(() => true);
    Reflect.set(window, 'confirm', confirm);
    for (const pending of [native.manager.PENDING_INSTALL, native.manager.PENDING_UPGRADE]) {
      native.alpha.pendingOperations = pending;
      panel.open();
      await vi.waitFor(() => expect(state.loading).toBe(false));
      expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
      panel.close();
      panel.open();
      await vi.waitFor(() => expect(state.loading).toBe(false));
      expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
      panel.handleKey(pickerKey('u', state.overlay));
      await vi.waitFor(() => expect(state.notice).toContain('No update available'));
      expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
      expect(confirm).not.toHaveBeenCalled();
      panel.close();
    }
  });
  it('opens the source editor from an empty filtered list and waits for explicit confirmation', async () => {
    installManagerHost();
    const install = vi.mocked(installExtension).mockResolvedValueOnce({ pendingRestart: true });
    const url = 'https://packages.example.org/reader-tools.xpi';
    const { state, panel, window } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const filter = state.input as HTMLInputElement & { emit(type: string): void };
    filter.value = 'Reader Tools';
    filter.emit('input');
    expect(state.list?.textContent).toContain('No matching plugins');
    panel.handleKey(pickerKey('i', state.overlay));
    const source = state.sourceInput as HTMLInputElement & { emit(type: string): void };
    expect(window.document.activeElement).toBe(source);
    source.value = url;
    panel.handleKey(pickerKey('Enter', source, { isComposing: true }));
    expect(state.inline?.kind).toBe('source');
    source.emit('compositionstart');
    panel.handleKey(pickerKey('Enter', source));
    expect(state.inline?.kind).toBe('source');
    source.emit('compositionend');
    panel.handleKey(pickerKey('Enter', source));
    await vi.waitFor(() => expect(state.inline?.kind).toBe('install'));
    expect(state.inline).toMatchObject({
      kind: 'install',
      candidate: { name: 'reader-tools.xpi', url },
    });
    expect(install).not.toHaveBeenCalled();
    panel.handleKey(pickerKey('Escape', state.overlay));
    expect(state.inline).toBeNull();
    expect(state.open).toBe(true);
    expect(state.input?.value).toBe('Reader Tools');
    panel.handleKey(pickerKey('i', state.overlay));
    state.sourceInput!.value = url;
    panel.handleKey(pickerKey('Enter', state.sourceInput));
    await vi.waitFor(() => expect(state.inline?.kind).toBe('install'));
    panel.handleKey(Object.assign(pickerKey('Enter', state.overlay), { repeat: true }));
    expect(install).not.toHaveBeenCalled();
    panel.handleKey(pickerKey('Enter', state.overlay));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(install).toHaveBeenCalledOnce();
    panel.close();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
    panel.close();
  });

  it('chooses a GitHub release asset with arrows and confirms the exact source before native installation', async () => {
    installManagerHost();
    const origin = 'https://github.com/example/addon/releases/download/v2.1';
    const fetch = vi.fn(async () =>
      Response.json({
        tag_name: 'v2.1',
        assets: ['alpha.xpi', 'beta.xpi'].map((name) => ({
          name,
          state: 'uploaded',
          browser_download_url: `${origin}/${name}`,
        })),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const install = vi.mocked(installExtension).mockResolvedValueOnce({ pendingRestart: false });
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('i', state.overlay));
    state.sourceInput!.value = 'example/addon';
    panel.handleKey(pickerKey('Enter', state.sourceInput));
    await vi.waitFor(() => expect(state.inline?.kind).toBe('choose'));
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.github.com/repos/example/addon/releases/latest',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    panel.handleKey(pickerKey('ArrowDown', state.overlay));
    panel.handleKey(pickerKey('Enter', state.overlay));
    expect(state.inline).toMatchObject({
      kind: 'install',
      candidate: { name: 'beta.xpi', url: `${origin}/beta.xpi`, version: '2.1' },
    });
    expect(install).not.toHaveBeenCalled();
    panel.handleKey(pickerKey('Enter', state.overlay));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(install).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'beta.xpi', url: `${origin}/beta.xpi` }),
      expect.anything(),
    );
    panel.close();
  });

  it('confirms a direct XPI without prefetch and distinguishes source-save failure from failed installation', async () => {
    installManagerHost();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const install = vi
      .mocked(installExtension)
      .mockRejectedValueOnce(new ExtensionSourceWriteError(true));
    const { state, panel } = createPanelFixture(undefined, undefined, 'zh-CN');
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('i', state.overlay));
    const url = 'https://example.test/zotero-extensions/alpha.xpi';
    state.sourceInput!.value = url;
    panel.handleKey(pickerKey('Enter', state.sourceInput));
    await vi.waitFor(() => expect(state.inline?.kind).toBe('install'));
    expect(state.inline).toMatchObject({ kind: 'install', candidate: { name: 'alpha.xpi', url } });
    expect(fetch).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    panel.handleKey(pickerKey('Enter', state.overlay));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(state.notice).toContain('扩展已更改，但无法保存安装来源');
    expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
    panel.close();
  });

  it('requires one uninstall confirmation and protects Neo and non-uninstallable plugins', async () => {
    const native = installManagerHost();
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const key = (value: string): void => panel.handleKey(pickerKey(value, state.overlay));
    key('G');
    key('x');
    expect(state.inline).toBeNull();
    expect(native.neo.uninstall).not.toHaveBeenCalled();
    key('k');
    key('x');
    expect(state.inline).toBeNull();
    expect(state.notice).toContain('Beta cannot be uninstalled');
    key('k');
    key('x');
    expect(state.inline).toMatchObject({ kind: 'uninstall', plugin: { id: native.alpha.id } });
    expect(native.alpha.uninstall).not.toHaveBeenCalled();
    key('Escape');
    expect(state.open).toBe(true);
    expect(state.inline).toBeNull();
    expect(forgetExtensionSource).not.toHaveBeenCalled();
    key('x');
    key('Enter');
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(native.alpha.uninstall).toHaveBeenCalledOnce();
    expect(forgetExtensionSource).toHaveBeenCalledExactlyOnceWith(native.alpha.id);
    expect(state.plugins.map(({ id }) => id)).not.toContain(native.alpha.id);
    panel.close();
  });

  it('updates all third-party plugins sequentially despite a failure and reports each outcome', async () => {
    const native = installManagerHost();
    const delta = { ...native.beta, name: 'Delta', id: 'delta@example.test' };
    const gamma = { ...native.beta, name: 'Gamma', id: 'gamma@example.test' };
    native.manager.getAddonsByTypes.mockResolvedValue([
      native.alpha,
      native.beta,
      delta,
      gamma,
      native.neo,
    ]);
    const failure = Promise.withResolvers<never>();
    const update = vi
      .mocked(updateExtension)
      .mockReturnValueOnce(failure.promise)
      .mockResolvedValueOnce({ pendingRestart: true })
      .mockResolvedValueOnce('current')
      .mockResolvedValueOnce('skipped');
    const { state, panel, logger } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const filter = state.input as HTMLInputElement & { emit(type: string): void };
    filter.value = 'Beta';
    filter.emit('input');
    panel.handleKey(pickerKey('U', state.overlay, { shift: true }));
    expect(update.mock.calls.map(([plugin]) => plugin.id)).toEqual([native.alpha.id]);
    failure.reject(new Error('native detail for diagnostic only'));
    await vi.waitFor(() => expect(state.busy).toBe(false));
    expect(update.mock.calls.map(([plugin]) => plugin.id)).toEqual([
      native.alpha.id,
      native.beta.id,
      delta.id,
      gamma.id,
    ]);
    expect(state.report).toEqual([
      'Updated: Beta',
      'Already up to date: Delta',
      'Skipped (no supported update source): Gamma',
      'Alpha failed: Zotero could not complete the extension operation.',
    ]);
    expect(state.notice).toContain('1 updated, 1 current, 1 skipped, 1 failed');
    expect(logger.diagnostic).toHaveBeenCalledWith(
      expect.stringContaining('native detail for diagnostic only'),
    );
    expect(panelElements(state.overlay!).restart.textContent).toContain('Restart required');
    expect(state.filtered.map(({ name }) => name)).toEqual(['Beta']);
    panel.close();
  });

  it('cancels a batch and never starts more updates or paints a replacement panel', async () => {
    const native = installManagerHost();
    const pending = Promise.withResolvers<{ pendingRestart: boolean }>();
    const cancel = vi.fn();
    const update = vi.mocked(updateExtension).mockImplementationOnce((_plugin, transport) => {
      transport.registerCancel(cancel);
      return pending.promise;
    });
    const { state, panel } = createPanelFixture();
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    panel.handleKey(pickerKey('U', state.overlay, { shift: true }));
    const transport = update.mock.calls[0][1];
    panel.handleKey(pickerKey('Escape', state.overlay));
    expect(state.open).toBe(true);
    expect(transport.signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    panel.handleKey(pickerKey('Escape', state.overlay));
    expect(state.open).toBe(false);
    panel.open();
    await vi.waitFor(() => expect(state.loading).toBe(false));
    const loads = native.manager.getAddonsByTypes.mock.calls.length;
    pending.resolve({ pendingRestart: true });
    await pending.promise;
    expect(update).toHaveBeenCalledOnce();
    expect(native.manager.getAddonsByTypes).toHaveBeenCalledTimes(loads);
    expect(state.report).toEqual([]);
    expect(state.notice).toBe('');
    expect(panelElements(state.overlay!).restart.textContent).toBe('');
    panel.close();
  });

  it('preserves permissions, surfaces domain failures and discards lifecycle completion after close/reopen', async () => {
    const host = installManagerHost();
    const { state, panel, logger } = createPanelFixture();
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
    expect(state.notice).toContain('Zotero could not complete');
    expect(state.notice).not.toContain('host rejected mutation');
    expect(logger.diagnostic).toHaveBeenCalledWith(
      expect.stringContaining('host rejected mutation'),
    );
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
    expect(state.error).not.toContain('load unavailable');
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
    language: () => 'en',
  });
  return { host, module, bodyChildren };
}

function panelElements(overlay: HTMLElement) {
  const panel = overlay.children[0].children[0] as HTMLElement;
  const header = panel.children[0] as HTMLElement;
  const content = panel.children[1] as HTMLElement;
  return {
    input: header.children[2] as HTMLInputElement & { emit(type: string): void },
    list: content.children[0] as HTMLElement,
    details: content.children[1] as HTMLElement,
    restart: panel.children[3] as HTMLElement,
  };
}

it('ignores a refresh completing after the owner document changes', async () => {
  const native = installManagerHost();
  const pending =
    Promise.withResolvers<[typeof native.alpha, typeof native.beta, typeof native.neo]>();
  native.manager.getAddonsByTypes.mockReturnValueOnce(pending.promise);
  const { window, state, panel } = createPanelFixture();
  panel.open();
  const oldDocument = window.document;
  Object.assign(window, { document: {} });
  pending.resolve([native.alpha, native.beta, native.neo]);
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  expect(state.plugins).toEqual([]);
  Object.assign(window, { document: oldDocument });
  panel.close();
});

it('routes a row selection through the controller', async () => {
  installManagerHost();
  const { state, panel } = createPanelFixture();
  panel.open();
  await vi.waitFor(() => expect(state.loading).toBe(false));
  const row = state.list!.children[1] as HTMLElement & { emit(type: string): void };
  row.emit('click');
  expect(state.filtered[state.selected]?.name).toBe('Beta');
  expect(state.details?.textContent).toContain('Beta');
  panel.close();
});

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
    await Promise.resolve();
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
    await Promise.resolve();
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
    await Promise.resolve();
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
