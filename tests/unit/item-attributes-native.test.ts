import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ItemAttributeNativeHost,
  NativeItemAttribute,
} from '../../src/toolkit/main/item-attributes-types';
import {
  assertCustomExtraKey,
  createItemAttributeNativeHost,
} from '../../src/toolkit/main/item-attributes';

type HookContext = { rowID: string; item: Zotero.Item; tabType: string; editable: boolean };
type TestRow = {
  rowID: string;
  label: { text: string };
  onGetData(context: HookContext): string;
  onSetData(context: HookContext & { value: string }): void;
  onItemChange(
    context: HookContext & {
      setEnabled(enabled: boolean): void;
      setEditable(editable: boolean): void;
    },
  ): void;
};
type TestColumn = {
  dataKey: string;
  label: string;
  enabledTreeIDs: string[];
  dataProvider(item: Zotero.Item): string;
  renderCell(
    index: number,
    data: string,
    column: { className: string },
    first: boolean,
    doc: Document,
  ): HTMLElement;
};

const hosts: ItemAttributeNativeHost[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  vi.unstubAllGlobals();
});

function fixture(type: 'text' | 'number' = 'text') {
  const columns: TestColumn[] = [];
  const rows: TestRow[] = [];
  const removedColumns = vi.fn(() => true);
  const removedRows = vi.fn(() => true);
  vi.stubGlobal('Zotero', {
    ItemTreeManager: {
      registerColumn(options: TestColumn) {
        const registered = { ...options, dataKey: `plugin-${options.dataKey}` };
        columns.push(registered);
        return registered.dataKey;
      },
      unregisterColumn: removedColumns,
    },
    ItemPaneManager: {
      registerInfoRow(options: TestRow) {
        const registered = { ...options, rowID: `plugin-${options.rowID}` };
        rows.push(registered);
        return registered.rowID;
      },
      unregisterInfoRow: removedRows,
    },
  });
  const onError = vi.fn();
  const write = vi.fn(
    async (_item: Zotero.Item, _value: string, _expected: string, _isCurrent: () => boolean) => {},
  );
  const definition: NativeItemAttribute = {
    id: 'rating',
    label: 'Rating',
    type,
    read: (item) => String(item.getField('extra')),
    canEdit: () => true,
    write,
  };
  const host = createItemAttributeNativeHost('neo@test', onError);
  hosts.push(host);
  host.replace([definition]);
  const item = (extra: string) =>
    ({
      id: 7,
      deleted: false,
      isRegularItem: () => true,
      getField: () => extra,
    }) as unknown as Zotero.Item;

  function attach(target = item('original Extra')) {
    const listeners = new Map<string, EventListener>();
    const unload = new Set<EventListener>();
    const document = {
      addEventListener: (type: string, callback: EventListener) => listeners.set(type, callback),
      removeEventListener: (type: string, callback: EventListener) => {
        if (listeners.get(type) === callback) listeners.delete(type);
      },
    } as unknown as Document;
    const selected = [target];
    const window = {
      document,
      closed: false,
      ZoteroPane: { getSelectedItems: () => selected },
      addEventListener: (_type: string, callback: EventListener) => unload.add(callback),
      removeEventListener: (_type: string, callback: EventListener) => unload.delete(callback),
    } as unknown as Window;
    const box = {
      item: target,
      extraItems: [] as Zotero.Item[],
      tabType: 'library',
      editable: true,
    };
    const row = rows.at(-1)!;
    const meta = { getAttribute: () => row.rowID };
    const field = {
      localName: 'editable-text',
      value: definition.read(target),
      cancelled: false,
      classList: { contains: (name: string) => name === 'custom-row-value' },
      ownerDocument: document,
      isConnected: true,
      readonly: false,
      hasAttribute: (name: string) => name === 'readonly' && field.readonly,
      closest: (selector: string) => (selector === 'info-box' ? box : meta),
    };
    const context = () => ({
      rowID: row.rowID,
      item: box.item,
      tabType: box.tabType,
      editable: box.editable,
    });
    const detach = host.attachWindow(window);
    const focus = () => listeners.get('focus')?.({ target: field } as unknown as Event);
    const blur = (value: string, callback = () => row.onSetData({ ...context(), value })) => {
      field.value = value;
      const event = { target: field, eventPhase: 1 };
      listeners.get('blur')?.(event as unknown as Event);
      event.eventPhase = 2;
      callback();
      event.eventPhase = 0;
    };
    return {
      target,
      window,
      document,
      field,
      box,
      row,
      selected,
      focus,
      blur,
      detach,
      context,
      listeners,
      unload,
    };
  }
  return {
    host,
    definition,
    columns,
    rows,
    onError,
    write,
    removedColumns,
    removedRows,
    attach,
    item,
  };
}

