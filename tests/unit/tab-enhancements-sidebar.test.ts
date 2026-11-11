import { describe, expect, it, vi } from 'vitest';
import { TabEnhancementsSidebar } from '../../src/modules/tab-enhancements/sidebar';
import type {
  TabSidebarCallbacks,
  TabSidebarEntry,
  TabSidebarView,
} from '../../src/modules/tab-enhancements/types';
import { DocumentFixture, type DialogElement } from '../fixtures/dialog-dom';

const entry = (
  id: string,
  status: TabSidebarEntry['status'] = 'open',
  selected = false,
): TabSidebarEntry => ({
  id,
  title: id,
  nativeTitle: id,
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
      entries: [
        entry('active', 'open', true),
        entry('saved', 'closed'),
        entry('elsewhere', 'other-window'),
        entry('missing', 'missing'),
      ],
    },
  ],
  ungrouped: [entry('loose')],
});

function harness() {
  const doc = new DocumentFixture();
  const create = doc.createElementNS.bind(doc);
  doc.createElementNS = (ns, tag) =>
    Object.assign(create(ns, tag), { localName: tag, select: () => {} });
  const callbacks: TabSidebarCallbacks = {
    toggleSidebar: vi.fn(),
    activate: vi.fn(),
    close: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    setGroupColor: vi.fn(),
    toggleGroup: vi.fn(),
    openGroup: vi.fn(),
    closeGroup: vi.fn(),
    ungroup: vi.fn(),
    removeMember: vi.fn(),
    moveMember: vi.fn(),
    moveGroup: vi.fn(),
    leave: vi.fn(),
  };
  const sidebar = new TabEnhancementsSidebar({
    window: { document: doc, setTimeout, clearTimeout } as unknown as Window,
    callbacks,
    bindings: () => ({ 'tabs-list:j': 'uiNext', 'tabs-list:<Enter>': 'uiConfirm' }),
    language: () => 'en',
    isCurrent: () => true,
    themeRoot: () => () => {},
  });
  doc.documentElement.append(sidebar.root as unknown as DialogElement);
  sidebar.update(view(), false);
  const find = (tag: string, text: string) =>
    doc.nodes.find(
      (node) => node.isConnected && node.tagName === tag && node.textContent === text,
    )!;
  const key = (target: DialogElement, value: string, extra: Record<string, unknown> = {}) => {
    const event = {
      target,
      key: value,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...extra,
    };
    sidebar.handleKey(event as unknown as KeyboardEvent);
    return event;
  };
  return { doc, sidebar, callbacks, find, key };
}

