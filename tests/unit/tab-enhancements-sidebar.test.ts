// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountTabSidebarReactView } from '../../src/ui/react/surfaces/tab-sidebar';
import { TabEnhancementsSidebar } from '../../src/modules/tab-enhancements/sidebar';
import type {
  TabSidebarCallbacks,
  TabSidebarEntry,
  TabSidebarView,
} from '../../src/modules/tab-enhancements/types';
import type {
  TabSidebarReactCommand,
  TabSidebarReactModel,
} from '../../src/modules/tab-enhancements/react-model';
import type { NativeReactViewOptions } from '../../src/ui/react/types';

// Exercise the actual vendored React view; only the Gecko resource loader is replaced.
vi.mock('../../src/platform/native-ui', () => {
  return {
    mountNativeReactView(
      options: NativeReactViewOptions<TabSidebarReactModel, TabSidebarReactCommand>,
    ) {
      const view = mountTabSidebarReactView(options.root, options.model, options.dispatch);
      return { ...view, ready: Promise.resolve() };
    },
  };
});

const entry = (
  id: string,
  status: TabSidebarEntry['status'] = 'open',
  selected = false,
  searchText = id,
): TabSidebarEntry => ({
  id,
  title: id,
  nativeTitle: id,
  searchText,
  status,
  selected,
  kind: 'reader',
});
const view = (): TabSidebarView => ({
  library: { ...entry('Library'), kind: 'library' },
  groups: [
    {
      id: 'g',
      name: 'Research',
      color: '#e06c75',
      collapsed: true,
      entries: [entry('active', 'open', true), entry('elsewhere', 'other-window')],
    },
  ],
  ungrouped: [entry('loose')],
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function harness() {
  const callbacks: TabSidebarCallbacks = {
    toggleSidebar: vi.fn(),
    activate: vi.fn(),
    close: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    setGroupColor: vi.fn(),
    toggleGroup: vi.fn(),
    closeGroup: vi.fn(),
    ungroup: vi.fn(),
    removeMember: vi.fn(),
    moveMember: vi.fn(),
    moveGroup: vi.fn(),
    leave: vi.fn(),
  };
  const sidebar = new TabEnhancementsSidebar({
    window,
    callbacks,
    bindings: () => ({ 'tabs-list:j': 'uiNext', 'tabs-list:<Enter>': 'uiConfirm' }),
    language: () => 'en',
    isCurrent: () => true,
    themeRoot: () => () => {},
  });
  document.body.append(sidebar.root);
  sidebar.mount((error) => {
    throw error;
  });
  sidebar.update(view(), false);
  cleanups.push(() => sidebar.dispose());
  const part = (name: string) =>
    sidebar.root.querySelector<HTMLElement>(`[data-neo-ui-part="${name}"]`)!;
  const action = (name: string, id?: string) =>
    sidebar.root.querySelector<HTMLButtonElement>(
      `[data-action="${name}"]${id === undefined ? '' : `[data-entry-id="${id}"]`}`,
    )!;
  const row = (kind: string, id: string) =>
    sidebar.root.querySelector<HTMLElement>(
      `[data-neo-tab-row="${kind}"][data-${kind === 'group' ? 'group' : 'entry'}-id="${id}"]`,
    )!;
  const click = (element: HTMLElement) => element.click();
  const context = (element: HTMLElement) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50,
    });
    element.dispatchEvent(event);
    return event;
  };
  const key = (target: HTMLElement, value: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: value,
      ...extra,
    });
    Object.defineProperty(event, 'target', { value: target });
    sidebar.handleKey(event);
    return event;
  };
  const search = (value: string) => {
    const input = part('query') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { sidebar, callbacks, part, action, row, click, context, key, search };
}

function dragEvent(target: HTMLElement, type: string, transfer: object): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  target.dispatchEvent(event);
  return event;
}
function transfer() {
  const data = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: '',
    dropEffect: '',
    setData(type: string, value: string) {
      this.types.push(type);
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? '';
    },
  };
}

