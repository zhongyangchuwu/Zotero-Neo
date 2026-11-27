import type { MainWindow } from '../../core/contracts';
import { isDeadObject } from '../../platform/cross-compartment';
import { mainNoteEditorWindow, openSafeURI } from '../../toolkit';
import { mountNoteLinks } from './index';

/** Reuse Main's note discovery without depending on the optional Vim editor. */
export function createNoteLinkLifecycle(owner: MainWindow, reportError: (error: unknown) => void) {
  let current: { window: Window; document: Document; dispose?: () => void } | null = null;
  let retired = false;

  const release = (): void => {
    const previous = current;
    current = null;
    try {
      previous?.dispose?.();
    } catch (error) {
      reportError(error);
    }
  };

  return {
    sync(): void {
      if (retired) return;
      const window = mainNoteEditorWindow(owner);
      const document = window && !isDeadObject(window) ? window.document : null;
      if (current && window === current.window && document === current.document) return;
      release();
      if (!window || !document || retired) return;
      const next: NonNullable<typeof current> = { window, document };
      current = next;
      try {
        const dispose = mountNoteLinks(window, (uri) => openSafeURI(uri, owner));
        if (current === next) next.dispose = dispose;
        else dispose();
      } catch (error) {
        reportError(error);
      }
    },
    dispose(): void {
      retired = true;
      release();
    },
  };
}
