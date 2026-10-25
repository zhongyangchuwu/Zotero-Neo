import type { MainWindow } from '../../core/contracts';
import { activateMainWindow, focusMainItemsImmediately, selectedMainTabID } from './host';

type IdentifierPanel = HTMLElement & { readonly state?: string };
type IdentifierButton = HTMLElement & { readonly disabled?: boolean };
type IdentifierWindow = MainWindow & {
  readonly ZoteroPane?: { getSelectedLibraryIDs?(): readonly number[] };
  readonly Zotero_Tabs?: {
    readonly _tabs?: readonly { readonly id?: string }[];
    select?(id: string, reopening?: boolean, options?: { readonly keepTabFocused: boolean }): void;
  };
  readonly Zotero_Lookup?: {
    showPanel?(): void;
    getActivePanel?(): Element | null;
  };
};

function identifierPanel(window: MainWindow): IdentifierPanel | null {
  return window.document.getElementById('zotero-lookup-panel') as IdentifierPanel | null;
}

/** Native lookup and its context menus own keys until the popup finishes closing. */
export function mainIdentifierLookupOwnsInput(window: MainWindow): boolean {
  const state = identifierPanel(window)?.state;
  return state === 'open' || state === 'showing' || state === 'hiding';
}

/**
 * Opens native identifier entry in the owner's Library tab without changing ScopeSet.
 *
 * Native lookup uses the first selected library and every selected collection. Refuse
 * ambiguous or read-only scopes rather than silently choosing a destination. Zotero
 * retains ownership of drafts, lookup, saving, progress, and popup cancellation.
 */
export function openMainIdentifierLookup(window: MainWindow): boolean {
  const host = window as IdentifierWindow;
  const panel = identifierPanel(window);
  const button = window.document.getElementById('zotero-tb-lookup') as IdentifierButton | null;
  const lookup = host.Zotero_Lookup;
  const input = lookup?.getActivePanel?.()?.querySelector<HTMLTextAreaElement>('textarea');
  if (!panel || !button || !lookup?.showPanel || !input || panel.state === 'hiding') return false;

  const libraryIDs = host.ZoteroPane?.getSelectedLibraryIDs?.();
  const libraryID = libraryIDs?.[0];
  if (libraryIDs?.length !== 1 || libraryID === undefined) return false;
  const library = Zotero.Libraries.get(libraryID);
  if (
    !library ||
    !library.editable ||
    button.disabled ||
    button.getAttribute('disabled') === 'true'
  )
    return false;

  if (selectedMainTabID(window) !== 'zotero-pane') {
    const tabs = host.Zotero_Tabs;
    if (!tabs?.select || !tabs._tabs?.some((tab) => tab.id === 'zotero-pane')) return false;
    // Native select otherwise queues a refocus hook that steals the popup's input.
    tabs.select('zotero-pane', false, { keepTabFocused: true });
    if (selectedMainTabID(window) !== 'zotero-pane') return false;
  }
  activateMainWindow(window);
  if (panel.state === 'open' || panel.state === 'showing') {
    // Focus, not select(), preserves an existing draft and its caret/range.
    input.focus();
    return true;
  }

  // Give native cancellation a Library focus target, without moving its Cursor.
  focusMainItemsImmediately(window);
  lookup.showPanel();
  return mainIdentifierLookupOwnsInput(window);
}
