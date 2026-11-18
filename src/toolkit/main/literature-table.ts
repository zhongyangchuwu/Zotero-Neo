import { CleanupScope } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { PreferenceStore } from '../../core/preference-store';
import { parseItemAttributeDefinitions } from '../../item-attributes/store';
import { ITEM_ATTRIBUTE_PREFERENCE } from '../../item-attributes/types';
import type {
  LiteratureItem,
  LiteratureScope,
  LiteratureTableHost,
} from '../../literature-table/controller';
import {
  LITERATURE_TABLE_TEXT,
  isLiteratureNativeFieldID,
  literatureDateKey,
  type LiteratureDateValue,
  type LiteratureNativeField,
  type LiteratureNativeFieldID,
  type LiteratureNativeValue,
} from '../../literature-table/model';
import { LITERATURE_VIEWS_PREFERENCE } from '../../literature-table/views';
import { isSourceNoteIdentity } from '../../platform/note-relations';
import {
  activateMainWindow,
  mainLibrarySelection,
  mainScopeSelectedRows,
  mainSelectedCollection,
} from './host';

type TableWindow = MainWindow & {
  readonly ZoteroPane?: Pick<_ZoteroTypes.ZoteroPane, 'getSelectedLibraryID'>;
};

type BibliographicRegistry = {
  getItemTypeFields(typeID: number): number[];
  getBaseIDFromTypeAndField(typeID: number, fieldID: number): number | false;
  getName(fieldID: number): string | false;
  getLocalizedString(fieldID: number): string;
  isCustom(fieldID: number): boolean;
  isDate(fieldID: number): boolean;
};

/** Use Zotero's regular-item schema, not all properties of an Item or its serialized JSON. */
function bibliographicFields(): LiteratureNativeField[] {
  const registry: BibliographicRegistry = Zotero.ItemFields;
  const ids = new Set<number>();
  for (const { id, name, custom } of Zotero.ItemTypes.getAll()) {
    if (custom || name === 'attachment' || name === 'note' || name === 'annotation') continue;
    for (const fieldID of registry.getItemTypeFields(id)) {
      ids.add(fieldID);
      const baseID = registry.getBaseIDFromTypeAndField(id, fieldID);
      if (baseID) ids.add(baseID);
    }
  }
  const fields: LiteratureNativeField[] = [];
  const seen = new Set([
    'title',
    'date',
    'extra',
    'tags',
    'creators',
    'itemType',
    'dateAdded',
    'dateModified',
  ]);
  for (const fieldID of ids) {
    const name = registry.getName(fieldID);
    if (!name || seen.has(name) || registry.isCustom(fieldID)) continue;
    const id = `native:${name}`;
    if (!isLiteratureNativeFieldID(id)) continue;
    seen.add(name);
    fields.push({
      id,
      kind: registry.isDate(fieldID) || name === 'accessDate' ? 'date' : 'text',
      label: registry.getLocalizedString(fieldID) || name,
    });
  }
  return fields.sort((a, b) => Zotero.localeCompare(a.label, b.label));
}

function sqlDateKey(text: string): string | null {
  if (/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(text))
    return literatureDateKey(text.slice(0, 10)) ? text : null;
  return literatureDateKey(text);
}

/** Zotero stores dates as SQL datetime or as a sort prefix plus the user's original text. */
function dateValue(raw: string): LiteratureDateValue {
  if (!Zotero.Date.isMultipart(raw)) return { text: raw, key: sqlDateKey(raw.trim()) };
  const text = Zotero.Date.multipartToStr(raw);
  const literal = text.trim();
  // A malformed ISO-like date can be swapped/normalized by the legacy Zotero parser.
  if (/^\d{4}(?:-\d{2}){0,2}$/u.test(literal)) return { text, key: literatureDateKey(literal) };
  const sql = Zotero.Date.multipartToSQL(raw);
  const key = literatureDateKey(
    sql.endsWith('-00-00') ? sql.slice(0, 4) : sql.endsWith('-00') ? sql.slice(0, 7) : sql,
  );
  if (key === null || /[?~%]/u.test(literal)) return { text, key: null };
  // The prefix alone is not enough: the host also indexes some ranges, seasons and free text.
  const { year, month, day, part } = Zotero.Date.strToDate(literal);
  const full =
    (year ?? '').padStart(4, '0') +
    (month === undefined ? '' : `-${String(month + 1).padStart(2, '0')}`) +
    (day ? `-${String(day).padStart(2, '0')}` : '');
  return { text, key: !part && key === full ? key : null };
}

function literatureLibrary(id: number) {
  const library = Zotero.Libraries.get(id);
  return library && (library.libraryType === 'user' || library.libraryType === 'group')
    ? library
    : null;
}

