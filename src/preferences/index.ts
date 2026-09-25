import { ZoteroPreferenceStore } from '../core/preference-store';
import { ThemeManager, type ThemeRoot } from '../ui/theme';
import { bindOpenNeoSettingsButton, type NeoSettingsRuntime } from './open-settings';

const INITIAL_DELAY_MS = 50;
const MAX_DELAY_MS = 1_000;

const initializedDocuments = new WeakSet<Document>();
const observers = new WeakMap<Document, MutationObserver>();
const preferenceStore = new ZoteroPreferenceStore();

function byId<T extends Element>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

function initializePane(doc: Document): void {
  if (initializedDocuments.has(doc)) return;
  const paneRoot = byId<Element>(doc, 'zotero-neo-prefs') as ThemeRoot | null;
  if (!paneRoot) return;
  initializedDocuments.add(doc);
  observers.get(doc)?.disconnect();
  observers.delete(doc);

  const view = doc.defaultView;
  if (view) {
    const theme = new ThemeManager(view, preferenceStore);
    theme.add(paneRoot);
    view.addEventListener('unload', () => theme.dispose(), { once: true });
  }

  bindOpenNeoSettingsButton(
    byId<HTMLElement>(doc, 'zv-open-neo-settings'),
    byId<HTMLElement>(doc, 'zv-open-neo-settings-status'),
    view,
    () => (Zotero as typeof Zotero & { Neo?: NeoSettingsRuntime }).Neo,
    (opened) =>
      opened
        ? 'Neo Settings opened in the Main window.'
        : 'Open a single Zotero Main window, then try again.',
  );
}

export function initializePreferencesPane(doc: Document = document): void {
  let attempts = 0;
  const schedule = () => {
    if (initializedDocuments.has(doc)) return;
    const delay = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** Math.min(5, attempts));
    attempts += 1;
    window.setTimeout(() => {
      if (!initializedDocuments.has(doc)) {
        initializePane(doc);
        schedule();
      }
    }, delay);
  };
  observers.get(doc)?.disconnect();
  const observer = new MutationObserver(() => initializePane(doc));
  observers.set(doc, observer);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  initializePane(doc);
  schedule();
}

initializePreferencesPane();