describe('tab sidebar', () => {
  it('presents preview counts with explicit cancel and start controls in the status region', () => {
    const h = harness();
    let starts = 0;
    h.sidebar.restorePreview(view().groups[0]!, () => { starts++; }, () => h.sidebar.status(''));
    const status = h.doc.nodes.find((node) => node.isConnected && node.attributes.get('role') === 'status')!;
    expect(status.textContent).toContain('Closed to open: 1');
    expect(status.textContent).toContain('Already open here: 1');
    expect(status.textContent).toContain('Other window: 1');
    expect(status.textContent).toContain('Missing: 1');
    h.find('button', 'Cancel').emit('click');
    expect(starts).toBe(0);
    expect(status.textContent).toBe('');
    h.sidebar.restorePreview(view().groups[0]!, () => { starts++; }, () => h.sidebar.status(''));
    h.find('button', 'Start opening').emit('click');
    expect(starts).toBe(1);
  });
  it('keeps the active tab visible in a collapsed group and preserves its node on selection changes', () => {
    const h = harness();
    const active = h.find('button', 'active');
    const saved = h.find('button', 'saved');
    expect((active.parent! as DialogElement & { hidden: boolean }).hidden).toBeFalsy();
    expect((saved.parent! as DialogElement & { hidden: boolean }).hidden).toBe(true);
    expect(saved.parent!.style.display).toBe('none');
    const current = view();
    h.sidebar.update(
      {
        ...current,
        groups: [
          {
            ...current.groups[0]!,
            entries: [
              entry('active'),
              entry('saved', 'closed', true),
              entry('elsewhere', 'other-window'),
              entry('missing', 'missing'),
            ],
          },
        ],
      },
      false,
    );
    expect(h.find('button', 'active')).toBe(active);
    expect((active.parent! as DialogElement & { hidden: boolean }).hidden).toBe(true);
    expect((saved.parent! as DialogElement & { hidden: boolean }).hidden).toBe(false);
    expect(active.parent!.style.display).toBe('none');
    expect(saved.parent!.style.display).toBe('flex');
  });

  it('distinguishes closing a live tab from removing saved membership and labels other windows', () => {
    const h = harness();
    expect(h.find('span', 'Closed')).toBeDefined();
    expect(h.find('span', 'Other window')).toBeDefined();
    expect(h.find('span', 'Missing')).toBeDefined();
    const activeRow = h.find('button', 'active').parent!;
    const close = activeRow.children
      .find((n) => n.tagName === 'details')!
      .children.find((n) => n.textContent === 'Close in this window')!;
    close.emit('click');
    expect(h.callbacks.close).toHaveBeenCalledWith('active');
    const savedRow = h.find('button', 'saved').parent!;
    savedRow.children
      .find((n) => n.tagName === 'details')!
      .children.find((n) => n.textContent === 'Remove from group')!
      .emit('click');
    expect(h.callbacks.removeMember).toHaveBeenCalledWith('saved');
    expect(h.callbacks.close).toHaveBeenCalledTimes(1);
  });

  it('preserves pending rename and composition over updates and rejects stale groups', () => {
    const h = harness();
    h.find('button', 'Rename group').emit('click');
    const input = h.doc.activeElement!;
    input.value = 'New name';
    input.emit('compositionstart');
    h.sidebar.update(view(), false);
    const ime = h.key(input, 'Enter', { isComposing: true });
    expect(ime.preventDefault).not.toHaveBeenCalled();
    expect(h.callbacks.renameGroup).not.toHaveBeenCalled();
    expect(h.doc.activeElement).toBe(input);
    input.emit('compositionend');
    h.key(input, 'Enter');
    expect(h.callbacks.renameGroup).toHaveBeenCalledWith('g', 'New name');
    h.find('button', 'Rename group').emit('click');
    const stale = h.doc.activeElement!;
    stale.value = 'Stale';
    h.sidebar.update({ library: null, groups: [], ungrouped: [] }, false);
    h.key(stale, 'Enter');
    expect(h.callbacks.renameGroup).toHaveBeenCalledTimes(1);
  });

  it('routes local list bindings without consuming native input or composition', () => {
    const h = harness();
    h.sidebar.focus();
    const list = h.doc.activeElement!;
    const move = h.key(list, 'j');
    expect(move.preventDefault).toHaveBeenCalled();
    h.key(h.doc.activeElement!, 'Enter');
    expect(h.callbacks.activate).toHaveBeenCalledWith('Library');
    const search = h.doc.nodes.find((n) => n.isConnected && n.tagName === 'input')!;
    const typing = h.key(search, 'a');
    expect(typing.preventDefault).not.toHaveBeenCalled();
    search.emit('compositionstart');
    const ime = h.key(search, 'Enter');
    expect(ime.preventDefault).not.toHaveBeenCalled();
    expect(h.callbacks.activate).toHaveBeenCalledTimes(1);
  });

  it('creates a group with the source tab when initiated from a row', () => {
    const h = harness();
    const row = h.find('button', 'loose').parent!;
    row.children
      .find((n) => n.tagName === 'details')!
      .children.find((n) => n.textContent === 'New group')!
      .emit('click');
    const input = h.doc.activeElement!;
    input.value = 'Projects';
    h.key(input, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('Projects', 'loose');
  });

  it('does not capture native toolbar input and Escape cancels an editor', () => {
    const h = harness();
    const toolbarInput = h.doc.createElementNS('', 'input');
    (h.sidebar.toolbarSlot as unknown as DialogElement).append(toolbarInput);
    const native = h.key(toolbarInput, 'j');
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(native.stopPropagation).not.toHaveBeenCalled();
    h.find('button', 'New group').emit('click');
    const input = h.doc.activeElement!;
    input.value = 'Discard';
    h.key(input, 'Escape');
    expect(h.callbacks.createGroup).not.toHaveBeenCalled();
    h.sidebar.update(view(), true);
    expect(
      (
        (h.sidebar.toolbarSlot as unknown as DialogElement).parent! as DialogElement & {
          hidden: boolean;
        }
      ).hidden,
    ).toBe(true);
  });

  it('opens a context menu for a tab or blank rail and creates the intended group', () => {
    const h = harness();
    const root = h.sidebar.root as unknown as DialogElement;
    const row = h.find('button', 'loose').parent!;
    const opened = row.emit('contextmenu', { clientX: 40, clientY: 50 });
    expect(opened.defaultPrevented).toBe(true);
    const popup = root.children.find((node) => node.attributes.get('role') === 'group')!;
    popup.children.find((node) => node.textContent === 'New group')!.emit('click');
    const input = h.doc.activeElement!;
    input.value = 'From tab';
    h.key(input, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('From tab', 'loose');

    h.sidebar.focus();
    const list = h.doc.activeElement!;
    list.emit('contextmenu', { clientX: 40, clientY: 50 });
    const blankPopup = root.children.find((node) => node.attributes.get('role') === 'group')!;
    blankPopup.children.find((node) => node.textContent === 'New group')!.emit('click');
    const emptyInput = h.doc.activeElement!;
    emptyInput.value = 'Empty';
    h.key(emptyInput, 'Enter');
    expect(h.callbacks.createGroup).toHaveBeenCalledWith('Empty', undefined);
  });

  it('dismisses a context menu without changing groups', () => {
    const h = harness();
    const row = h.find('button', 'loose').parent!;
    row.emit('contextmenu', { clientX: 40, clientY: 50 });
    const menuButton = h.doc.activeElement!;
    h.key(menuButton, 'Escape');
    expect(h.callbacks.createGroup).not.toHaveBeenCalled();
    expect(h.doc.nodes.some((node) => node.isConnected && node.attributes.get('role') === 'group')).toBe(false);
  });

  it('drags a group before another group without moving its members separately', () => {
    const h = harness();
    const initial = view();
    h.sidebar.update({
      ...initial,
      groups: [...initial.groups, { id: 'next', name: 'Next', color: '', collapsed: false, entries: [] }],
    }, false);
    const source = h.find('button', '▸ Research (4)').parent!;
    const target = h.find('button', '▾ Next (0)').parent!;
    const data = new Map<string, string>();
    const transfer = {
      types: [] as string[],
      setData(type: string, value: string) { this.types.push(type); data.set(type, value); },
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    source.emit('dragstart', { dataTransfer: transfer });
    target.emit('drop', { dataTransfer: transfer });
    expect(h.callbacks.moveGroup).toHaveBeenCalledWith('g', 'next');
    expect(h.callbacks.moveMember).not.toHaveBeenCalled();
  });

  it('accepts only a current own drag, and disables filtered reorder', () => {
    const h = harness();
    const source = h.find('button', 'loose').parent!;
    const destination = h.find('button', '▸ Research (4)').parent!.parent!;
    const data = new Map<string, string>();
    const transfer = {
      types: [] as string[],
      setData(type: string, value: string) {
        this.types.push(type);
        data.set(type, value);
      },
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    source.emit('dragstart', { dataTransfer: transfer });
    destination.emit('drop', { dataTransfer: transfer });
    expect(h.callbacks.moveMember).toHaveBeenCalledWith('loose', 'g', null);
    destination.emit('drop', { dataTransfer: transfer });
    expect(h.callbacks.moveMember).toHaveBeenCalledTimes(1);
    source.emit('dragstart', { dataTransfer: transfer });
    h.sidebar.update(view(), false);
    destination.emit('drop', { dataTransfer: transfer });
    expect(h.callbacks.moveMember).toHaveBeenCalledTimes(1);
    const search = h.doc.nodes.find((n) => n.isConnected && n.tagName === 'input')!;
    search.value = 'loose';
    search.emit('input');
    const filtered = h.find('button', 'loose').parent!;
    const result = filtered.emit('dragstart', { dataTransfer: transfer });
    expect(result.defaultPrevented).toBe(true);
  });
});