function libraryScopeID(library: NonNullable<ReturnType<typeof literatureLibrary>>): string {
  return library.libraryType === 'user' ? 'user' : `group:${library.libraryTypeID}`;
}

/** Use Zotero's stored/linked PDF classification, never local file checks. */
async function pdfParents(items: Zotero.Item[]): Promise<Set<number>> {
  await Zotero.Items.loadDataTypes(items, ['childItems']);
  const attachmentIDs: number[] = [];
  for (const item of items) {
    for (const id of item.getAttachments(false)) attachmentIDs.push(id);
  }
  const parents = new Set<number>();
  if (attachmentIDs.length) {
    for (const attachment of await Zotero.Items.getAsync(attachmentIDs)) {
      if (!attachment.deleted && attachment.parentID && attachment.isPDFAttachment())
        parents.add(attachment.parentID);
    }
  }
  return parents;
}

function ordinary(item: Zotero.Item): boolean {
  return item.isRegularItem() && !item.deleted && !item.isFeedItem;
}

function scopes(): LiteratureScope[] {
  const options: LiteratureScope[] = [];
  for (const library of Zotero.Libraries.getAll()) {
    if (library.libraryType !== 'user' && library.libraryType !== 'group') continue;
    const name = Zotero.Libraries.getName(library.libraryID);
    const scopeID = libraryScopeID(library);
    options.push({ id: scopeID, label: name });
    const collections = Zotero.Collections.getByLibrary(library.libraryID, true).filter(
      (collection) => !collection.deleted,
    );
    const byID = new Map(collections.map((collection) => [collection.id, collection] as const));
    for (const collection of collections) {
      const path = [collection.name];
      for (
        let parent = byID.get(collection.parentID);
        parent && path.length <= collections.length;
        parent = byID.get(parent.parentID)
      )
        path.push(parent.name);
      options.push({
        id: `${scopeID}/${collection.key}`,
        label: `${name} / ${path.reverse().join(' / ')}`,
      });
    }
  }
  return options;
}

