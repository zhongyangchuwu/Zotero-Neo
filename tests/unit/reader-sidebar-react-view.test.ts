// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountReaderSidebarReactView } from '../../src/ui/react/surfaces/reader-sidebar';
import { mountReferenceControlsReactView } from '../../src/ui/react/surfaces/references';
import type { ReaderSidebarViewModel } from '../../src/modules/reader-navigation/react-model';

afterEach(() => document.body.replaceChildren());

describe('Reader sidebar React surfaces', () => {
  it('retains focused marks and disclosure state during updates, then dispatches deletion', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const dispatch = vi.fn();
    const model: ReaderSidebarViewModel = {
      kind: 'marks',
      label: 'Marks',
      empty: 'Empty',
      open: true,
      entries: [{ char: 'a', label: 'a · 1', deleteLabel: 'Delete a' }],
    };
    const view = mountReaderSidebarReactView(root, model, dispatch);
    const details = root.querySelector('details')!;
    const button = root.querySelector<HTMLButtonElement>('[data-zv-mark]')!;
    button.focus();
    view.update({ ...model, entries: [{ ...model.entries[0]!, label: 'a · 2' }] });
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe('a · 2');
    root.querySelector<HTMLButtonElement>('[data-zv-delete-mark]')!.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'delete-mark', char: 'a' });
    details.open = false;
    view.update({ ...model, open: false });
    expect(details.open).toBe(false);
    view.dispose();
  });

  it('renders caption entries with their original indexes and preserves open groups', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const dispatch = vi.fn();
    const model: ReaderSidebarViewModel = {
      kind: 'captions',
      label: 'Captions',
      cost: 'On demand',
      status: '',
      open: true,
      groups: [
        {
          kind: 'figure',
          label: 'Figures',
          open: true,
          entries: [{ index: 3, label: 'Figure 4', title: 'Figure 4: Example' }],
        },
      ],
    };
    const view = mountReaderSidebarReactView(root, model, dispatch);
    const group = root.querySelector<HTMLDetailsElement>('[data-zv-caption-kind="figure"]')!;
    const button = root.querySelector<HTMLButtonElement>('[data-zv-caption]')!;
    button.focus();
    view.update({ ...model, label: 'Updated' });
    expect(group.open).toBe(true);
    expect(document.activeElement).toBe(button);
    button.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'caption', index: 3 });
    view.dispose();
  });

  it('exposes localized reference actions without bubbling into the native preview', () => {
    const root = document.createElement('span');
    const preview = document.createElement('div');
    preview.append(root);
    document.body.append(preview);
    const dispatch = vi.fn();
    const nativeClick = vi.fn();
    preview.addEventListener('click', nativeClick);
    const view = mountReferenceControlsReactView(root, { chinese: true }, dispatch);
    const button = root.querySelector<HTMLButtonElement>('button:nth-child(2)')!;
    expect(button.textContent).toBe('本地副本');
    button.click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'local' });
    expect(nativeClick).not.toHaveBeenCalled();
    view.dispose();
  });
});
