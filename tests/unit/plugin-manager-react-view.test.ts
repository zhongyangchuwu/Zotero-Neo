// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountExtensionsReactView } from '../../src/ui/react/surfaces/extensions';
import type { ExtensionsReactModel } from '../../src/modules/extensions/react-model';

const model: ExtensionsReactModel = {
  plugins: [
    {
      id: 'alpha@example.test',
      name: 'Alpha',
      version: '1.0',
      enabled: true,
      canEnable: false,
      canDisable: true,
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
  canCancel: false,
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