/** Read native metadata in batches; this does not use or change the Main view filters. */
export function createLiteratureTableHost(
  window: MainWindow,
  preferences: PreferenceStore,
  attributesEnabled: boolean,
  isCurrent: () => boolean,
): LiteratureTableHost {
  let definitionsRaw: string | undefined;
  let definitions: ReturnType<typeof parseItemAttributeDefinitions> = [];
  let bibliography: readonly LiteratureNativeField[] | undefined;
  return {
    scopes,
    nativeFields(language) {
      const text = LITERATURE_TABLE_TEXT[language];
      return [
        { id: 'native:tags', kind: 'tags', label: text.tags },
        { id: 'native:creators', kind: 'text', label: text.creators },
        { id: 'native:itemType', kind: 'text', label: text.itemType },
        { id: 'native:date', kind: 'date', label: text.publicationDate },
        { id: 'native:dateAdded', kind: 'date', label: text.dateAdded },
        { id: 'native:dateModified', kind: 'date', label: text.dateModified },
        ...(bibliography ??= bibliographicFields()),
      ];
    },
    initialScopeID: () => {
      const collection =
        mainScopeSelectedRows(window).length === 1 ? mainSelectedCollection(window) : undefined;
      const collectionLibrary =
        collection && !collection.deleted ? literatureLibrary(collection.libraryID) : null;
      if (collection && collectionLibrary)
        return `${libraryScopeID(collectionLibrary)}/${collection.key}`;
      const libraryID = (window as TableWindow).ZoteroPane?.getSelectedLibraryID();
      const library = libraryID ? literatureLibrary(libraryID) : null;
      return library ? libraryScopeID(library) : 'user';
    },
    async readItems(scope, { includePDF, nativeFields }): Promise<readonly LiteratureItem[]> {
      const [owner, key] = scope.split('/');
      const group = owner?.startsWith('group:') ? Number(owner.slice(6)) : undefined;
      const id =
        owner === 'user'
          ? Zotero.Libraries.userLibraryID
          : group && Zotero.Groups.getLibraryIDFromGroupID(group);
      if (!id || !literatureLibrary(id))
        throw new Error('Literature library is no longer available');
      if (!isCurrent()) return [];
      let items: Zotero.Item[];
      if (key) {
        const collection = await Zotero.Collections.getByLibraryAndKeyAsync(id, key);
        if (!collection || collection.deleted)
          throw new Error('Literature collection is no longer available');
        if (!isCurrent()) return [];
        await collection.loadDataType('childItems');
        items = collection.getChildItems(false, false) || [];
      } else {
        items = await Zotero.Items.getAll(id, true, false);
      }
      if (!isCurrent()) return [];
      const candidates = items.filter(ordinary);
      const includeTags = nativeFields.has('native:tags');
      const includeCreators = nativeFields.has('native:creators');
      const dataTypes: ('tags' | 'creators' | 'itemData')[] = ['itemData'];
      if (includeTags) dataTypes.push('tags');
      if (includeCreators) dataTypes.push('creators');
      await Zotero.Items.loadDataTypes(candidates, dataTypes);
      if (!isCurrent()) return [];
      const parents = includePDF && candidates.length ? await pdfParents(candidates) : null;
      if (!isCurrent()) return [];
      const activeBibliography = nativeFields.size
        ? (bibliography ??= bibliographicFields())
            .filter(({ id }) => nativeFields.has(id))
            .map(({ id, kind }) => ({ id, kind, name: id.slice('native:'.length) }))
        : [];
      const includePublicationDate = nativeFields.has('native:date');
      const includeItemType = nativeFields.has('native:itemType');
      const includeDateAdded = nativeFields.has('native:dateAdded');
      const includeDateModified = nativeFields.has('native:dateModified');
      const includeNative = nativeFields.size > 0;
      return candidates.filter(ordinary).map((item) => {
        const rawDate = item.getField('date', includePublicationDate, true);
        const publicationDate = includePublicationDate && rawDate ? dateValue(rawDate) : undefined;
        const native: Partial<Record<LiteratureNativeFieldID, LiteratureNativeValue>> | undefined =
          includeNative ? {} : undefined;
        if (native) {
          if (publicationDate?.text.trim()) native['native:date'] = publicationDate;
          if (includeDateAdded && item.dateAdded)
            native['native:dateAdded'] = dateValue(item.dateAdded);
          if (includeDateModified && item.dateModified)
            native['native:dateModified'] = dateValue(item.dateModified);
          if (includeTags) {
            const tags: string[] = [];
            for (const { tag } of item.getTags()) if (!isSourceNoteIdentity(tag)) tags.push(tag);
            if (tags.length) native['native:tags'] = { tags };
          }
          if (includeCreators) {
            const creators = item
              .getCreators()
              .map(({ firstName, lastName, fieldMode }) =>
                fieldMode === 1 || !firstName ? lastName : `${firstName} ${lastName}`.trim(),
              )
              .filter(Boolean)
              .join('; ');
            if (creators) native['native:creators'] = creators;
          }
          if (includeItemType)
            native['native:itemType'] = Zotero.ItemTypes.getLocalizedString(item.itemTypeID);
          for (const { id, kind, name } of activeBibliography) {
            const value = item.getField(name, kind === 'date', true);
            if (value) native[id] = kind === 'date' ? dateValue(value) : value;
          }
        }
        return {
          id: item.id,
          title: item.getField('title', false, true),
          year: (publicationDate?.text ?? rawDate).match(/\b\d{4}\b/u)?.[0] ?? '',
          extra: attributesEnabled ? item.getField('extra') : '',
          ...(includePDF ? { hasPDF: parents?.has(item.id) ?? false } : {}),
          ...(native ? { native } : {}),
        };
      });
    },
    definitions() {
      if (!attributesEnabled) return definitions;
      const raw = preferences.get(ITEM_ATTRIBUTE_PREFERENCE, '');
      if (raw !== definitionsRaw) {
        definitions = parseItemAttributeDefinitions(raw);
        definitionsRaw = raw;
      }
      return definitions;
    },
    observe(change) {
      const cleanup = new CleanupScope();
      try {
        const id = Zotero.Notifier.registerObserver(
          { notify: change },
          ['item', 'item-tag', 'tag', 'collection', 'collection-item', 'group'],
          'neo-literature-table',
        );
        cleanup.add(() => Zotero.Notifier.unregisterObserver(id));
        const unobserve = attributesEnabled
          ? preferences.observe?.(ITEM_ATTRIBUTE_PREFERENCE, change)
          : undefined;
        if (unobserve) cleanup.add(unobserve);
        return () => cleanup.dispose();
      } catch (error) {
        cleanup.dispose();
        throw error;
      }
    },
    async locate(id) {
      if (!isCurrent()) return false;
      const item = Zotero.Items.get(id);
      const selection = mainLibrarySelection(window);
      if (!item || !ordinary(item) || !selection?.selectItem) return false;
      if ((await selection.selectItem(id)) === false || !isCurrent()) return false;
      activateMainWindow(window);
      return true;
    },
    readViews: () => preferences.get(LITERATURE_VIEWS_PREFERENCE, ''),
    writeViews: (raw) => preferences.set(LITERATURE_VIEWS_PREFERENCE, raw),
    observeViews: (change) =>
      preferences.observe?.(LITERATURE_VIEWS_PREFERENCE, change) ?? (() => {}),
  };
}
