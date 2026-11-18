import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cleanup } from '../../src/core/cleanup';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { ItemAttributeDefinition } from '../../src/item-attributes/types';
import {
  mountLiteratureTable,
  type LiteratureItem,
  type LiteratureReadOptions,
  type LiteratureScope,
} from '../../src/literature-table/controller';
import { readLiteratureViews, writeLiteratureViews } from '../../src/literature-table/view-storage';
import type { LiteratureFilter } from '../../src/literature-table/views';
import type {
  LiteratureNativeField,
  LiteratureTableCommand,
  LiteratureTableModel,
} from '../../src/literature-table/model';
import { createLiteratureTableHost } from '../../src/toolkit/main/literature-table';
import type { NativeReactViewOptions } from '../../src/ui/react/types';

const bridge = vi.hoisted(() => ({ mount: vi.fn() }));
vi.mock('../../src/platform/native-ui', () => ({ mountNativeReactView: bridge.mount }));

const library: LiteratureScope = { id: 'library:1', label: 'My Library' };
const collection: LiteratureScope = { id: 'collection:2', label: 'Research' };
const score: ItemAttributeDefinition = {
  id: 'score',
  key: 'Research Score',
  label: 'Score',
  type: 'number',
};
const nativeFields: readonly LiteratureNativeField[] = [
  { id: 'native:tags', kind: 'tags', label: 'Tags' },
  { id: 'native:date', kind: 'date', label: 'Publication date' },
  { id: 'native:dateAdded', kind: 'date', label: 'Date added (UTC)' },
  { id: 'native:dateModified', kind: 'date', label: 'Date modified (UTC)' },
  { id: 'native:DOI', kind: 'text', label: 'DOI' },
];

const cleanups: Cleanup[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  bridge.mount.mockReset();
  vi.unstubAllGlobals();
});

function item(id: number, extra = ''): LiteratureItem {
  return { id, title: `Paper ${id}`, year: '2026', extra };
}

function open(initialID: string | undefined = collection.id, storage = { raw: '' }) {
  const updates: LiteratureTableModel[] = [];
  const reads: Array<
    { id: string } & LiteratureReadOptions & PromiseWithResolvers<readonly LiteratureItem[]>
  > = [];
  let dispatch!: (command: LiteratureTableCommand) => void;
  let changed: (() => void) | undefined;
  let viewsChanged: (() => void) | undefined;
  const disposeView = vi.fn();
  const reportError = vi.fn();
  const locate = vi.fn((_id: number) => Promise.resolve(true));
  const unobserve = vi.fn(() => {
    changed = undefined;
  });
  const catalog = { scopes: [library, collection], definitions: [score] };
  bridge.mount.mockImplementationOnce(
    (options: NativeReactViewOptions<LiteratureTableModel, LiteratureTableCommand>) => {
      expect(options.surface).toBe('literature-table');
      dispatch = options.dispatch;
      updates.push(options.model);
      return {
        ready: Promise.resolve(),
        update: (model: LiteratureTableModel) => {
          updates.push(model);
        },
        getElement: () => null,
        dispose: disposeView,
      };
    },
  );
  const dispose = mountLiteratureTable(
    {} as HTMLElement,
    {
      scopes: () => catalog.scopes,
      initialScopeID: () => initialID,
      definitions: () => catalog.definitions,
      nativeFields: () => nativeFields,
      readItems(id, options) {
        const gate = Promise.withResolvers<readonly LiteratureItem[]>();
        reads.push({ id, ...options, ...gate });
        return gate.promise;
      },
      observe(change) {
        changed = change;
        return unobserve;
      },
      locate,
      readViews: () => storage.raw,
      writeViews(raw) {
        storage.raw = raw;
        viewsChanged?.();
      },
      observeViews(change) {
        viewsChanged = change;
        return () => {
          viewsChanged = undefined;
        };
      },
    },
    'en',
    reportError,
  );
  cleanups.push(dispose);
  return {
    get model() {
      return updates.at(-1)!;
    },
    send: dispatch,
    notify: () => changed?.(),
    notifyViews: () => viewsChanged?.(),
    reads,
    updates,
    catalog,
    locate,
    reportError,
    dispose,
    disposeView,
    unobserve,
  };
}

