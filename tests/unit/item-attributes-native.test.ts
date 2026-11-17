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
    data: string | undefined,
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
  const activeColumns = new Set<string>();
  const activeRows = new Set<string>();
  const removedColumns = vi.fn((id: string) => activeColumns.delete(id));
  const removedRows = vi.fn((id: string) => activeRows.delete(id));
  const registerRow = vi.fn((options: TestRow) => {
    const registered = { ...options, rowID: `plugin-${options.rowID}` };
    rows.push(registered);
    activeRows.add(registered.rowID);
    return registered.rowID;
  });
  vi.stubGlobal('Zotero', {
    ItemTreeManager: {
      registerColumn(options: TestColumn) {
        const registered = { ...options, dataKey: `plugin-${options.dataKey}` };
        columns.push(registered);
        activeColumns.add(registered.dataKey);
        return registered.dataKey;
      },
      unregisterColumn: removedColumns,
    },
    ItemPaneManager: {
      registerInfoRow: registerRow,
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
    const blur = (value: string) => {
      field.value = value;
      listeners.get('blur')?.({ target: field } as unknown as Event);
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
    registerRow,
    activeColumns,
    activeRows,
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
    first.focus();
    h.host.replace([{ ...h.definition, label: 'Renamed', type: 'number' }]);
    expect(h.columns[1]!.dataKey).toBe(h.columns[0]!.dataKey);
    expect(h.rows[1]!.rowID).not.toBe(h.rows[0]!.rowID);
    expect(h.rows[1]!.label.text).toBe('Renamed');
    first.blur('stale');
    expect(h.write).not.toHaveBeenCalled();
    h.host.dispose();
    expect(h.removedColumns).toHaveBeenCalledTimes(2);
    expect(h.removedRows).toHaveBeenCalledTimes(2);
    expect(first.listeners.size).toBe(0);
  });

  it('sorts exact decimals under ordinary and numeric collation and renders the original spelling', () => {
    const h = fixture('number');
    const column = h.columns[0]!;
    // Each group has one exact value, possibly with multiple equivalent spellings.
    const groups = [
      ['-1e300'],
      ['-9007199254740993'],
      ['-9007199254740992'],
      ['-10'],
      ['-2'],
      ['-1.23'],
      ['-1.2', '-001.2000e+00'],
      ['-0.123456789012345678902'],
      ['-0.123456789012345678901'],
      ['-1e-400'],
      ['-1e-401'],
      ['0', '-0', '+0.000e-400'],
      ['1e-9007199254740993'],
      ['1e-9007199254740992'],
      ['1e-1000'],
      ['1e-999'],
      ['1e-401'],
      ['1e-400'],
      ['0.123456789012345678901'],
      ['0.123456789012345678902'],
      ['1.2', '001.2000e+00', '+12e-1'],
      ['1.23'],
      ['2'],
      ['10'],
      ['9007199254740992'],
      ['9007199254740993'],
      ['1e300'],
      ['not|a number', 'NaN', 'Infinity', '0x10'],
    ];
    const rank = new Map(
      groups.flatMap((group, index) => group.map((value) => [value, index] as const)),
    );
    const values = groups.flat();
    const expectedRanks = values.map((value) => rank.get(value));
    for (const numeric of [false, true]) {
      const collation = new Intl.Collator('en', { numeric, sensitivity: 'base' });
      // Native _compareField calls compareString on String(custom cell data).
      const sorted = [...values]
        .reverse()
        .sort((a, b) =>
          collation.compare(
            String(column.dataProvider(h.item(a))),
            String(column.dataProvider(h.item(b))),
          ),
        );
      expect(sorted.map((value) => rank.get(value))).toEqual(expectedRanks);
    }
    const document = {
      createElement: () => ({ className: '', textContent: '' }),
    } as unknown as Document;
    for (const value of [...values, '']) {
      const cell = column.renderCell(
        0,
        column.dataProvider(h.item(value)),
        { className: 'rating' },
        false,
        document,
      );
      expect(cell.textContent).toBe(value);
    }
    expect(column.dataProvider(h.item(''))).toBe('');
  });

  it.each(['text', 'number'] as const)('renders a missing native %s cell as empty', (type) => {
    const h = fixture(type);
    const document = {
      createElement: () => ({ className: '', textContent: '' }),
    } as unknown as Document;
    const cell = h.columns[0]!.renderCell(
      0,
      undefined,
      { className: 'attribute' },
      false,
      document,
    );
    expect(cell.textContent).toBe('');
  });

  it.each(['row', 'column'] as const)(
    'aborts replacement on a thrown %s release, retires callbacks and retains only failed ownership',
    (kind) => {
      const h = fixture();
      h.host.replace([h.definition, { ...h.definition, id: 'other' }]);
      const oldColumn = h.columns[1]!;
      const oldRow = h.rows[1]!;
      const error = new Error(`${kind} unregister failed before deleting its resource`);
      const remove = kind === 'row' ? h.removedRows : h.removedColumns;
      remove.mockImplementationOnce(() => {
        throw error;
      });
      h.removedRows.mockClear();
      h.removedColumns.mockClear();

      expect(() => h.host.replace([{ ...h.definition, label: 'Replacement' }])).toThrow(error);
      expect(h.columns).toHaveLength(3);
      expect(h.rows).toHaveLength(3);
      expect(h.removedRows).toHaveBeenCalledTimes(2);
      expect(h.removedColumns).toHaveBeenCalledTimes(2);
      expect(h.activeRows.size).toBe(kind === 'row' ? 1 : 0);
      expect(h.activeColumns.size).toBe(kind === 'column' ? 1 : 0);
      expect(oldColumn.dataProvider(h.item('stale'))).toBe('');
      expect(h.write).not.toHaveBeenCalled();

      expect(() => h.host.dispose()).not.toThrow();
      expect(remove).toHaveBeenLastCalledWith(kind === 'row' ? oldRow.rowID : oldColumn.dataKey);
      expect(h.activeRows.size + h.activeColumns.size).toBe(0);
      expect(h.removedRows).toHaveBeenCalledTimes(kind === 'row' ? 3 : 2);
      expect(h.removedColumns).toHaveBeenCalledTimes(kind === 'column' ? 3 : 2);
    },
  );

  it('retries retained ownership on explicit dispose after retirement and accepts already-absent IDs', () => {
    const h = fixture();
    const w = h.attach();
    const error = new Error('row release failed');
    h.removedRows.mockImplementationOnce(() => {
      throw error;
    });
    expect(() => h.host.dispose()).toThrow(error);
    expect(w.listeners.size).toBe(0);
    expect(h.activeRows.size).toBe(1);
    expect(h.activeColumns.size).toBe(0);
    expect(() => h.host.replace([h.definition])).toThrow('disposed');
    expect(() => h.host.attachWindow(w.window)).toThrow('disposed');
    // Another native owner removed the retained ID; false now means already absent.
    h.activeRows.clear();
    expect(() => h.host.dispose()).not.toThrow();
    expect(h.removedRows).toHaveLastReturnedWith(false);
    expect(h.removedRows).toHaveBeenCalledTimes(2);
    expect(h.removedColumns).toHaveBeenCalledTimes(1);
    h.host.dispose();
    expect(h.removedRows).toHaveBeenCalledTimes(2);
    expect(h.removedColumns).toHaveBeenCalledTimes(1);
  });

  it('preserves a registration error while retaining thrown cleanup failures for explicit disposal', () => {
    const h = fixture();
    const registrationError = new Error('Info row registration failed');
    const cleanupError = new Error('new column cleanup failed before deletion');
    h.registerRow.mockImplementationOnce(() => {
      h.removedColumns.mockImplementationOnce(() => {
        throw cleanupError;
      });
      throw registrationError;
    });
    expect(() => h.host.replace([h.definition])).toThrow(registrationError);
    expect(h.activeRows.size).toBe(0);
    expect(h.activeColumns.size).toBe(1);
    expect(h.columns[1]!.dataProvider(h.item('stale'))).toBe('');
    expect(() => h.host.dispose()).not.toThrow();
    expect(h.removedColumns).toHaveBeenLastCalledWith(h.columns[1]!.dataKey);
    expect(h.activeColumns.size).toBe(0);
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
  });

  it('saves a readonly-created row after it becomes writable without native field listeners', () => {
    const h = fixture();
    const w = h.attach();
    w.box.editable = false;
    w.field.readonly = true;
    w.focus();
    w.blur('readonly attempt');
    expect(h.write).not.toHaveBeenCalled();
    w.box.editable = true;
    w.field.readonly = false;
    w.focus();
    w.blur('writable value');
    expect(h.write.mock.calls[0]!.slice(0, 3)).toEqual([
      w.target,
      'writable value',
      'original Extra',
    ]);
    expect(h.onError).not.toHaveBeenCalled();
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
      w.blur('late');
      expect(h.write).toHaveBeenCalledTimes(1);
    },
  );
});