describe('tab sidebar', () => {
  it('offers no group restore action and removes closed views even while editing', () => {
    const h = harness();
    h.context(h.row('group', 'g'));
    expect(h.action('open-group')).toBeNull();
    h.click(h.action('rename'));
    const editor = h.part('editor') as HTMLInputElement;
    editor.value = 'Renamed';
    const current = view();
    h.sidebar.update({ ...current, groups: [{ ...current.groups[0]!, entries: [] }] }, false);
    expect(h.row('entry', 'active')).toBeNull();
    expect(document.activeElement).toBe(editor);
    h.key(editor, 'Enter');
    expect(h.callbacks.renameGroup).toHaveBeenCalledWith('g', 'Renamed');
  });
  it('keeps the selected tab visible in a collapsed group and preserves nodes across selection', () => {
    const h = harness();
    const active = h.row('entry', 'active');
    const saved = h.row('entry', 'elsewhere');
    expect(active.hidden).toBe(false);
    expect(saved.hidden).toBe(true);
    const current = view();
    h.sidebar.update(
      {
        ...current,
        groups: [
          {
            ...current.groups[0]!,
            entries: [entry('active'), entry('elsewhere', 'other-window', true)],
          },
        ],
      },
      false,
    );
    expect(h.row('entry', 'active')).toBe(active);
    expect(active.hidden).toBe(true);
    expect(saved.hidden).toBe(false);
  });
  it('searches metadata and group names without changing displayed titles', () => {
    const h = harness();
    h.sidebar.update(
      {
        library: { ...entry('Library display'), searchText: 'Library actual title Zotero' },
        groups: [
          {
            ...view().groups[0]!,
            entries: [
              entry(
                'Open display',
                'open',
                false,
                'Article title Native title Jane Doe 2024 Archive.pdf Smith2024',
              ),
              entry(
                'Remote display',
                'other-window',
                false,
                'Remote title Other Native Lee 2023 Remote.pdf',
              ),
            ],
          },
        ],
        ungrouped: [
          entry('Loose display', 'open', false, 'Loose actual title Native Nguyen 2021 Loose.pdf'),
        ],
      },
      false,
    );
    for (const value of [
      'sMiTh2024',
      'open display',
      'article title',
      'native title',
      'jane doe',
      '2024',
      'archive.pdf',
    ]) {
      h.search(value);
      expect(h.row('entry', 'Open display')).not.toBeNull();
      expect(h.action('activate', 'Open display').textContent).toBe('Open display');
    }
    for (const value of ['REMOTE.PDF', 'other native']) {
      h.search(value);
      expect(h.row('entry', 'Remote display')).not.toBeNull();
    }
    h.search('library actual');
    expect(h.row('entry', 'Library display')).not.toBeNull();
    h.search('loose actual');
    expect(h.row('entry', 'Loose display')).not.toBeNull();
    h.search('RESEARCH');
    expect(h.row('group', 'g')).not.toBeNull();
    for (const id of ['Open display', 'Remote display']) expect(h.row('entry', id)).not.toBeNull();
    h.search('no matching metadata');
    expect(h.row('group', 'g')).toBeNull();
    expect(h.row('entry', 'Library display')).toBeNull();
    expect(h.row('entry', 'Loose display')).toBeNull();
  });
  it('closes local tabs, removes membership, and labels other windows', () => {
    const h = harness();
    expect(h.row('entry', 'elsewhere').textContent).toContain('Other window');
    h.click(h.action('entry-menu', 'active'));
    h.click(h.action('close', 'active'));
    expect(h.callbacks.close).toHaveBeenCalledWith('active');
    h.click(h.action('entry-menu', 'elsewhere'));
    expect(h.action('close', 'elsewhere')).toBeNull();
    h.click(h.action('remove', 'elsewhere'));
    expect(h.callbacks.removeMember).toHaveBeenCalledWith('elsewhere');
    expect(h.callbacks.close).toHaveBeenCalledTimes(1);
  });
  it('preserves a pending rename and composition over updates and rejects stale groups', () => {
    const h = harness();
    h.context(h.row('group', 'g'));
    h.click(h.action('rename'));
    const input = h.part('editor') as HTMLInputElement;
    input.value = 'New name';
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    h.sidebar.update(view(), false);
    expect(h.key(input, 'Enter', { isComposing: true }).defaultPrevented).toBe(false);
    expect(h.callbacks.renameGroup).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    h.key(input, 'Enter');
    expect(h.callbacks.renameGroup).toHaveBeenCalledWith('g', 'New name');
    h.context(h.row('group', 'g'));
    h.click(h.action('rename'));
    const stale = h.part('editor') as HTMLInputElement;
    stale.value = 'Stale';
    h.sidebar.update({ library: null, groups: [], ungrouped: [] }, false);
    h.key(stale, 'Enter');
    expect(h.callbacks.renameGroup).toHaveBeenCalledTimes(1);
  });
  it('routes list bindings without consuming native input or composition', () => {
    const h = harness();
    h.sidebar.focus();
    expect(h.key(h.part('list'), 'j').defaultPrevented).toBe(true);
    h.key(document.activeElement as HTMLElement, 'Enter');
    expect(h.callbacks.activate).toHaveBeenCalledWith('Library');
    const input = h.part('query');
    expect(h.key(input, 'a').defaultPrevented).toBe(false);
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(h.key(input, 'Enter').defaultPrevented).toBe(false);
    expect(h.callbacks.activate).toHaveBeenCalledTimes(1);
  });
  it('creates a group with the source tab when initiated from a row', () => {
    const h = harness();
    h.click(h.action('entry-menu', 'loose'));
    h.click(h.action('new-group-for-entry', 'loose'));
    const input = h.part('editor') as HTMLInputElement;
    input.value = 'Projects';
    h.key(input, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('Projects', 'loose');
  });
  it('leaves native toolbar input alone and Escape cancels an editor', () => {
    const h = harness();
    const native = document.createElement('input');
    h.sidebar.toolbarSlot.append(native);
    expect(h.key(native, 'j').defaultPrevented).toBe(false);
    h.click(h.action('new-group'));
    const editor = h.part('editor') as HTMLInputElement;
    editor.value = 'Discard';
    h.key(editor, 'Escape');
    expect(h.callbacks.createGroup).not.toHaveBeenCalled();
    h.sidebar.update(view(), true);
    expect(h.sidebar.toolbarSlot.hidden).toBe(true);
  });
  it('opens tab and blank context menus with the intended group source', () => {
    const h = harness();
    expect(h.context(h.row('entry', 'loose')).defaultPrevented).toBe(true);
    h.click(h.action('new-group-for-entry', 'loose'));
    let input = h.part('editor') as HTMLInputElement;
    input.value = 'From tab';
    h.key(input, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('From tab', 'loose');
    h.context(h.part('list'));
    h.click(h.action('new-group'));
    input = h.part('editor') as HTMLInputElement;
    input.value = 'Empty';
    h.key(input, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('Empty', undefined);
  });
  it('dismisses a context menu without changing groups', () => {
    const h = harness();
    h.context(h.row('entry', 'loose'));
    h.key(document.activeElement as HTMLElement, 'Escape');
    expect(h.callbacks.createGroup).not.toHaveBeenCalled();
    expect(h.part('menu')).toBeNull();
  });
  it('drags a group before another without moving members separately', () => {
    const h = harness();
    const initial = view();
    h.sidebar.update(
      {
        ...initial,
        groups: [
          ...initial.groups,
          { id: 'next', name: 'Next', color: '', collapsed: false, entries: [] },
        ],
      },
      false,
    );
    const data = transfer();
    dragEvent(h.row('group', 'g'), 'dragstart', data);
    dragEvent(h.row('group', 'next'), 'drop', data);
    expect(h.callbacks.moveGroup).toHaveBeenCalledWith('g', 'next');
    expect(h.callbacks.moveMember).not.toHaveBeenCalled();
  });
  it('accepts only a current own drag and disables filtered reorder', () => {
    const h = harness();
    const data = transfer();
    const destination = h.sidebar.root.querySelector<HTMLElement>('[data-drop-group="g"]')!;
    dragEvent(h.row('entry', 'loose'), 'dragstart', data);
    dragEvent(destination, 'drop', data);
    expect(h.callbacks.moveMember).toHaveBeenCalledWith('loose', 'g', null);
    dragEvent(destination, 'drop', data);
    expect(h.callbacks.moveMember).toHaveBeenCalledTimes(1);
    dragEvent(h.row('entry', 'loose'), 'dragstart', data);
    h.sidebar.update(view(), false);
    dragEvent(destination, 'drop', data);
    expect(h.callbacks.moveMember).toHaveBeenCalledTimes(1);
    h.search('loose');
    expect(dragEvent(h.row('entry', 'loose'), 'dragstart', data).defaultPrevented).toBe(true);
  });
});
