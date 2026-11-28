import type { MainWindow } from '../../core/contracts';
import { isDeadObject } from '../../platform/cross-compartment';
import { openSafeURI } from '../../toolkit';
import { mountNoteLinks } from './index';

/** Link gestures belong to each native Note document, independent of keyboard routing. */
export function createNoteLinkLifecycle(owner: MainWindow, reportError: (error: unknown) => void) {
  const mounted = new Map<Window, { document: Document; dispose?: () => void }>();
  let retired = false;

  const release = (window: Window): void => {
    const previous = mounted.get(window);
    mounted.delete(window);
    try {
      previous?.dispose?.();
    } catch (error) {
      reportError(error);
    }
  };

  return {
    sync(editors: readonly Window[]): void {
      if (retired) return;
      for (const [window, previous] of mounted) {
        if (
          !editors.includes(window) ||
          isDeadObject(window) ||
          window.document !== previous.document
        )
          release(window);
      }
      for (const window of editors) {
        if (retired) return;
        if (mounted.has(window) || isDeadObject(window)) continue;
        const next: { document: Document; dispose?: () => void } = { document: window.document };
        mounted.set(window, next);
        try {
          const dispose = mountNoteLinks(window, (uri) => openSafeURI(uri, owner));
          if (mounted.get(window) === next) next.dispose = dispose;
          else dispose();
        } catch (error) {
          if (mounted.get(window) === next) mounted.delete(window);
          reportError(error);
        }
      }
    },
    dispose(): void {
      retired = true;
      for (const window of mounted.keys()) release(window);
    },
  };
}
