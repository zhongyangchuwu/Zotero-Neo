import type { Cleanup } from '../core/cleanup';
import { nativeObjectIdentity } from './cross-compartment';

export const LITERATURE_WINDOW_URI = 'chrome://zotero-neo-ui/content/literature-table-window.xhtml';

interface CloseObserver {
  observe(subject: object, topic: string): void;
}

interface WindowWatcher {
  openWindow(parent: Window, uri: string, name: string, features: string, args: null): Window;
  registerNotification(observer: CloseObserver): void;
  unregisterNotification(observer: CloseObserver): void;
}

/** Observe native closure even if the window is closed before its document loads. */
export function openLiteratureWindow(
  parent: Window,
  onClosed: () => void,
): { readonly window: Window; readonly unobserve: Cleanup } {
  const watcher = Services.ww as unknown as WindowWatcher;
  const window = nativeObjectIdentity(
    watcher.openWindow(
      nativeObjectIdentity(parent),
      LITERATURE_WINDOW_URI,
      '_blank',
      'chrome,dialog=no,centerscreen,resizable,titlebar,close,width=1000,height=680',
      null,
    ),
  );
  const observer: CloseObserver = {
    observe(subject, topic) {
      if (topic === 'domwindowclosed' && nativeObjectIdentity(subject) === window) onClosed();
    },
  };
  try {
    watcher.registerNotification(observer);
  } catch (error) {
    window.close();
    throw error;
  }
  return { window, unobserve: () => watcher.unregisterNotification(observer) };
}