describe('native item attributes', () => {
  it('registers once across windows, keeps column IDs and refreshes row labels on rename', () => {
    const h = fixture();
    const first = h.attach();
    h.attach();
    expect(h.columns).toHaveLength(1);
    expect(h.rows).toHaveLength(1);
    expect(h.columns[0]!.enabledTreeIDs).toEqual(['main']);
    h.host.replace([{ ...h.definition, label: 'Renamed', type: 'number' }]);
    expect(h.columns[1]!.dataKey).toBe(h.columns[0]!.dataKey);
    expect(h.rows[1]!.rowID).not.toBe(h.rows[0]!.rowID);
    expect(h.rows[1]!.label.text).toBe('Renamed');
    first.row.onSetData({ ...first.context(), value: 'stale' });
    expect(h.write).not.toHaveBeenCalled();
    h.host.dispose();
    expect(h.removedColumns).toHaveBeenCalledTimes(2);
    expect(h.removedRows).toHaveBeenCalledTimes(2);
    expect(first.listeners.size).toBe(0);
  });

  it('sorts actual custom-column data numerically under ordinary and numeric digit collation', () => {
    const h = fixture('number');
    const column = h.columns[0]!;
    const values = ['10', '-0.5', '2', '0', '-10', '0.125', '-2', '1e-300', '1e300'];
    const expected = [...values].sort((a, b) => Number(a) - Number(b));
    for (const numeric of [false, true]) {
      const collation = new Intl.Collator('en', { numeric, sensitivity: 'base' });
      // Native _compareField calls compareString on String(custom cell data).
      const sorted = [...values].sort((a, b) =>
        collation.compare(
          String(column.dataProvider(h.item(a))),
          String(column.dataProvider(h.item(b))),
        ),
      );
      expect(sorted).toEqual(expected);
    }
    const document = {
      createElement: () => ({ className: '', textContent: '' }),
    } as unknown as Document;
    for (const value of values) {
      const cell = column.renderCell(
        0,
        column.dataProvider(h.item(value)),
        { className: 'rating' },
        false,
        document,
      );
      expect(cell.textContent).toBe(String(Number(value)));
    }
    expect(column.dataProvider(h.item(''))).toBe('');
    expect(column.dataProvider(h.item('not a number'))).toBe('');
  });

  it('captures focus-time Extra and exact owner without accepting another window blur', () => {
    const h = fixture();
    let extra = 'focus baseline';
    const target = { ...h.item(''), getField: () => extra } as unknown as Zotero.Item;
    const first = h.attach(target);
    const second = h.attach(target);
    first.focus();
    extra = 'unrelated later change';
    second.focus();
    first.blur('first value');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.write.mock.calls[0]!.slice(0, 3)).toEqual([target, 'first value', 'focus baseline']);
    second.blur('second value');
    expect(h.write.mock.calls[1]!.slice(0, 3)).toEqual([
      target,
      'second value',
      'unrelated later change',
    ]);
    second.row.onSetData({ ...second.context(), value: 'out of dispatch' });
    expect(h.write).toHaveBeenCalledTimes(2);
    expect(h.onError.mock.calls.at(-1)![1]).toBeUndefined();
  });

  it.each([
    'multi',
    'extraItems',
    'readonly',
    'nativeReadonly',
    'canEdit',
    'reader',
    'changedItem',
    'detachedField',
  ] as const)('refuses %s edits without changing the first selected item', (reason) => {
    const h = fixture();
    if (reason === 'canEdit') h.host.replace([{ ...h.definition, canEdit: () => false }]);
    const w = h.attach();
    w.focus();
    if (reason === 'multi') w.selected.push(h.item('other'));
    if (reason === 'extraItems') w.box.extraItems.push(h.item('other'));
    if (reason === 'readonly') w.field.readonly = true;
    if (reason === 'nativeReadonly') w.box.editable = false;
    if (reason === 'reader') w.box.tabType = 'reader';
    if (reason === 'changedItem') w.box.item = h.item('other');
    if (reason === 'detachedField') w.field.isConnected = false;
    w.blur('changed');
    expect(h.write).not.toHaveBeenCalled();
    expect(h.onError).toHaveBeenCalled();
  });

  it('does not save unchanged or cancelled blur and gates display to ordinary library items', () => {
    const h = fixture();
    const w = h.attach();
    w.focus();
    w.blur(w.field.value);
    expect(h.write).not.toHaveBeenCalled();
    w.focus();
    w.field.cancelled = true;
    w.blur('cancelled');
    expect(h.write).not.toHaveBeenCalled();
    const enabled = vi.fn();
    const editable = vi.fn();
    w.row.onItemChange({
      ...w.context(),
      tabType: 'reader',
      setEnabled: enabled,
      setEditable: editable,
    });
    expect(enabled).toHaveBeenLastCalledWith(false);
    expect(editable).toHaveBeenLastCalledWith(false);
    expect(w.row.onGetData({ ...w.context(), tabType: 'reader' })).toBe('');
    expect(
      w.row.onGetData({
        ...w.context(),
        item: { ...w.target, isRegularItem: () => false } as Zotero.Item,
      }),
    ).toBe('');
  });
  it('does not let an old window cleanup detach its replacement lease', () => {
    const h = fixture();
    const w = h.attach();
    const replacement = h.host.attachWindow(w.window);
    w.detach();
    w.focus();
    w.blur('replacement edit');
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.write.mock.calls[0]![3]()).toBe(true);
    replacement();
    expect(h.write.mock.calls[0]![3]()).toBe(false);
  });

  it('preserves a submitted blur save when focus moves before asynchronous admission', async () => {
    const h = fixture();
    const saved: string[] = [];
    h.write.mockImplementation(async (_item, value, _expected, isCurrent) => {
      await Promise.resolve();
      if (isCurrent()) saved.push(value);
    });
    const w = h.attach();
    w.focus();
    w.blur('committed value');
    w.focus();
    await Promise.resolve();
    expect(saved).toEqual(['committed value']);
  });

  it.each(['replace', 'detach', 'dispose', 'unload', 'reattach'] as const)(
    'retires accepted asynchronous writes and queued callbacks on %s',
    (reason) => {
      const h = fixture();
      const w = h.attach();
      w.focus();
      w.blur('changed');
      const isCurrent = h.write.mock.calls[0]![3];
      expect(isCurrent()).toBe(true);
      if (reason === 'replace') h.host.replace([h.definition]);
      if (reason === 'detach') w.detach();
      if (reason === 'dispose') h.host.dispose();
      if (reason === 'unload') for (const callback of [...w.unload]) callback({} as Event);
      if (reason === 'reattach') h.host.attachWindow(w.window);
      expect(isCurrent()).toBe(false);
      w.row.onSetData({ ...w.context(), value: 'late' });
      expect(h.write).toHaveBeenCalledTimes(1);
    },
  );
});