describe('native Extra key classification', () => {
  function classifierFixture() {
    const classify = vi.fn((extra: string) => {
      const key = extra.split(':')[0]!.toLowerCase();
      const field = ['doi', 'title', 'container-title', 'issued', 'accessed'].includes(key);
      const creator = ['author', 'container-author'].includes(key);
      return {
        itemType: null as string | null,
        fields: new Map(field ? [['native', 'x']] : []),
        creators: creator ? [{ name: 'x' }] : [],
        extra: field || creator ? '' : extra,
      };
    });
    // Native getAll records and loaded schema maps, not a hand-maintained deny list.
    const native = {
      ItemFields: {
        getAll: () => [
          { id: 1, name: 'DOI' },
          { id: 2, name: 'title' },
          { id: 3, name: 'publicationTitle' },
          { id: 4, name: 'accessDate' },
        ],
      },
      CreatorTypes: {
        getAll: () => [
          { id: 1, name: 'author' },
          { id: 2, name: 'bookAuthor' },
          { id: 3, name: 'seriesEditor' },
        ],
      },
      Schema: {
        CSL_TEXT_MAPPINGS: {
          DOI: ['DOI'],
          title: ['title'],
          'container-title': ['publicationTitle'],
          status: [],
        },
        CSL_DATE_MAPPINGS: {
          issued: 'date',
          accessed: 'accessDate',
          submitted: 'filingDate',
          'original-date': 'originalDate',
        },
        CSL_NAME_MAPPINGS: {
          author: 'author',
          bookAuthor: 'container-author',
          seriesEditor: 'collection-editor',
        },
      },
      Utilities: { Internal: { extractExtraFields: classify } },
    };
    vi.stubGlobal('Zotero', native);
    return { native, classify };
  }

  it('protects complete Neo normalization classes from actual native inventories', () => {
    const h = classifierFixture();
    expect(() => assertCustomExtraKey('Neo Rating')).not.toThrow();
    expect(h.classify).toHaveBeenCalledWith('Neo Rating: x');
    // These original native probes do not recognize the aliases; inventory admission must.
    for (const key of ['D O I', 'Ti_tle', 'Cont ainer Title']) {
      expect(h.classify(`${key}: x`).extra).toBe(`${key}: x`);
    }
    for (const key of [
      'DOI',
      'D O I',
      'D_O-I',
      'title',
      'Ti_tle',
      'container-title',
      'Cont ainer Title',
      'Publication_Title',
      'Access Date',
      'Sta tus',
      'a c c e s s e d',
      'Is_sued',
      'Sub-mitted',
      'Original_Date',
      'author',
      'a u t h o r',
      'Book Author',
      'Container Author',
      'Collection_Editor',
      'Type',
      'T_y p-e',
      'zV-marks-ABC',
      'zv_marks',
      'a\nb',
      'bad:key',
    ]) {
      expect(() => assertCustomExtraKey(key), key).toThrow();
    }
  });

  it('protects newly available native names without a hardcoded key list', () => {
    const h = classifierFixture();
    vi.stubGlobal('Zotero', {
      ...h.native,
      ItemFields: { getAll: () => [{ id: 9, name: 'futureNativeField' }] },
      CreatorTypes: { getAll: () => [{ id: 9, name: 'futureCreator' }] },
      Schema: {
        ...h.native.Schema,
        CSL_TEXT_MAPPINGS: { 'future-csl-field': ['futureNativeField'] },
      },
    });
    for (const key of ['Future Native Field', 'Future_Creator', 'Fut ure CSL field']) {
      expect(() => assertCustomExtraKey(key), key).toThrow();
    }
    expect(() => assertCustomExtraKey('Neo Rating')).not.toThrow();
  });

  it.each(['field', 'creator', 'itemType', 'rewrite'] as const)(
    'retains the original extractor probe for additional native %s classification',
    (kind) => {
      const h = classifierFixture();
      h.classify.mockImplementation((extra) => ({
        itemType: kind === 'itemType' ? 'book' : null,
        fields: new Map(kind === 'field' ? [['additional-native-field', 'x']] : []),
        creators: kind === 'creator' ? [{ name: 'x' }] : [],
        extra: kind === 'rewrite' ? '' : extra,
      }));
      expect(() => assertCustomExtraKey('Additional Native Alias')).toThrow();
      expect(h.classify).toHaveBeenCalledWith('Additional Native Alias: x');
    },
  );

  it.each(['ItemFields', 'CreatorTypes'] as const)(
    'fails closed without the native %s inventory',
    (inventory) => {
      const h = classifierFixture();
      vi.stubGlobal('Zotero', { ...h.native, [inventory]: undefined });
      expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unavailable');
      vi.stubGlobal('Zotero', { ...h.native, [inventory]: { getAll: () => [] } });
      expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unavailable');
      vi.stubGlobal('Zotero', { ...h.native, [inventory]: { getAll: () => [{}] } });
      expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unknown');
    },
  );

  it.each(['CSL_TEXT_MAPPINGS', 'CSL_DATE_MAPPINGS', 'CSL_NAME_MAPPINGS'] as const)(
    'fails closed without loaded %s',
    (mapping) => {
      const h = classifierFixture();
      for (const unavailable of [undefined, {}, []]) {
        vi.stubGlobal('Zotero', {
          ...h.native,
          Schema: { ...h.native.Schema, [mapping]: unavailable },
        });
        expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unavailable');
      }
    },
  );

  it('fails closed when native classification is unavailable or unrecognizable', () => {
    const h = classifierFixture();
    vi.stubGlobal('Zotero', { ...h.native, Utilities: { Internal: {} } });
    expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unavailable');
    vi.stubGlobal('Zotero', {
      ...h.native,
      Utilities: { Internal: { extractExtraFields: () => ({}) } },
    });
    expect(() => assertCustomExtraKey('Neo Rating')).toThrow('unknown');
  });
});
