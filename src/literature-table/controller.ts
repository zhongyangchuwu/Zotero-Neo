import { CleanupFailure, type Cleanup } from '../core/cleanup';
import type { ItemAttributeDefinition } from '../item-attributes/types';
import { compileLiteratureFilters, validLiteratureFilter } from './filters';
import { cleanLiteratureViewName, readLiteratureViews, writeLiteratureViews } from './view-storage';
import {
  MAX_LITERATURE_FILTERS,
  type LiteratureFilter,
  type LiteratureFilterField,
  type LiteratureFilterFieldID,
  type LiteratureFilterKind,
  type LiteratureViewMessage,
  type SavedLiteratureView,
} from './views';
import { mountNativeReactView } from '../platform/native-ui';
import type { NativeReactView } from '../ui/react/types';
import {
  LITERATURE_TABLE_TEXT,
  isLiteratureNativeFieldID,
  projectLiteratureRows,
  sortLiteratureItems,
  type LiteratureColumn,
  type LiteratureColumnID,
  type LiteratureLanguage,
  type LiteratureNativeField,
  type LiteratureNativeFieldID,
  type LiteratureNativeValue,
  type LiteratureRow,
  type LiteratureSortDirection,
  type LiteratureTableCommand,
  type LiteratureTableModel,
} from './model';

export interface LiteratureScope {
  readonly id: string;
  readonly label: string;
}

export interface LiteratureItem {
  readonly id: number;
  readonly title: string;
  readonly year: string;
  readonly extra: string;
  readonly hasPDF?: boolean;
  readonly native?: Readonly<Partial<Record<LiteratureNativeFieldID, LiteratureNativeValue>>>;
}

export interface LiteratureReadOptions {
  readonly includePDF: boolean;
  readonly nativeFields: ReadonlySet<LiteratureNativeFieldID>;
}

export interface LiteratureTableHost {
  scopes(): readonly LiteratureScope[];
  initialScopeID(): string | undefined;
  readItems(id: string, options: LiteratureReadOptions): Promise<readonly LiteratureItem[]>;
  nativeFields(language: LiteratureLanguage): readonly LiteratureNativeField[];
  definitions(): readonly ItemAttributeDefinition[];
  observe(change: () => void): Cleanup;
  locate(id: number): Promise<boolean>;
  readViews(): string;
  writeViews(raw: string): void;
  observeViews(change: () => void): Cleanup;
}

const PAGE_SIZE = 50;

function sameView(
  left: SavedLiteratureView,
  right: SavedLiteratureView | null | undefined,
): boolean {
  return (
    !!right &&
    left.name === right.name &&
    left.scope.id === right.scope.id &&
    left.sort === right.sort &&
    left.direction === right.direction &&
    left.columns.length === right.columns.length &&
    left.columns.every((column, index) => column === right.columns[index]) &&
    sameFilters(left.filters, right.filters)
  );
}

function sameFilters(
  left: readonly LiteratureFilter[],
  right: readonly LiteratureFilter[],
): boolean {
  return (
    left.length === right.length &&
    left.every(({ field, kind, operator, value }, index) => {
      const other = right[index];
      return (
        other?.field === field &&
        other.kind === kind &&
        other.operator === operator &&
        other.value === value
      );
    })
  );
}

class LiteratureTableController {
  readonly #collator: Intl.Collator;
  readonly #shown = new Set<string>();
  #view?: NativeReactView<LiteratureTableModel>;
  #unobserve?: Cleanup;
  #unobserveViews?: Cleanup;
  #disposed = false;
  #refreshQueued = false;
  #readVersion = 0;
  #scopeVersion = 0;
  #status: LiteratureTableModel['status'] = 'loading';
  #scopes: readonly LiteratureScope[] = [];
  #scope?: LiteratureScope;
  #definitions: readonly ItemAttributeDefinition[] = [];
  #nativeFields: readonly LiteratureNativeField[] = [];
  #columns: readonly LiteratureColumn[];
  #headings: LiteratureTableModel['columns'];
  #choices: LiteratureTableModel['choices'] = [];
  #sortColumn: LiteratureColumnID = 'title';
  #sortDirection: LiteratureSortDirection = 'ascending';
  #source: readonly LiteratureItem[] = [];
  #requested?: LiteratureReadOptions;
  #filterFields: readonly LiteratureFilterField[] = [];
  #fieldTypes = new Map<
    LiteratureFilterFieldID,
    {
      readonly kind: LiteratureFilterKind;
      readonly key?: string;
      readonly definition?: ItemAttributeDefinition;
    }
  >();
  #filters: readonly LiteratureFilter[] = [];
  #predicate: ((item: LiteratureItem) => boolean) | null = null;
  #layoutUnavailable = false;
  #savedViews: readonly SavedLiteratureView[] = [];
  #activeView: SavedLiteratureView | null = null;
  #viewStorageValid = true;
  #viewMessage: LiteratureViewMessage | null = null;
  #items: readonly LiteratureItem[] = [];
  #rows: readonly LiteratureRow[] = [];
  #page = 0;
  #locating = false;
  #locateFailed = false;

