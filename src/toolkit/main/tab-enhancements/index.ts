import type { MainWindow } from '../../../core/contracts';
import { citationKey } from '../../../platform/better-bibtex';
import type {
  TabDocumentRef,
  TabEnhancementHost,
  TabTitleFields,
  TabViewSnapshot,
} from '../tab-enhancements-types';
import { mountRail } from './layout';

type NativeTab = { id: string; type: string; title?: string; data: Record<string, unknown> };
type NativeTabs = {
  _tabs: NativeTab[];
  _selectedID: string;
  _update: (...args: unknown[]) => unknown;
  setTabData(id: string, data: Record<string, unknown>): void;
  select(id: string): void;
  close(ids: string[]): void;
  move(id: string, index: number): void;
  refocus(): void;
  add(options: { type: string; title: string; data: Record<string, unknown>; select: boolean }): {
    id: string;
  };
};
type Notifier = {
  registerObserver(
    observer: { notify: () => void },
    types: string[],
    name: string,
  ): string | number;
  unregisterObserver(id: string | number): void;
};
const namespace = 'zoteroNeoTabEnhancements';
const blank = (nativeTitle: string): TabTitleFields =>
  Object.freeze({ nativeTitle, title: '', citekey: '', author: '', year: '', filename: '' });

function fields(item: Zotero.Item, nativeTitle: string): TabTitleFields {
  const parent = item.parentItemID ? Zotero.Items.get(item.parentItemID) : item;
  const target = parent && !parent.deleted ? parent : item;
  const creator = target.getCreators?.()[0] as { lastName?: string; name?: string } | undefined;
  return Object.freeze({
    nativeTitle,
    title: String(target.getField('title') || target.getDisplayTitle?.() || ''),
    citekey: target.isRegularItem() ? citationKey(target) : '',
    author: creator?.lastName || creator?.name || '',
    year: String(target.getField('date') || '').match(/\b\d{4}\b/)?.[0] || '',
    filename: item.isAttachment() ? item.attachmentFilename || '' : '',
  });
}

