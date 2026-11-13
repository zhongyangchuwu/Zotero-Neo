type TagRecord = { tag: string; type: number };
type TagField = Element & {
  value: string;
  initialValue: string;
  ref?: { value: string; selectionStart: number | null; selectionEnd: number | null };
};
type TagsBox = Element & {
  item: {
    readonly libraryID: number;
    getTags(): TagRecord[];
    setTags(tags: TagRecord[]): void;
    saveTx(options: { undoAction: string }): Promise<unknown>;
  } | null;
  editable: boolean;
  count: number;
  _id(id: string): Element | null;
  render(...args: unknown[]): unknown;
  add(name: string, type?: number): unknown;
  addDynamicRow(tag?: TagRecord, tabindex?: number | false, skipAppend?: boolean): Element;
  updateRow(row: Element, tag?: TagRecord): unknown;
  updateCount(count?: number): unknown;
  saveTag(event: Event): unknown;
  handleKeyDown(event: Event): unknown;
  handlePaste(event: Event): unknown;
  removeAll(): unknown;
};

/** Protect plugin-owned tag names in Zotero's native item tags box. */
export function protectNativeTagsBox(
  element: Element,
  isManaged: (name: string) => boolean,
  onError: (error: unknown) => void,
  confirmRemoveAll: () => boolean,
): (() => void) | null {
  const box = element as TagsBox;
  const rows = box._id?.('rows');
  const methods = [
    'render',
    'add',
    'addDynamicRow',
    'updateRow',
    'updateCount',
    'saveTag',
    'handleKeyDown',
    'handlePaste',
    'removeAll',
  ] as const;
  if (!rows || methods.some((key) => typeof box[key] !== 'function')) return null;

  let active = true;
  const original = {
    render: box.render,
    add: box.add,
    addDynamicRow: box.addDynamicRow,
    updateRow: box.updateRow,
    updateCount: box.updateCount,
    saveTag: box.saveTag,
    handleKeyDown: box.handleKeyDown,
    handlePaste: box.handlePaste,
    removeAll: box.removeAll,
  };
  const rowName = (row: Element) => row.getAttribute('tagName') || '';
  const updateCount = () => {
    const count = Array.from(rows.children).filter((row) => !row.hasAttribute('isNew')).length;
    return original.updateCount.call(box, count);
  };
  const hideRows = () => {
    for (const row of Array.from(rows.children)) {
      if (isManaged(rowName(row))) row.remove();
    }
    updateCount();
  };
  const managedValue = (value: string) =>
    value.split(/\r\n?|\n/).some((part) => isManaged(part.trim()));
  const reject = (field: TagField, value = field.value) => {
    if (!isManaged(field.initialValue || '') && !managedValue(value)) return false;
    field.value = field.initialValue || '';
    return true;
  };
  const pasteValue = (field: TagField, event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text') ?? '';
    const input = field.ref;
    const value = input?.value ?? field.value;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    return value.slice(0, start) + text + value.slice(end);
  };
  const blocked = (field: TagField, event: Event) => {
    if (event.type === 'paste') {
      const value = pasteValue(field, event as ClipboardEvent);
      if (reject(field, value)) return true;
      const delimiter = value.match(/[\p{L}\p{N}]+\s*([,;])\s*[\p{L}\p{N}]+/iu)?.[1];
      return !!delimiter && reject(field, value.split(delimiter).join('\n'));
    }
    if (event.type === 'keydown') {
      const key = (event as KeyboardEvent).key;
      if (key !== 'Enter' && key !== 'Tab') return false;
    }
    return reject(field);
  };
  const guard = (event: Event) => {
    if (!active) return;
    const field = event
      .composedPath()
      .find(
        (node) =>
          node &&
          typeof (node as Element).matches === 'function' &&
          (node as Element).matches('editable-text'),
      ) as TagField | undefined;
    if (field && blocked(field, event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const removeAll = () => {
    if (!active) return original.removeAll.call(box);
    if (!box.editable || !box.item) return;
    const item = box.item;
    if (!confirmRemoveAll() || !active || box.item !== item || !box.editable) return;
    const managed = item.getTags().filter((tag) => isManaged(tag.tag));
    item.setTags(managed);
    void item.saveTx({ undoAction: 'undo-action-remove-all-tags' }).catch(onError);
  };
  const command = (event: Event) => {
    if (!active || event.target !== box._id('remove-all-item-tags')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      removeAll();
    } catch (error) {
      onError(error);
    }
  };
  const wrapped = {
    render: (...args: unknown[]) => {
      const result = original.render.apply(box, args);
      if (active) hideRows();
      return result;
    },
    add: (name: string, type?: number) => {
      if (active && isManaged(name)) {
        const row = box.addDynamicRow({ tag: name, type: type ?? 0 }, false, true);
        return row.querySelector('editable-text');
      }
      const result = original.add.call(box, name, type);
      if (active) {
        hideRows();
        const item = box.item;
        if (item) {
          let added: Element | undefined;
          let before: Element | null = null;
          // Native indices include hidden identities; place only the new visible row again.
          for (const row of rows.children) {
            if (rowName(row) === name) added = row;
            else if (
              !before &&
              (row.hasAttribute('isNew') ||
                Zotero.Tags.compareTagsOrder(item.libraryID, name, rowName(row)) < 0)
            )
              before = row;
          }
          if (added && added.nextElementSibling !== before) rows.insertBefore(added, before);
        }
      }
      return result;
    },
    addDynamicRow: (tag?: TagRecord, tabindex?: number | false, skipAppend?: boolean) => {
      const managed = active && !!tag && isManaged(tag.tag);
      return original.addDynamicRow.call(box, tag, tabindex, managed || skipAppend);
    },
    updateRow: (row: Element, tag?: TagRecord) => {
      const result = original.updateRow.call(box, row, tag);
      if (active && tag && isManaged(tag.tag)) {
        row.remove();
        updateCount();
      }
      return result;
    },
    updateCount: (count?: number) =>
      active ? updateCount() : original.updateCount.call(box, count),
    saveTag: (event: Event) => {
      const field = event.currentTarget as TagField | null;
      if (active && field && blocked(field, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      return original.saveTag.call(box, event);
    },
    handleKeyDown: (event: Event) => {
      const field = event.currentTarget as TagField | null;
      if (active && field && blocked(field, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      return original.handleKeyDown.call(box, event);
    },
    handlePaste: (event: Event) => {
      const field = event.currentTarget as TagField | null;
      if (active && field && blocked(field, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      return original.handlePaste.call(box, event);
    },
    removeAll,
  };
  const ownerKey = Symbol.for('zotero-neo.managed-tags-box-owner');
  Reflect.set(wrapped.add, ownerKey, () => active);
  Object.assign(box, wrapped);
  for (const type of ['blur', 'change', 'keydown', 'paste'])
    box.addEventListener(type, guard, true);
  box.addEventListener('command', command, true);
  hideRows();

  return () => {
    if (!active) return;
    active = false;
    for (const type of ['blur', 'change', 'keydown', 'paste'])
      box.removeEventListener(type, guard, true);
    box.removeEventListener('command', command, true);
    const ownsMethods = methods.every((key) => box[key] === wrapped[key]);
    for (const key of methods) {
      if (box[key] === wrapped[key]) Object.assign(box, { [key]: original[key] });
    }
    const previousOwner = Reflect.get(original.add, ownerKey) as (() => boolean) | undefined;
    if (ownsMethods && box.item && (!previousOwner || !previousOwner())) {
      try {
        for (const tag of box.item.getTags()) {
          if (
            isManaged(tag.tag) &&
            !Array.from(rows.children).some((row) => rowName(row) === tag.tag)
          ) {
            original.add.call(box, tag.tag, tag.type);
          }
        }
      } catch (error) {
        onError(error);
      }
    }
  };
}
