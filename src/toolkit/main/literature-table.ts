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
import { LITERATURE_VIEWS_PREFERENCE } from '../../literature-table/views';
import {
  activateMainWindow,
  mainLibrarySelection,
  mainScopeSelectedRows,
  mainSelectedCollection,
} from './host';

type TableWindow = MainWindow & {
  readonly ZoteroPane?: Pick<_ZoteroTypes.ZoteroPane, 'getSelectedLibraryID'>;
};

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
  return {
    scopes,
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
    async readItems(scope, includePDF): Promise<readonly LiteratureItem[]> {
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
      await Zotero.Items.loadDataTypes(candidates, ['itemData']);
      if (!isCurrent()) return [];
      const parents = includePDF && candidates.length ? await pdfParents(candidates) : null;
      if (!isCurrent()) return [];
      return candidates.filter(ordinary).map((item) => ({
        id: item.id,
        title: item.getField('title', false, true),
        year: item.getField('date', false, true).match(/\b\d{4}\b/u)?.[0] ?? '',
        extra: attributesEnabled ? item.getField('extra') : '',
        ...(includePDF ? { hasPDF: parents?.has(item.id) ?? false } : {}),
      }));
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
          ['item', 'collection', 'collection-item', 'group'],
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