export function createTabEnhancementHost(
  window: MainWindow,
  onError: (error: unknown) => void,
): TabEnhancementHost {
  const document = window.document;
  const tabs = (window as unknown as { Zotero_Tabs: NativeTabs }).Zotero_Tabs;
  if (!tabs || !Array.isArray(tabs._tabs) || typeof tabs._update !== 'function')
    throw new Error('Native tab host unavailable');
  const notifier = (Zotero as unknown as { Notifier: Notifier }).Notifier;
  const id = window.crypto.randomUUID();
  const listeners = new Set<() => void>();
  const layouts = new Set<{ dispose(): void }>();
  let disposed = false;
  let timer: number | undefined;
  let cache: readonly TabViewSnapshot[] = Object.freeze([]);
  const current = () => !disposed && window.document === document && !window.closed;
  const report = (error: unknown) => {
    if (current()) onError(error);
  };
  function itemFor(ref: TabDocumentRef): Zotero.Item | null {
    const item = Zotero.Items.getByLibraryAndKey(ref.libraryID, ref.key);
    return item && !item.deleted && (ref.kind === 'note' ? item.isNote() : item.isAttachment())
      ? item
      : null;
  }
  function project(): void {
    const seen = new Set<string>();
    cache = Object.freeze(
      tabs._tabs.map((tab): TabViewSnapshot => {
        const kind = tab.type.split('-')[0];
        const normalized =
          kind === 'reader' || kind === 'note' || kind === 'library' ? kind : 'other';
        let viewID = '';
        if (normalized === 'reader' || normalized === 'note') {
          const data = tab.data || {};
          const stored = data[namespace] as { version?: unknown; viewID?: unknown } | undefined;
          if (
            stored?.version === 1 &&
            typeof stored.viewID === 'string' &&
            stored.viewID &&
            !seen.has(stored.viewID)
          )
            viewID = stored.viewID;
          else {
            viewID = window.crypto.randomUUID();
            tabs.setTabData(tab.id, { [namespace]: { version: 1, viewID } });
          }
          seen.add(viewID);
        } else viewID = `native:${tab.id}`;
        const item =
          typeof tab.data?.itemID === 'number' ? Zotero.Items.get(tab.data.itemID) : null;
        const ref: TabDocumentRef | null =
          item && !item.deleted && (normalized === 'reader' || normalized === 'note')
            ? Object.freeze({ kind: normalized, libraryID: item.libraryID, key: item.key })
            : null;
        const nativeTitle = tab.title || '';
        let titleFields = blank(nativeTitle);
        if (item && !item.deleted) {
          try {
            titleFields = fields(item, nativeTitle);
          } catch (error) {
            report(error);
          }
        }
        return Object.freeze({
          nativeID: tab.id,
          viewID,
          kind: normalized,
          state: tab.type.endsWith('-unloaded')
            ? 'unloaded'
            : tab.type.endsWith('-loading')
              ? 'loading'
              : 'loaded',
          selected: tab.id === tabs._selectedID,
          document: ref,
          fields: titleFields,
        });
      }),
    );
  }
  function schedule(): void {
    if (!current() || timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!current()) return;
      try {
        project();
        for (const listener of listeners) listener();
      } catch (error) {
        report(error);
      }
    }, 0);
  }
  const originalUpdate = tabs._update;
  const wrappedUpdate = function (this: NativeTabs, ...args: unknown[]) {
    const result = originalUpdate.apply(this, args);
    schedule();
    return result;
  };
  const observerID = notifier.registerObserver(
    { notify: schedule },
    ['item', 'tab'],
    'neo-tab-enhancements',
  );
  try {
    tabs._update = wrappedUpdate;
    project();
  } catch (error) {
    if (tabs._update === wrappedUpdate) tabs._update = originalUpdate;
    notifier.unregisterObserver(observerID);
    throw error;
  }
  const host: TabEnhancementHost = {
    id,
    window,
    snapshot: () => cache,
    observe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    metadata(ref) {
      if (!current()) return null;
      const item = itemFor(ref);
      if (!item) return null;
      try {
        return fields(item, '');
      } catch (error) {
        report(error);
        return null;
      }
    },
    select(nativeID) {
      if (!current() || !tabs._tabs.some((tab) => tab.id === nativeID)) return false;
      tabs.select(nativeID);
      return true;
    },
    focusContent() {
      if (current()) tabs.refocus();
    },
    close(nativeIDs) {
      if (!current()) return;
      const ids = nativeIDs.filter(
        (id) => id !== 'zotero-pane' && tabs._tabs.some((tab) => tab.id === id),
      );
      if (ids.length) tabs.close(ids);
    },
    move(nativeID, beforeNativeID) {
      if (!current()) return;
      const from = tabs._tabs.findIndex((tab) => tab.id === nativeID);
      if (from <= 0 || nativeID === beforeNativeID) return;
      const before =
        beforeNativeID === null
          ? tabs._tabs.length
          : tabs._tabs.findIndex((tab) => tab.id === beforeNativeID);
      if (before < 0) return;
      tabs.move(nativeID, Math.max(1, before));
    },
    async open(ref, viewID, isCurrent) {
      if (!current() || !isCurrent()) return false;
      const item = itemFor(ref);
      if (!item) throw new Error('Tab document unavailable');
      // Zotero 10's session hooks use this public item method, absent from installed declarations.
      const titleItem = item as Zotero.Item & { getTabTitle(): Promise<string> };
      const title = await titleItem.getTabTitle();
      if (!current() || !isCurrent()) return false;
      const result = tabs.add({
        type: `${ref.kind}-unloaded`,
        title: title || '',
        data: { itemID: item.id, [namespace]: { version: 1, viewID } },
        select: false,
      });
      return result.id;
    },
    mountSidebar(root, toolbarSlot, options, onResize) {
      if (!current()) throw new Error('Tab host retired');
      const layout = mountRail(window, root, toolbarSlot, options, onResize);
      layouts.add(layout);
      return {
        ownsTarget: layout.ownsTarget,
        update: layout.update,
        dispose() {
          layouts.delete(layout);
          layout.dispose();
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (tabs._update === wrappedUpdate) tabs._update = originalUpdate;
      notifier.unregisterObserver(observerID);
      for (const layout of layouts) layout.dispose();
      layouts.clear();
      listeners.clear();
      window.removeEventListener('unload', host.dispose);
    },
  };
  window.addEventListener('unload', host.dispose, { once: true });
  return host;
}
