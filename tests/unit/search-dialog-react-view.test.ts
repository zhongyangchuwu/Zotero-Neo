// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSearchDialogReactView } from '../../src/ui/search-dialog-react-view';
import type { SearchDialogReactModel } from '../../src/ui/search-dialog-react-model';

const model: SearchDialogReactModel = {
  title: 'Find notes',
  placeholder: 'Search notes',
  help: 'Choose a note',
  close: 'Close',
  empty: 'No matches',
  status: '2',
  loaded: true,
  scopes: [
    { id: 'all', title: 'All' },
    { id: 'current', title: 'Current' },
  ],
  scope: 'all',
  rows: ['Alpha', 'Beta'],
  selected: 0,
  pending: false,
  actions: [{ label: 'Save', disabled: false }],
  hasPreview: true,
  previewText: 'Alpha preview',
  previewImages: [],
};

afterEach(() => document.body.replaceChildren());

describe('shared search dialog React presentation', () => {
  it('supports selecting results, changing scope and invoking caller actions', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountSearchDialogReactView(root, model, dispatch);
    const beta = root.querySelectorAll('[role="option"]')[1] as HTMLElement;
    beta.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', index: 1 });
    view.update({ ...model, selected: 1, previewText: 'Beta preview' });
    expect(beta.getAttribute('aria-selected')).toBe('true');
    expect(view.getElement('preview')?.textContent).toContain('Beta preview');
    const scopes = view.getElement('scopes') as HTMLSelectElement;
    scopes.value = 'current';
    scopes.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'scope', value: 'current' });
    const save = Array.from(
      root.querySelectorAll('button'),
      (node) => node as HTMLButtonElement,
    ).find((node) => node.textContent === 'Save')!;
    save.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'action', index: 0 });
    view.dispose();
  });
  it('retains an in-progress query and focus while results refresh', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountSearchDialogReactView(root, model, () => {});
    const input = view.getElement('input') as HTMLInputElement;
    input.focus();
    input.value = '未完成';
    view.update({ ...model, rows: ['Alpha'], status: '1' });
    expect(view.getElement('input')).toBe(input);
    expect(input.value).toBe('未完成');
    expect(document.activeElement).toBe(input);
    view.dispose();
  });
});
