// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountExtensionsReactView } from '../../src/ui/react/surfaces/extensions';
import type { ExtensionsReactModel } from '../../src/modules/extensions/react-model';

const model: ExtensionsReactModel = {
  chinese: false,
  plugins: [
    {
      id: 'alpha@example.test',
      name: 'Alpha',
      version: '1.0',
      enabled: true,
      canEnable: false,
      canDisable: true,
      canUninstall: true,
      description: 'Alpha description',
      homepageURL: 'https://example.org/',
    },
    {
      id: 'beta@example.test',
      name: 'Beta',
      version: '2.0',
      enabled: false,
      canEnable: true,
      canDisable: false,
      canUninstall: false,
      description: 'Beta description',
      readmeURL: 'https://example.org/readme',
    },
  ],
  selected: 0,
  query: '',
  count: '2/2',
  listMessage: '',
  listStatus: 'normal',
  loading: false,
  canStop: false,
  canInstall: true,
  canUpdate: true,
  canUpdateAll: true,
  canUninstall: true,
  needsRestart: false,
  inline: null,
  notice: '',
  report: [],
  shortcuts: 'Shortcuts',
  footer: 'j/k move',
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('Plugin Manager React presentation', () => {
  it('shows the selected plugin and emits the requested row and link actions', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountExtensionsReactView(root, model, dispatch);
    const details = view.getElement('details')!;
    expect(details.textContent).toContain('Alpha description');
    (root.querySelector('[data-zv-plugin-index="1"]') as HTMLElement).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', index: 1 });
    view.update({ ...model, selected: 1 });
    expect(details.textContent).toContain('Beta description');
    expect(details.textContent).toContain('Disabled');
    (
      Array.from(details.querySelectorAll('button'), (button) => button as HTMLButtonElement).find(
        (button) => button.textContent === 'README',
      ) as HTMLButtonElement
    ).click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'link', kind: 'readme' });
    view.dispose();
  });
  it('opens the install editor even with no installed plugins and keeps a single restart banner', () => {
    const root = document.createElement('div');
    const dispatch = vi.fn();
    const empty = {
      ...model,
      plugins: [],
      count: '0/0',
      listMessage: 'No installed plugins',
      canUpdateAll: false,
    };
    const view = mountExtensionsReactView(root, empty, dispatch);
    (view.getElement('pluginsInstall') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'action', action: 'pluginsInstall' });
    view.update({ ...empty, canStop: true, canInstall: false, needsRestart: true });
    (view.getElement('pluginsInstall') as HTMLButtonElement).click();
    const stop = view.getElement('operation-stop') as HTMLButtonElement;
    stop.click();
    expect(dispatch.mock.calls).toEqual([
      [{ type: 'action', action: 'pluginsInstall' }],
      [{ type: 'stop' }],
    ]);
    expect(root.querySelectorAll('[data-neo-ui-part="restart"]')).toHaveLength(1);
    view.dispose();
  });

  it('shows the source editor, curated choice and candidate confirmation without replacing the filter', () => {
    const root = document.createElement('div');
    const dispatch = vi.fn();
    const view = mountExtensionsReactView(root, model, dispatch);
    const filter = view.getElement('input');
    view.update({
      ...model,
      chinese: true,
      canInstall: false,
      inline: {
        kind: 'source',
        resolving: false,
        curated: [{ label: 'Zotero Bases', description: '独立多视图文献表格' }],
      },
    });
    expect(view.getElement('install-input')?.getAttribute('placeholder')).toContain('HTTPS XPI');
    const bases = root.querySelector<HTMLButtonElement>('[data-neo-curated-index="0"]')!;
    expect(bases.textContent).toContain('Zotero Bases · 独立多视图文献表格');
    bases.click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'curated', index: 0 });
    view.update({
      ...model,
      inline: {
        kind: 'choose',
        candidates: [{ name: 'alpha.xpi' }, { name: 'beta.xpi', version: '2.0' }],
        selected: 1,
      },
    });
    const selected = view.getElement('install-selected') as HTMLButtonElement;
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.textContent).toContain('beta.xpi · 2.0');
    selected.click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'choose', index: 1 });
    const url = 'https://example.org/beta.xpi';
    view.update({ ...model, inline: { kind: 'install', name: 'beta.xpi', version: '2.0', url } });
    expect(view.getElement('inline')?.textContent).toContain('Confirm install: beta.xpi · 2.0');
    expect(view.getElement('install-url')?.textContent).toBe(url);
    (view.getElement('install-confirm') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'inline-submit' });
    (view.getElement('inline-back') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'inline-dismiss' });
    expect(view.getElement('input')).toBe(filter);
    view.dispose();
  });

  it('dispatches selected and batch actions and shows permission, confirmation and partial results', () => {
    const root = document.createElement('div');
    const dispatch = vi.fn();
    const view = mountExtensionsReactView(root, model, dispatch);
    for (const action of ['pluginsUpdate', 'pluginsUpdateAll', 'pluginsUninstall']) {
      (view.getElement(action) as HTMLButtonElement).click();
      expect(dispatch).toHaveBeenLastCalledWith({ type: 'action', action });
    }
    view.update({ ...model, selected: 1, canUninstall: false });
    (view.getElement('pluginsUninstall') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenCalledTimes(3);
    view.update({
      ...model,
      canUninstall: false,
      inline: { kind: 'uninstall', name: 'Alpha', version: '1.0' },
      needsRestart: true,
      notice: 'Finished checking plugin updates.',
      report: ['Updated: Alpha', 'Beta failed: Download error'],
    });
    expect(view.getElement('inline')?.textContent).toContain('Confirm uninstall: Alpha');
    expect(view.getElement('operation-report')?.textContent).toContain(
      'Beta failed: Download error',
    );
    (view.getElement('uninstall-confirm') as HTMLButtonElement).click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'inline-submit' });
    view.dispose();
  });
  it('does not replace an in-progress filter input during a model refresh', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountExtensionsReactView(root, model, () => {});
    const input = view.getElement('input') as HTMLInputElement;
    input.focus();
    input.value = '未完成';
    view.update({ ...model, footer: 'updated' });
    expect(view.getElement('input')).toBe(input);
    expect(input.value).toBe('未完成');
    expect(document.activeElement).toBe(input);
    view.dispose();
  });
});