  constructor(
    readonly host: LiteratureTableHost,
    readonly language: LiteratureLanguage,
    readonly reportError: (error: unknown) => void,
  ) {
    this.#collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
    const text = LITERATURE_TABLE_TEXT[language];
    this.#columns = this.#headings = [
      { id: 'title', label: text.title },
      { id: 'year', label: text.year },
    ];
  }

  mount(root: HTMLElement): Cleanup {
    const text = LITERATURE_TABLE_TEXT[this.language];
    this.#view = mountNativeReactView<LiteratureTableModel, LiteratureTableCommand>({
      surface: 'literature-table',
      root,
      model: this.#model(),
      isCurrent: () => !this.#disposed,
      loadingText: text.loading,
      errorText: text.mountError,
      onError: this.reportError,
      dispatch: (command) => this.#dispatch(command),
    });
    try {
      this.#unobserve = this.host.observe(() => this.#queueRefresh());
      this.#unobserveViews = this.host.observeViews(() => {
        this.#loadViews();
        this.#publish();
      });
      this.#loadViews();
    } catch (error) {
      this.#dispose();
      throw error;
    }
    void this.#refresh();
    return () => this.#dispose();
  }

  #dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#refreshQueued = false;
    this.#source = [];
    this.#items = [];
    this.#rows = [];
    const failure = new CleanupFailure();
    if (this.#unobserve) failure.run(this.#unobserve);
    if (this.#unobserveViews) failure.run(this.#unobserveViews);
    failure.run(() => this.#view?.dispose());
    this.#unobserve = undefined;
    this.#unobserveViews = undefined;
    this.#view = undefined;
    failure.rethrow();
  }

  #model(): LiteratureTableModel {
    return {
      language: this.language,
      scopes: this.#scopes,
      scope: this.#scope,
      status: this.#status,
      columns: this.#headings,
      choices: this.#choices,
      sortColumn: this.#sortColumn,
      sortDirection: this.#sortDirection,
      rows: this.#rows,
      total: this.#items.length,
      page: this.#page + 1,
      pageCount: this.#pageCount(),
      locating: this.#locating,
      locateFailed: this.#locateFailed,
      filterFields: this.#filterFields,
      filters: this.#filters,
      filterUnavailable: this.#filters.length > 0 && !this.#predicate,
      layoutUnavailable: this.#layoutUnavailable,
      scopeTotal: this.#source.length,
      viewNames: this.#savedViews.map(({ name }) => name),
      activeViewName: this.#activeView?.name ?? null,
      viewDirty: this.#viewDirty(),
      viewCanSave:
        this.#viewStorageValid &&
        this.#status === 'ready' &&
        (!this.#filters.length || !!this.#predicate),
      viewMessage: this.#viewMessage,
    };
  }

  #publish(): void {
    this.#view?.update(this.#model());
  }

  #pageCount(): number {
    return Math.max(1, Math.ceil(this.#items.length / PAGE_SIZE));
  }

  #queueRefresh(): void {
    if (this.#disposed || this.#refreshQueued) return;
    // Retire an in-flight read at notification time, not when the batch runs.
    ++this.#readVersion;
    this.#refreshQueued = true;
    // Promise jobs are available in Zotero's bootstrap global; queueMicrotask is not.
    void Promise.resolve().then(() => {
      if (this.#refreshQueued) return this.#refresh();
      return undefined;
    });
  }

  async #refresh(): Promise<void> {
    this.#refreshQueued = false;
    const version = ++this.#readVersion;
    this.#status = 'loading';
    this.#source = [];
    this.#requested = undefined;
    this.#items = [];
    this.#rows = [];
    try {
      const scopes = this.host.scopes();
      const definitions = this.host.definitions();
      const nativeFields = this.host.nativeFields(this.language);
      const preferredID = this.#scope?.id ?? this.host.initialScopeID();
      const scope =
        scopes.find(({ id }) => id === preferredID) ?? (!this.#scope ? scopes[0] : undefined);
      if (!this.#currentRead(version)) return;
      this.#scopes = scopes;
      this.#scope = scope ?? this.#scope;
      this.#definitions = definitions;
      this.#nativeFields = nativeFields;
      for (const id of this.#shown) {
        if (
          nativeFields.some((field) => field.id === id) ||
          definitions.some((definition) => definition.id === id)
        )
          continue;
        this.#shown.delete(id);
        if (this.#activeView) this.#layoutUnavailable = true;
      }
      this.#updateColumns();
      this.#updateFilterFields();
      if (!scope) {
        this.#status = 'unavailable';
        this.#publish();
        return;
      }
      const options = this.#readOptions();
      this.#requested = options;
      this.#publish();
      const items = await this.host.readItems(scope.id, options);
      if (!this.#currentRead(version)) return;
      this.#source = items;
      this.#status = 'ready';
      this.#applyFilters();
    } catch (error) {
      if (!this.#currentRead(version)) return;
      this.#status = 'error';
      this.#items = [];
      this.#rows = [];
      this.#source = [];
      this.reportError(error);
    }
    this.#publish();
  }

  #currentRead(version: number): boolean {
    return !this.#disposed && this.#readVersion === version;
  }

  #updateColumns(): void {
    const columns = this.#columns.slice(0, 2);
    const labelCounts = new Map<string, number>();
    for (const { label } of this.#definitions)
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    const choices: Array<LiteratureTableModel['choices'][number]> = this.#definitions.map(
      (definition) => {
        const { id, key } = definition;
        const name = definition.label;
        const label = (labelCounts.get(name) ?? 0) > 1 ? `${name} (${key})` : name;
        const shown = this.#shown.has(id);
        const columnID: LiteratureColumnID = `attribute:${id}`;
        if (shown) columns.push({ id: columnID, label, definition });
        return { id, columnID, label, shown };
      },
    );
    for (const field of this.#nativeFields) {
      const { id, label } = field;
      const shown = this.#shown.has(id);
      if (shown) columns.push(field);
      choices.push({ id, columnID: id, label, shown });
    }
    this.#choices = choices;
    this.#columns = columns;
    this.#headings = columns.map(({ id, label }) => ({ id, label }));
    if (!columns.some(({ id }) => id === this.#sortColumn)) {
      if (this.#activeView) this.#layoutUnavailable = true;
      this.#sortColumn = 'title';
      this.#sortDirection = 'ascending';
      this.#page = 0;
    }
  }

  #updateFilterFields(): void {
    const text = LITERATURE_TABLE_TEXT[this.language];
    const fields: LiteratureFilterField[] = [
      { id: 'title', kind: 'text', label: text.title },
      { id: 'year', kind: 'number', label: text.year },
      { id: 'pdf', kind: 'pdf', label: this.language === 'zh-CN' ? 'PDF 附件' : 'PDF attachment' },
      ...this.#nativeFields,
    ];
    this.#fieldTypes = new Map(fields.map(({ id, kind }) => [id, { kind }]));
    for (const [index, definition] of this.#definitions.entries()) {
      const id = `attribute:${definition.id}` as const;
      this.#fieldTypes.set(id, { kind: definition.type, key: definition.key, definition });
      fields.push({
        id,
        kind: definition.type,
        label: this.#choices[index]!.label,
        options: definition.options,
      });
    }
    this.#filterFields = fields;
    this.#compileFilters();
  }

  #compileFilters(): void {
    this.#predicate = this.#filters.length
      ? compileLiteratureFilters(this.#filters, this.#fieldTypes)
      : null;
  }

  #readOptions(): LiteratureReadOptions {
    const nativeFields = new Set<LiteratureNativeFieldID>();
    for (const { id } of this.#columns) if (isLiteratureNativeFieldID(id)) nativeFields.add(id);
    let includePDF = false;
    if (this.#predicate) {
      for (const { field } of this.#filters) {
        if (field === 'pdf') includePDF = true;
        else if (isLiteratureNativeFieldID(field)) nativeFields.add(field);
      }
    }
    return { includePDF, nativeFields };
  }

  #needsRead(): boolean {
    const requested = this.#requested;
    if (!requested) return false;
    const active = this.#readOptions();
    if (active.includePDF && !requested.includePDF) return true;
    for (const id of active.nativeFields) if (!requested.nativeFields.has(id)) return true;
    return false;
  }

  #applyFilters(): void {
    this.#items = !this.#filters.length
      ? this.#source
      : this.#predicate
        ? this.#source.filter(this.#predicate)
        : [];
    this.#orderItems();
  }

  #filtersChanged(): void {
    this.#page = 0;
    this.#compileFilters();
    if (this.#needsRead() || this.#status === 'error') {
      void this.#refresh();
      return;
    }
    if (this.#status === 'ready') this.#applyFilters();
    this.#publish();
  }

  #loadViews(): void {
    try {
      this.#savedViews = readLiteratureViews(this.host.readViews());
      if (!this.#viewStorageValid) this.#viewMessage = null;
      this.#viewStorageValid = true;
    } catch (error) {
      this.#savedViews = [];
      this.#viewStorageValid = false;
      this.#viewMessage = 'storage-error';
      this.reportError(error);
    }
  }

  #viewDirty(): boolean {
    const view = this.#activeView;
    return (
      !!view &&
      (view.scope.id !== this.#scope?.id ||
        view.sort !== this.#sortColumn ||
        view.direction !== this.#sortDirection ||
        view.columns.length !== this.#shown.size ||
        view.columns.some((id) => !this.#shown.has(id)) ||
        !sameFilters(view.filters, this.#filters))
    );
  }

  #snapshot(name: string): SavedLiteratureView | null {
    if (!this.#scope) return null;
    return {
      name,
      scope: this.#scope,
      columns: [...this.#shown].sort(),
      sort: this.#sortColumn,
      direction: this.#sortDirection,
      filters: this.#filters,
    };
  }

  #openView(name: string | null): void {
    this.#loadViews();
    const saved = name === null ? null : this.#savedViews.find((view) => view.name === name);
    if (saved === undefined) {
      if (this.#viewStorageValid) this.#viewMessage = 'conflict';
      this.#publish();
      return;
    }
    if (this.#viewStorageValid) this.#viewMessage = null;
    this.#activeView = saved;
    this.#scope = saved?.scope;
    this.#shown.clear();
    for (const id of saved?.columns ?? []) this.#shown.add(id);
    this.#sortColumn = saved?.sort ?? 'title';
    this.#sortDirection = saved?.direction ?? 'ascending';
    this.#filters = saved?.filters ?? [];
    this.#layoutUnavailable = false;
    this.#locateFailed = false;
    this.#page = 0;
    ++this.#scopeVersion;
    void this.#refresh();
  }

  #changeSavedView(change: { name: string; replace: boolean } | null): void {
    try {
      const latest = readLiteratureViews(this.host.readViews());
      this.#savedViews = latest;
      const active = this.#activeView;
      const replacing = change === null || change.replace;
      const index = active ? latest.findIndex((view) => view.name === active.name) : -1;
      if (replacing && (!active || !sameView(active, latest[index]))) {
        this.#viewMessage = 'conflict';
        return;
      }
      const next = [...latest];
      if (change === null) {
        next.splice(index, 1);
        this.host.writeViews(writeLiteratureViews(next));
        this.#activeView = null;
        this.#viewMessage = 'deleted';
      } else {
        const name = cleanLiteratureViewName(change.name);
        const saved = name && this.#snapshot(name);
        if (!saved || this.#status !== 'ready' || (this.#filters.length && !this.#predicate))
          return;
        const identity = saved.name.toLowerCase().normalize('NFC');
        const duplicate = latest.findIndex(
          (view) => view.name.toLowerCase().normalize('NFC') === identity,
        );
        if (duplicate !== -1 && (!replacing || duplicate !== index)) {
          this.#viewMessage = 'duplicate';
          return;
        }
        if (replacing) next[index] = saved;
        else next.push(saved);
        this.host.writeViews(writeLiteratureViews(next));
        this.#activeView = saved;
        this.#layoutUnavailable = false;
        this.#viewMessage = 'saved';
      }
      this.#savedViews = next;
    } catch (error) {
      this.#viewMessage = 'storage-error';
      this.reportError(error);
    } finally {
      this.#publish();
    }
  }

  #orderItems(): void {
    const column = this.#columns.find(({ id }) => id === this.#sortColumn)!;
    this.#items = sortLiteratureItems(this.#items, column, this.#sortDirection, this.#collator);
    this.#projectPage();
  }

  #projectPage(): void {
    this.#page = Math.min(this.#page, this.#pageCount() - 1);
    const start = this.#page * PAGE_SIZE;
    this.#rows = projectLiteratureRows(this.#items.slice(start, start + PAGE_SIZE), this.#columns);
  }

  #dispatch(command: LiteratureTableCommand): void {
    if (this.#disposed) return;
    switch (command.type) {
      case 'scope': {
        const scope = this.#scopes.find(({ id }) => id === command.id);
        if (!scope || this.#scope?.id === scope.id) return;
        this.#scope = scope;
        ++this.#scopeVersion;
        this.#locateFailed = false;
        this.#page = 0;
        void this.#refresh();
        break;
      }
      case 'retry':
        if (this.#status === 'error' || this.#status === 'unavailable') void this.#refresh();
        break;
      case 'column': {
        const choice = this.#choices.find(({ id }) => id === command.id);
        if (!choice) return;
        if (!this.#shown.delete(command.id)) this.#shown.add(command.id);
        const sortColumn = this.#sortColumn;
        // Hiding the sorted column is an intentional layout change.
        if (sortColumn === choice.columnID && !this.#shown.has(command.id)) {
          this.#sortColumn = 'title';
          this.#sortDirection = 'ascending';
          this.#page = 0;
        }
        this.#updateColumns();
        if (this.#needsRead()) {
          void this.#refresh();
          break;
        }
        if (this.#status === 'ready') {
          if (this.#sortColumn !== sortColumn) this.#orderItems();
          else this.#projectPage();
        }
        this.#publish();
        break;
      }
      case 'sort':
        if (!this.#columns.some(({ id }) => id === command.id)) return;
        this.#sortDirection =
          this.#sortColumn === command.id && this.#sortDirection === 'ascending'
            ? 'descending'
            : 'ascending';
        this.#sortColumn = command.id;
        this.#page = 0;
        if (this.#status === 'ready') this.#orderItems();
        this.#publish();
        break;
      case 'page': {
        if (this.#status !== 'ready') return;
        const page = this.#page + command.delta;
        if (page < 0 || page >= this.#pageCount()) return;
        this.#page = page;
        this.#projectPage();
        this.#publish();
        break;
      }
      case 'locate':
        if (
          !this.#locating &&
          this.#status === 'ready' &&
          this.#rows.some(({ id }) => id === command.id)
        ) {
          void this.#locate(command.id);
        }
        break;
      case 'filter-set': {
        const { index, filter } = command;
        const field = this.#fieldTypes.get(filter.field);
        if (!field || !validLiteratureFilter(filter, field.kind, field.definition?.options)) return;
        const next = [...this.#filters];
        const normalized = {
          ...filter,
          value: filter.kind === 'tags' ? filter.value : filter.value.trim(),
        };
        if (index === undefined) {
          if (next.length >= MAX_LITERATURE_FILTERS) return;
          next.push(normalized);
        } else {
          if (!Number.isInteger(index) || !next[index]) return;
          next[index] = normalized;
        }
        this.#filters = next;
        this.#filtersChanged();
        break;
      }
      case 'filter-remove':
        if (!Number.isInteger(command.index) || !this.#filters[command.index]) return;
        this.#filters = this.#filters.filter((_, index) => index !== command.index);
        this.#filtersChanged();
        break;
      case 'view-open':
        this.#openView(command.name);
        break;
      case 'view-save':
        this.#changeSavedView(command);
        break;
      case 'view-delete':
        this.#changeSavedView(null);
        break;
    }
  }

  async #locate(id: number): Promise<void> {
    const scopeVersion = this.#scopeVersion;
    this.#locating = true;
    this.#locateFailed = false;
    this.#publish();
    let found = false;
    try {
      found = await this.host.locate(id);
    } catch (error) {
      if (!this.#disposed) this.reportError(error);
    } finally {
      if (!this.#disposed) {
        this.#locating = false;
        this.#locateFailed = !found && scopeVersion === this.#scopeVersion;
        this.#publish();
      }
    }
  }
}

export function mountLiteratureTable(
  root: HTMLElement,
  host: LiteratureTableHost,
  language: 'en' | 'zh-CN',
  reportError: (error: unknown) => void,
): Cleanup {
  return new LiteratureTableController(host, language, reportError).mount(root);
}
