import { CleanupFailure, type Cleanup } from '../core/cleanup';
import type { ItemAttributeDefinition } from '../item-attributes/types';
import { mountNativeReactView } from '../platform/native-ui';
import type { NativeReactView } from '../ui/react/types';
import {
  LITERATURE_TABLE_TEXT,
  projectLiteratureRows,
  sortLiteratureItems,
  type LiteratureColumn,
  type LiteratureColumnID,
  type LiteratureLanguage,
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
}

export interface LiteratureTableHost {
  scopes(): readonly LiteratureScope[];
  initialScopeID(): string | undefined;
  readItems(id: string): Promise<readonly LiteratureItem[]>;
  definitions(): readonly ItemAttributeDefinition[];
  observe(change: () => void): Cleanup;
  locate(id: number): Promise<boolean>;
}

const PAGE_SIZE = 50;

class LiteratureTableController {
  readonly #collator: Intl.Collator;
  readonly #shown = new Set<string>();
  #view?: NativeReactView<LiteratureTableModel>;
  #unobserve?: Cleanup;
  #disposed = false;
  #refreshQueued = false;
  #readVersion = 0;
  #scopeVersion = 0;
  #status: LiteratureTableModel['status'] = 'loading';
  #scopes: readonly LiteratureScope[] = [];
  #scope?: LiteratureScope;
  #definitions: readonly ItemAttributeDefinition[] = [];
  #columns: readonly LiteratureColumn[];
  #headings: LiteratureTableModel['columns'];
  #choices: LiteratureTableModel['choices'] = [];
  #sortColumn: LiteratureColumnID = 'title';
  #sortDirection: LiteratureSortDirection = 'ascending';
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
    this.#items = [];
    this.#rows = [];
    const failure = new CleanupFailure();
    if (this.#unobserve) failure.run(this.#unobserve);
    failure.run(() => this.#view?.dispose());
    this.#unobserve = undefined;
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
    this.#items = [];
    this.#rows = [];
    try {
      const scopes = this.host.scopes();
      const definitions = this.host.definitions();
      const preferredID = this.#scope?.id ?? this.host.initialScopeID();
      const scope =
        scopes.find(({ id }) => id === preferredID) ?? (!this.#scope ? scopes[0] : undefined);
      if (!this.#currentRead(version)) return;
      this.#scopes = scopes;
      this.#scope = scope ?? this.#scope;
      this.#definitions = definitions;
      for (const id of this.#shown) {
        if (!definitions.some((definition) => definition.id === id)) this.#shown.delete(id);
      }
      this.#updateColumns();
      if (!scope) {
        this.#status = 'unavailable';
        this.#publish();
        return;
      }
      this.#publish();
      const items = await this.host.readItems(scope.id);
      if (!this.#currentRead(version)) return;
      this.#items = items;
      this.#orderItems();
      this.#status = 'ready';
    } catch (error) {
      if (!this.#currentRead(version)) return;
      this.#status = 'error';
      this.#items = [];
      this.#rows = [];
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
    this.#choices = this.#definitions.map((definition) => {
      const { id, key } = definition;
      const name = definition.label;
      const label = (labelCounts.get(name) ?? 0) > 1 ? `${name} (${key})` : name;
      const shown = this.#shown.has(id);
      if (shown) columns.push({ id: `attribute:${id}`, label, definition });
      return { id, label, shown };
    });
    this.#columns = columns;
    this.#headings = columns.map(({ id, label }) => ({ id, label }));
    if (!columns.some(({ id }) => id === this.#sortColumn)) {
      this.#sortColumn = 'title';
      this.#sortDirection = 'ascending';
      this.#page = 0;
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
        if (!this.#definitions.some(({ id }) => id === command.id)) return;
        if (!this.#shown.delete(command.id)) this.#shown.add(command.id);
        const sortColumn = this.#sortColumn;
        this.#updateColumns();
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