describe('native Extra key classification', () => {
  it('uses native extraction of fields and creators and rejects reserved keys', () => {
    const classify = vi.fn((extra: string) => {
      const key = extra.split(':')[0]!.toLowerCase();
      return {
        itemType: null,
        fields: new Map(key === 'doi' || key === 'container-title' ? [['native', 'x']] : []),
        creators: key === 'author' ? [{ name: 'x' }] : [],
        extra,
      };
    });
    vi.stubGlobal('Zotero', { Utilities: { Internal: { extractExtraFields: classify } } });
    expect(() => assertCustomExtraKey('Neo Rating')).not.toThrow();
    expect(classify).toHaveBeenCalledWith('Neo Rating: x');
    for (const key of [
      'DOI',
      'container-title',
      'author',
      'Type',
      'zV-marks-ABC',
      'zv_marks',
      'a\nb',
      'bad:key',
    ]) {
      expect(() => assertCustomExtraKey(key)).toThrow();
    }
  });

  it('fails closed when native classification is unavailable or unrecognizable', () => {
    vi.stubGlobal('Zotero', { Utilities: { Internal: {} } });
    expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unavailable');
    vi.stubGlobal('Zotero', { Utilities: { Internal: { extractExtraFields: () => ({}) } } });
    expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unknown');
  });
});