describe('literature table read-only workbench', () => {
  it('sorts numbers exactly, preserves spelling, and keeps unorderable cells last both ways', async () => {
    const table = open();
    table.reads[0]!.resolve([
      item(18),
      item(6, 'Research Score: 9007199254740993'),
      item(10, 'Research Score: 2.00'),
      item(8, 'Research Score: -2.01'),
      item(9, 'Research Score: 10'),
      item(16, 'Research Score: 0x10'),
      item(5, 'Research Score: 9007199254740992'),
      item(14, 'Research Score: 2\nresearch_score: 10'),
      item(2, 'Research Score: 2e0'),
      item(4, 'Research Score: 1e-400'),
      item(3, 'Research Score: 0'),
    ]);
    await Promise.resolve();
    expect(table.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    table.send({ type: 'column', id: 'score' });
    table.send({ type: 'sort', id: 'attribute:score' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([8, 3, 4, 2, 10, 9, 5, 6, 14, 16, 18]);
    expect(table.model.rows.map(({ cells }) => cells[2])).toEqual([
      { state: 'value', value: '-2.01' },
      { state: 'value', value: '0' },
      { state: 'value', value: '1e-400' },
      { state: 'value', value: '2e0' },
      { state: 'value', value: '2.00' },
      { state: 'value', value: '10' },
      { state: 'value', value: '9007199254740992' },
      { state: 'value', value: '9007199254740993' },
      { state: 'ambiguous' },
      { state: 'invalid', value: '0x10' },
      { state: 'missing' },
    ]);
    table.send({ type: 'sort', id: 'attribute:score' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([6, 5, 9, 2, 10, 4, 3, 8, 14, 16, 18]);
    expect(table.locate).not.toHaveBeenCalled();
  });

  it('starts at the native scope and retires selected, notified and disposed reads', async () => {
    const table = open();
    expect(table.model.scope).toEqual(collection);
    expect(table.model.status).toBe('loading');
    table.send({ type: 'scope', id: library.id });
    table.reads[0]!.reject(new Error('old scope failed'));
    await Promise.resolve();
    expect(table.model.scope).toEqual(library);
    expect(table.model.status).toBe('loading');
    expect(table.reportError).not.toHaveBeenCalled();

    // The old promise resolves before the queued refresh callback, but must not publish.
    table.reads[1]!.resolve([item(12)]);
    table.notify();
    table.notify();
    await Promise.resolve();
    expect(table.reads.map(({ id }) => id)).toEqual([collection.id, library.id, library.id]);
    expect(table.updates.some(({ rows }) => rows.some(({ id }) => id === 12))).toBe(false);
    table.reads[2]!.resolve([item(13)]);
    await Promise.resolve();
    expect(table.model.status).toBe('ready');
    expect(table.model.rows.map(({ id }) => id)).toEqual([13]);

    table.notify();
    await Promise.resolve();
    table.notify();
    table.dispose();
    const lastUpdate = table.model;
    table.reads[3]!.reject(new Error('retired window read failed'));
    await Promise.resolve();
    expect(table.reads).toHaveLength(4);
    expect(table.model).toBe(lastUpdate);
    expect(table.reportError).not.toHaveBeenCalled();
    expect(table.unobserve).toHaveBeenCalledTimes(1);
    expect(table.disposeView).toHaveBeenCalledTimes(1);
  });

  it('offers retry for active failures and keeps a deleted scope until the user switches', async () => {
    const table = open();
    const error = new Error('current load failed');
    table.reads[0]!.reject(error);
    await Promise.resolve();
    expect(table.model.status).toBe('error');
    expect(table.reportError).toHaveBeenCalledWith(error);
    table.send({ type: 'retry' });
    table.send({ type: 'retry' });
    expect(table.reads).toHaveLength(2);
    table.reads[1]!.resolve([]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ status: 'ready', total: 0, rows: [] });

    table.catalog.scopes = [library];
    table.notify();
    await Promise.resolve();
    expect(table.model).toMatchObject({
      status: 'unavailable',
      scope: collection,
      scopes: [library],
    });
    expect(table.reads).toHaveLength(2);
    table.send({ type: 'retry' });
    expect(table.model.status).toBe('unavailable');
    table.send({ type: 'scope', id: library.id });
    expect(table.reads[2]!.id).toBe(library.id);
    table.reads[2]!.resolve([item(1)]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ status: 'ready', scope: library, total: 1 });
    expect(table.locate).not.toHaveBeenCalled();
  });

  it('uses window-local columns, sorts and paginates before projecting visible rows', async () => {
    const table = open('unknown');
    expect(table.model.scope).toEqual(library);
    table.reads[0]!.resolve(Array.from({ length: 51 }, (_, index) => item(51 - index)));
    await Promise.resolve();
    expect(table.model).toMatchObject({ page: 1, pageCount: 2, total: 51 });
    expect(table.model.rows).toHaveLength(50);
    expect(table.model.rows[0]!.id).toBe(1);
    table.send({ type: 'column', id: 'score' });
    table.send({ type: 'page', delta: 1 });
    expect(table.model.rows.map(({ id }) => id)).toEqual([51]);
    const another = open();
    expect(another.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    expect(another.model).toMatchObject({
      sortColumn: 'title',
      sortDirection: 'ascending',
      page: 1,
    });
    table.notify();
    await Promise.resolve();
    table.reads[1]!.resolve([item(1, 'Research Score: 4')]);
    await Promise.resolve();
    expect(table.model).toMatchObject({ page: 1, pageCount: 1 });
    expect(table.model.rows[0]!.cells[2]).toEqual({ state: 'value', value: '4' });

    table.send({ type: 'sort', id: 'attribute:score' });
    table.catalog.definitions = [];
    table.notify();
    await Promise.resolve();
    table.reads[2]!.resolve([item(1)]);
    await Promise.resolve();
    expect(table.model.columns.map(({ id }) => id)).toEqual(['title', 'year']);
    expect(table.model).toMatchObject({ sortColumn: 'title', sortDirection: 'ascending' });
  });

  it('only locates visible rows once at a time and shows failure without changing scope', async () => {
    const table = open();
    table.reads[0]!.resolve([item(1), item(2)]);
    await Promise.resolve();
    const pending = Promise.withResolvers<boolean>();
    table.locate.mockReturnValueOnce(pending.promise);
    table.send({ type: 'locate', id: 99 });
    table.send({ type: 'locate', id: 1 });
    table.send({ type: 'locate', id: 2 });
    expect(table.locate.mock.calls).toEqual([[1]]);
    expect(table.model.locating).toBe(true);
    pending.resolve(false);
    await Promise.resolve();
    expect(table.model).toMatchObject({ locating: false, locateFailed: true, scope: collection });
    table.send({ type: 'locate', id: 2 });
    await Promise.resolve();
    expect(table.locate.mock.calls).toEqual([[1], [2]]);
    expect(table.model).toMatchObject({ locating: false, locateFailed: false, scope: collection });
  });
});

describe('literature filters and saved views', () => {
  const threshold: LiteratureFilter = {
    field: 'attribute:score',
    kind: 'number',
    operator: 'at-least',
    value: '9007199254740993',
  };
  const missingPDF: LiteratureFilter = {
    field: 'pdf',
    kind: 'pdf',
    operator: 'missing',
    value: '',
  };

  it('offers single-select definitions in the column chooser and applies their option filters', async () => {
    const table = open();
    table.catalog.definitions.push({
      id: 'phase',
      key: 'Reading Phase',
      label: 'Phase',
      type: 'single-select',
      options: [{ id: 'reading', label: 'Reading' }],
    });
    table.notify();
    await Promise.resolve();
    table.reads[1]!.resolve([item(1, 'Reading Phase: ["reading"]'), item(2)]);
    await Promise.resolve();
    table.send({ type: 'column', id: 'phase' });
    table.send({
      type: 'filter-set',
      filter: {
        field: 'attribute:phase',
        kind: 'single-select',
        operator: 'equals',
        value: 'reading',
      },
    });
    expect(table.model.rows.map(({ id }) => id)).toEqual([1]);
    expect(table.model.columns.at(-1)?.label).toBe('Phase');
    expect(table.model.rows[0]?.cells.at(-1)).toEqual({ state: 'value', value: 'Reading' });
  });

  it('saves the scope, columns, sort and intersected filters, then restores them after reopening', async () => {
    const storage = { raw: '' };
    const table = open(collection.id, storage);
    const papers = [
      { ...item(1, 'Research Score: 9007199254740992'), hasPDF: false },
      { ...item(2, 'Research Score: 9007199254740993'), hasPDF: false },
      { ...item(3, 'Research Score: 9007199254740994'), hasPDF: true },
    ];
    table.reads[0]!.resolve(papers);
    await Promise.resolve();
    expect(table.reads[0]!.includePDF).toBe(false);
    table.send({ type: 'column', id: 'score' });
    table.send({ type: 'sort', id: 'attribute:score' });
    table.send({ type: 'sort', id: 'attribute:score' });
    table.send({ type: 'filter-set', filter: threshold });
    expect(table.model.rows.map(({ id }) => id)).toEqual([3, 2]);
    table.send({ type: 'filter-set', filter: missingPDF });
    expect(table.reads[1]!.includePDF).toBe(true);
    table.reads[1]!.resolve(papers);
    await Promise.resolve();
    expect(table.model.rows.map(({ id }) => id)).toEqual([2]);
    expect(table.model.scopeTotal).toBe(3);
    table.send({ type: 'view-save', replace: false, name: 'Missing PDF' });
    table.send({ type: 'filter-remove', index: 1 });
    expect(table.model.viewDirty).toBe(true);
    table.dispose();

    const reopened = open(library.id, storage);
    expect(reopened.model.viewNames).toEqual(['Missing PDF']);
    reopened.send({ type: 'view-open', name: 'Missing PDF' });
    reopened.reads[1]!.resolve(papers);
    await Promise.resolve();
    reopened.reads[0]!.resolve([item(99)]);
    await Promise.resolve();
    expect(reopened.model.scope?.id).toBe(collection.id);
    expect(reopened.model.columns.map(({ id }) => id)).toEqual([
      'title',
      'year',
      'attribute:score',
    ]);
    expect(reopened.model.sortDirection).toBe('descending');
    expect(reopened.model.rows.map(({ id }) => id)).toEqual([2]);
    expect(reopened.model.viewDirty).toBe(false);

    reopened.catalog.definitions.length = 0;
    reopened.notify();
    await Promise.resolve();
    reopened.reads[2]!.resolve(papers);
    await Promise.resolve();
    expect(reopened.model.filterUnavailable).toBe(true);
    expect(reopened.model.layoutUnavailable).toBe(true);
    expect(reopened.model.rows).toEqual([]);
    reopened.send({ type: 'filter-remove', index: 0 });
    reopened.reads[3]!.resolve(papers);
    await Promise.resolve();
    expect(reopened.model.rows.map(({ id }) => id)).toEqual([1, 2]);
  });

  it('does not overwrite a different window’s update and can recover by reloading or saving a copy', async () => {
    const storage = { raw: '' };
    const table = open(collection.id, storage);
    table.reads[0]!.resolve([item(1)]);
    await Promise.resolve();
    table.send({ type: 'view-save', replace: false, name: 'Reading' });
    const original = readLiteratureViews(storage.raw)[0]!;
    storage.raw = writeLiteratureViews([{ ...original, sort: 'year' }]);
    table.notifyViews();
    table.send({ type: 'view-save', replace: true, name: 'Renamed' });
    expect(table.model.viewMessage).toBe('conflict');
    table.send({ type: 'view-delete' });
    expect(table.model.viewMessage).toBe('conflict');
    expect(readLiteratureViews(storage.raw)[0]?.sort).toBe('year');
    table.send({ type: 'view-save', replace: false, name: ' reading ' });
    expect(table.model.viewMessage).toBe('duplicate');
    table.send({ type: 'view-save', replace: false, name: 'Copy' });
    expect(readLiteratureViews(storage.raw).map(({ name }) => name)).toEqual(['Reading', 'Copy']);
    table.send({ type: 'view-open', name: 'Reading' });
    table.reads[1]!.resolve([item(1)]);
    await Promise.resolve();
    expect(table.model.sortColumn).toBe('year');
    table.send({ type: 'view-save', replace: true, name: 'Renamed' });
    table.send({ type: 'view-delete' });
    expect(table.model.activeViewName).toBeNull();
    expect(readLiteratureViews(storage.raw).map(({ name }) => name)).toEqual(['Copy']);
    expect(table.model.rows.map(({ id }) => id)).toEqual([1]);
  });
});

describe('native literature fields', () => {
  it('loads only shown and filtered fields, discards stale reads, and restores native views', async () => {
    const storage = { raw: '' };
    const table = open(collection.id, storage);
    const rows = [
      {
        ...item(1),
        native: {
          'native:date': { text: 'February 2024', key: '2024-02' },
          'native:tags': { tags: ['Systematic, review', 'Trial'] },
          'native:DOI': '10.1000/example',
        },
      },
      {
        ...item(2),
        native: {
          'native:date': { text: '2024', key: '2024' },
          'native:tags': { tags: ['Trial'] },
          'native:DOI': '10.1000/preprint',
        },
      },
      { ...item(3), native: { 'native:date': { text: 'Spring 2024', key: null } } },
      { ...item(4), native: { 'native:date': { text: '2024-02-29', key: '2024-02-29' } } },
    ];
    expect([...table.reads[0]!.nativeFields]).toEqual([]);
    table.catalog.definitions.push({
      id: 'tags',
      key: 'Tag Description',
      label: 'Description',
      type: 'text',
    });
    table.send({ type: 'column', id: 'native:date' });
    expect([...table.reads[1]!.nativeFields]).toEqual(['native:date']);
    table.reads[0]!.resolve([item(99)]);
    await Promise.resolve();
    expect(table.model.status).toBe('loading');
    table.reads[1]!.resolve(rows);
    await Promise.resolve();
    expect(table.model.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tags', columnID: 'attribute:tags', shown: false }),
        expect.objectContaining({ id: 'native:tags', columnID: 'native:tags', shown: false }),
      ]),
    );
    table.send({ type: 'sort', id: 'native:date' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([2, 1, 4, 3]);
    expect(table.model.rows.map(({ cells }) => cells[2])).toEqual([
      { state: 'value', value: '2024' },
      { state: 'value', value: 'February 2024' },
      { state: 'value', value: '2024-02-29' },
      { state: 'invalid-date', value: 'Spring 2024' },
    ]);
    table.send({ type: 'sort', id: 'native:date' });
    expect(table.model.rows.map(({ id }) => id)).toEqual([4, 1, 2, 3]);

    const trial: LiteratureFilter = {
      field: 'native:tags',
      kind: 'tags',
      operator: 'has-tag',
      value: 'Trial',
    };
    table.send({ type: 'filter-set', filter: trial });
    table.send({ type: 'filter-set', filter: { ...trial, value: 'Systematic, review' } });
    expect(table.reads).toHaveLength(3);
    expect([...table.reads[2]!.nativeFields]).toEqual(['native:date', 'native:tags']);
    table.send({ type: 'column', id: 'native:tags' });
    table.reads[2]!.resolve(rows);
    await Promise.resolve();
    expect(table.model.rows.map(({ id }) => id)).toEqual([1]);
    expect(table.model.rows[0]!.cells[2]).toEqual({
      state: 'value',
      values: ['Systematic, review', 'Trial'],
    });
    table.send({
      type: 'filter-set',
      filter: {
        field: 'native:DOI',
        kind: 'text',
        operator: 'contains',
        value: 'example',
      },
    });
    expect(table.reads[3]!.nativeFields).toEqual(
      new Set(['native:date', 'native:tags', 'native:DOI']),
    );
    table.reads[3]!.resolve(rows);
    await Promise.resolve();

    table.send({ type: 'view-save', replace: false, name: 'Native fields' });
    expect(readLiteratureViews(storage.raw)[0]).toMatchObject({
      columns: ['native:date', 'native:tags'],
      sort: 'native:date',
      direction: 'descending',
    });
    table.dispose();
    const restored = open(library.id, storage);
    restored.send({ type: 'view-open', name: 'Native fields' });
    restored.reads[1]!.resolve(rows);
    await Promise.resolve();
    expect(restored.model.rows.map(({ id }) => id)).toEqual([1]);
    expect(restored.model.viewDirty).toBe(false);
    restored.notify();
    await Promise.resolve();
    restored.reads[2]!.resolve([
      { ...rows[0]!, native: { ...rows[0]!.native, 'native:tags': { tags: ['Trial'] } } },
    ]);
    await Promise.resolve();
    expect(restored.model.rows).toEqual([]);
  });

  it('uses native mapped fields and bulk tags, excludes Extra and internal fields, and keeps Zotero precision', async () => {
    const fields = [
      'title',
      'date',
      'extra',
      'DOI',
      'blogTitle',
      'publicationTitle',
      'path',
      'accessDate',
    ];
    function sdkItem(id: number, rawDate: string, text: string) {
      return {
        id,
        deleted: false,
        isFeedItem: false,
        isRegularItem: () => true,
        dateAdded: '2023-09-29 01:03:04',
        dateModified: '2024-10-02 17:01:58',
        itemTypeID: 1,
        getCreators: () => [
          { firstName: 'Alex', lastName: 'Chen', fieldMode: 0 },
          { firstName: '', lastName: 'Neo Archive', fieldMode: 1 },
        ],
        getTags: vi.fn(() => [
          { tag: 'Case Sensitive', type: 0 },
          { tag: 'with, punctuation', type: 1 },
          { tag: `urn:zotero-neo:chapter-note:v1:${'a'.repeat(32)}` },
        ]),
        getField: vi.fn((name: string, raw?: boolean, map?: boolean) => {
          if (name === 'date') return raw ? rawDate : text;
          if (name === 'title') return `Paper ${id}`;
          if (name === 'publicationTitle' && map) return 'Mapped journal';
          if (name === 'accessDate') return '2025-01-01 00:00:00';
          return '';
        }),
      };
    }
    const papers = [
      sdkItem(1, '2024-00-00 2024', '2024'),
      sdkItem(2, '2024-06-00 2024-06', '2024-06'),
      sdkItem(3, '2024-02-30 2024-02-30', '2024-02-30'),
      sdkItem(4, '2023-00-00 2023–2024', '2023–2024'),
      sdkItem(5, '2024-00-00 Spring 2024', 'Spring 2024'),
      sdkItem(6, '2024-06-12 June 12, 2024', 'June 12, 2024'),
    ];
    const load = vi.fn(() => Promise.resolve());
    const register = vi.fn(() => 'literature-observer');
    const unregister = vi.fn();
    const writes = vi.fn();
    vi.stubGlobal('Zotero', {
      Libraries: { userLibraryID: 1, get: () => ({ libraryType: 'user' }) },
      Items: { getAll: () => Promise.resolve(papers), loadDataTypes: load },
      ItemTypes: {
        getAll: () => [
          { id: 1, name: 'blogPost' },
          { id: 2, name: 'attachment' },
        ],
        getLocalizedString: () => 'Blog post',
      },
      ItemFields: {
        getItemTypeFields: (id: number) => (id === 1 ? [1, 2, 3, 4, 5, 8] : [7]),
        getBaseIDFromTypeAndField: (_type: number, field: number) => (field === 5 ? 6 : false),
        getName: (id: number) => fields[id - 1],
        getLocalizedString: (id: number) => fields[id - 1],
        isCustom: () => false,
        isDate: (id: number) => id === 2,
      },
      Date: {
        isMultipart: (text: string) => /^\d{4}-\d{2}-\d{2} (?!\d{2}:\d{2}:\d{2}$)/u.test(text),
        multipartToSQL: (text: string) => text.slice(0, 10),
        multipartToStr: (text: string) => text.slice(11),
        strToDate: (text: string) =>
          ({
            '2023–2024': { year: '2023', part: '2024' },
            'Spring 2024': { year: '2024', part: 'Spring' },
            'June 12, 2024': { year: '2024', month: 5, day: 12 },
          })[text],
      },
      localeCompare: (a: string, b: string) => a.localeCompare(b),
      Notifier: { registerObserver: register, unregisterObserver: unregister },
    });
    const host = createLiteratureTableHost(
      {} as MainWindow,
      { set: writes } as unknown as PreferenceStore,
      false,
      () => true,
    );
    const catalog = host.nativeFields('en').map(({ id }) => id);
    expect(catalog).toEqual(
      expect.arrayContaining(['native:DOI', 'native:publicationTitle', 'native:accessDate']),
    );
    expect(catalog).not.toContain('native:extra');
    expect(catalog).not.toContain('native:path');
    expect(catalog).not.toContain('native:title');
    const defaultRows = await host.readItems('user', {
      includePDF: false,
      nativeFields: new Set(),
    });
    expect(defaultRows[0]).toEqual({ id: 1, title: 'Paper 1', year: '2024', extra: '' });
    expect(load).toHaveBeenLastCalledWith(papers, ['itemData']);
    expect(papers[0]!.getTags).not.toHaveBeenCalled();
    expect(papers[0]!.getField.mock.calls.map(([field]) => field)).toEqual(['date', 'title']);

    const rows = await host.readItems('user', {
      includePDF: false,
      nativeFields: new Set([
        'native:date',
        'native:dateAdded',
        'native:dateModified',
        'native:tags',
        'native:publicationTitle',
        'native:accessDate',
        'native:itemType',
        'native:creators',
      ]),
    });
    expect(load).toHaveBeenLastCalledWith(
      papers,
      expect.arrayContaining(['tags', 'creators', 'itemData']),
    );
    expect(rows[0]!.native).toMatchObject({
      'native:tags': { tags: ['Case Sensitive', 'with, punctuation'] },
      'native:dateAdded': { text: '2023-09-29 01:03:04', key: '2023-09-29 01:03:04' },
      'native:dateModified': { text: '2024-10-02 17:01:58', key: '2024-10-02 17:01:58' },
      'native:accessDate': { text: '2025-01-01 00:00:00', key: '2025-01-01 00:00:00' },
      'native:publicationTitle': 'Mapped journal',
      'native:itemType': 'Blog post',
      'native:creators': 'Alex Chen; Neo Archive',
    });
    expect(rows.map(({ native }) => native?.['native:date'])).toEqual([
      { text: '2024', key: '2024' },
      { text: '2024-06', key: '2024-06' },
      { text: '2024-02-30', key: null },
      { text: '2023–2024', key: null },
      { text: 'Spring 2024', key: null },
      { text: 'June 12, 2024', key: '2024-06-12' },
    ]);
    expect(rows.map(({ year }) => year)).toEqual(['2024', '2024', '2024', '2023', '2024', '2024']);
    const modified = vi.fn();
    const dispose = host.observe(modified);
    expect(register).toHaveBeenCalledWith(
      { notify: modified },
      expect.arrayContaining(['item', 'item-tag', 'tag']),
      'neo-literature-table',
    );
    dispose();
    expect(unregister).toHaveBeenCalledWith('literature-observer');
    expect(writes).not.toHaveBeenCalled();
  });
});
