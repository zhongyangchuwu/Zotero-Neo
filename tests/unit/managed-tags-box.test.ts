import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { protectNativeTagsBox } from '../../src/toolkit/main/managed-tags/box';

type RecordTag = { tag: string; type: number };
const marker = (name: string) => name === 'neo:identity:0' || name === 'neo:identity:1';
beforeEach(() =>
  vi.stubGlobal('Zotero', {
    Tags: {
      compareTagsOrder: (_libraryID: number, left: string, right: string) =>
        left.localeCompare(right),
    },
  }),
);
afterEach(() => vi.unstubAllGlobals());

class FakeElement {
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  parent: FakeElement | null = null;
  value = '';
  initialValue = '';
  ref?: { value: string; selectionStart: number; selectionEnd: number };
  constructor(readonly tag: string) {}
  matches(selector: string) {
    return this.tag === selector;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  append(child: FakeElement) {
    child.remove();
    child.parent = this;
    this.children.push(child);
  }
  insertBefore(child: FakeElement, before: FakeElement | null) {
    if (child === before) return;
    child.remove();
    child.parent = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }
}
class FakeEvent {
  stopped = false;
  defaultPrevented = false;
  currentTarget: FakeElement;
  key = '';
  clipboardData = { getData: () => '' };
  constructor(
    readonly type: string,
    readonly target: FakeElement,
    readonly box: FakeBox,
  ) {
    this.currentTarget = target;
  }
  composedPath() {
    return [this.target, this.target.parent, this.box];
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopImmediatePropagation() {
    this.stopped = true;
  }
}
class FakeItem {
  readonly libraryID = 1;
  saves: Array<{ undoAction: string }> = [];
  constructor(public tags: RecordTag[]) {}
  getTags() {
    return this.tags.map((tag) => ({ ...tag }));
  }
  setTags(tags: RecordTag[]) {
    this.tags = tags.map((tag) => ({ ...tag }));
  }
  async saveTx(options: { undoAction: string }) {
    this.saves.push(options);
  }
}
class FakeBox extends FakeElement {
  rows = new FakeElement('rows');
  menu = new FakeElement('menuitem');
  editable = true;
  count = 0;
  item: FakeItem | null;
  constructor(item: FakeItem) {
    super('tags-box');
    this.item = item;
  }
  _id(id: string) {
    return id === 'rows' ? this.rows : id === 'remove-all-item-tags' ? this.menu : null;
  }
  updateCount(count = this.item?.getTags().length ?? 0) {
    this.count = count;
  }
  updateRow(row: FakeElement, tag?: RecordTag) {
    if (tag) row.setAttribute('tagName', tag.tag);
  }
  addDynamicRow(tag?: RecordTag, _tabindex?: number | false, skipAppend?: boolean) {
    const row = new FakeElement('row');
    if (!tag) row.setAttribute('isNew', 'true');
    const field = new FakeElement('editable-text');
    field.value = field.initialValue = tag?.tag ?? '';
    // Native listeners are bound when the field is constructed.
    field.addEventListener('blur', this.saveTag);
    field.addEventListener('change', this.saveTag);
    field.addEventListener('keydown', this.handleKeyDown);
    field.addEventListener('paste', this.handlePaste);
    row.append(field);
    this.updateRow(row, tag);
    if (!skipAppend) this.rows.append(row);
    return row;
  }
  add(name: string, type = 0) {
    const row = this.addDynamicRow({ tag: name, type }, false, true);
    const all = [...this.item!.getTags(), { tag: name, type }].sort((a, b) =>
      a.tag.localeCompare(b.tag),
    );
    const index = all.findIndex((tag) => tag.tag === name);
    this.rows.insertBefore(row, this.rows.children[index] ?? null);
    this.updateCount(this.count + 1);
    return row.querySelector('editable-text');
  }
  render() {
    for (const row of [...this.rows.children]) row.remove();
    for (const tag of this.item?.getTags() ?? []) this.addDynamicRow(tag);
    this.updateCount(this.item?.getTags().length);
  }
  removeRow(row: FakeElement) {
    row.remove();
    if (!row.hasAttribute('isNew')) this.updateCount(this.count - 1);
  }
  saveTag = (event: FakeEvent) => {
    const field = event.currentTarget;
    const tags = field.value
      .split(/\r\n?|\n/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    this.item!.tags = this.item!.tags.filter((tag) => tag.tag !== field.initialValue);
    this.item!.tags.push(...tags.map((tag) => ({ tag, type: 0 })));
  };
  handleKeyDown = (event: FakeEvent) => {
    if (event.key === 'Enter' || event.key === 'Tab') this.saveTag(event);
  };
  handlePaste = (event: FakeEvent) => {
    event.currentTarget.value = event.clipboardData.getData();
  };
  removeAll = () => {
    this.item?.setTags([]);
  };
  emit(event: FakeEvent) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (!event.stopped)
      for (const listener of event.target.listeners.get(event.type) ?? []) listener(event);
  }
}
function setup(confirm = () => true) {
  const item = new FakeItem([
    { tag: 'neo:identity:0', type: 0 },
    { tag: 'neo:identity:1', type: 1 },
    { tag: 'manual', type: 0 },
    { tag: 'automatic', type: 1 },
  ]);
  const box = new FakeBox(item);
  box.menu.addEventListener('command', box.removeAll);
  box.render();
  const errors = vi.fn();
  const dispose = protectNativeTagsBox(box as unknown as Element, marker, errors, confirm)!;
  return { box, item, dispose, errors };
}
const names = (box: FakeBox) => box.rows.children.map((row) => row.getAttribute('tagName'));

describe('native managed tags box', () => {
  it('inserts ordinary tags among visible rows rather than hidden native tag indices', () => {
    const item = new FakeItem([
      { tag: 'neo:identity:0', type: 1 },
      { tag: 'v', type: 0 },
      { tag: 'z', type: 0 },
    ]);
    const box = new FakeBox(item);
    box.render();
    const dispose = protectNativeTagsBox(box as unknown as Element, marker, vi.fn(), () => true)!;
    box.add('w');
    expect(names(box)).toEqual(['v', 'w', 'z']);
    dispose();
  });
  it('hides managed rows on attach, render, add and update without changing raw records', () => {
    const { box, item } = setup();
    expect(names(box)).toEqual(['manual', 'automatic']);
    expect(box.count).toBe(2);
    box.render();
    expect(names(box)).toEqual(['manual', 'automatic']);
    const detached = box.addDynamicRow({ tag: 'neo:identity:0', type: 0 });
    expect(detached.parent).toBeNull();
    expect(detached.querySelector('editable-text')?.value).toBe('neo:identity:0');
    box.add('neo:identity:1', 1);
    expect(names(box)).toEqual(['manual', 'automatic']);
    const row = box.rows.children[0];
    box.updateRow(row, { tag: 'neo:identity:1', type: 1 });
    expect(names(box)).toEqual(['automatic']);
    expect(item.tags).toEqual([
      { tag: 'neo:identity:0', type: 0 },
      { tag: 'neo:identity:1', type: 1 },
      { tag: 'manual', type: 0 },
      { tag: 'automatic', type: 1 },
    ]);
  });
  it('counts visible non-new rows even before native model removal', () => {
    const { box, item } = setup();
    box.addDynamicRow();
    box.removeRow(box.rows.children[0]);
    expect(box.count).toBe(1);
    expect(item.tags).toHaveLength(4);
  });
  it('removes only business tags using native undo and revalidates the item', () => {
    const { box, item } = setup();
    box.emit(new FakeEvent('command', box.menu, box));
    expect(item.tags).toEqual([
      { tag: 'neo:identity:0', type: 0 },
      { tag: 'neo:identity:1', type: 1 },
    ]);
    expect(item.saves).toEqual([{ undoAction: 'undo-action-remove-all-tags' }]);
    let changeItem = () => {};
    const other = setup(() => {
      changeItem();
      return true;
    });
    changeItem = () => {
      other.box.item = new FakeItem([]);
    };
    other.box.emit(new FakeEvent('command', other.box.menu, other.box));
    expect(other.item.tags).toHaveLength(4);
    expect(other.item.saves).toEqual([]);
  });
  it('blocks direct handlers and keyboard saves while leaving ordinary input intact', () => {
    const { box, item } = setup();
    const field = box.rows.children[0].querySelector('editable-text')!;
    field.value = 'neo:identity:0';
    const enter = new FakeEvent('keydown', field, box);
    enter.key = 'Enter';
    box.handleKeyDown(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(field.value).toBe('manual');
    expect(item.tags).toHaveLength(4);
    field.value = 'neo:identity:1';
    const tab = new FakeEvent('keydown', field, box);
    tab.key = 'Tab';
    box.emit(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(item.tags).toHaveLength(4);
  });
  it('does not delete in a read-only host or after cancellation', () => {
    const cancelled = setup(() => false);
    cancelled.box.emit(new FakeEvent('command', cancelled.box.menu, cancelled.box));
    expect(cancelled.item.tags).toHaveLength(4);
    expect(cancelled.item.saves).toEqual([]);
    const readonly = setup();
    readonly.box.editable = false;
    readonly.box.removeAll();
    expect(readonly.item.tags).toHaveLength(4);
  });
  it('does not replace a later owner or use its chain to restore rows', () => {
    const { box, dispose } = setup();
    const previous = box.add;
    const later = (name: string, type?: number) => previous(name, type);
    box.add = later;
    dispose();
    expect(box.add).toBe(later);
    expect(names(box)).toEqual(['manual', 'automatic']);
    box.add('neo:identity:0', 0);
    expect(names(box)).toContain('neo:identity:0');
  });
  it('rejects managed saves and pastes before existing native listeners, but allows ordinary multiline', () => {
    const { box, item } = setup();
    const field = box.rows.children[0].querySelector('editable-text')!;
    field.value = 'neo:identity:0';
    box.emit(new FakeEvent('blur', field, box));
    expect(field.value).toBe('manual');
    expect(item.tags).toHaveLength(4);
    field.value = 'ordinary';
    const paste = new FakeEvent('paste', field, box);
    paste.clipboardData = { getData: () => '\nneo:identity:1' };
    box.emit(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(field.value).toBe('manual');
    field.value = 'one\ntwo';
    box.emit(new FakeEvent('change', field, box));
    expect(item.tags.map((tag) => tag.tag)).toEqual([
      'neo:identity:0',
      'neo:identity:1',
      'automatic',
      'one',
      'two',
    ]);
  });
  it('keeps newer isolation active and reveals native rows after the final owner retires', () => {
    const { box, dispose } = setup();
    const second = protectNativeTagsBox(box as unknown as Element, marker, vi.fn(), () => true)!;
    dispose();
    expect(names(box)).toEqual(['manual', 'automatic']);
    second();
    expect(names(box)).toEqual(['manual', 'automatic', 'neo:identity:0', 'neo:identity:1']);
  });
  it('restores rows without losing pending edits, and stale wrappers become inert', () => {
    const { box, item, dispose } = setup();
    const field = box.rows.children[0].querySelector('editable-text')!;
    field.value = 'pending';
    const staleSave = box.saveTag;
    dispose();
    expect(names(box)).toEqual(['manual', 'automatic', 'neo:identity:0', 'neo:identity:1']);
    expect(field.value).toBe('pending');
    const event = new FakeEvent('blur', field, box);
    staleSave(event);
    expect(item.tags.some((tag) => tag.tag === 'pending')).toBe(true);
    expect(item.tags.filter((tag) => marker(tag.tag))).toEqual([
      { tag: 'neo:identity:0', type: 0 },
      { tag: 'neo:identity:1', type: 1 },
    ]);
  });
});
