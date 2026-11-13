import { translateForZotero248 } from '../../platform/translate-for-zotero-v248';

export type TranslationCapture =
  | { readonly status: 'ready'; readonly text: string }
  | { readonly status: 'unsupported' | 'not-ready' | 'retired' };

export interface TranslationPopupCapture {
  readonly read: () => TranslationCapture;
  readonly dispose: () => void;
}

/** Bind the plugin widget inside this native popup; other listeners may append it later. */
export function captureTranslateForZotero248(
  nativePopup: Element,
  itemID: number,
  quote: string,
): TranslationPopupCapture {
  const normalizedQuote = quote
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, ' ')
    .normalize('NFKC');
  let disposed = false;
  let readBound: (() => TranslationCapture) | null = null;
  let releaseBound: (() => void) | null = null;
  const bind = (): TranslationCapture | null => {
    const runtime = translateForZotero248();
    const queue = runtime?.data?.translate?.queue;
    if (!runtime || !queue) return { status: 'unsupported' };
    const popup = runtime.data?.popup?.currentPopup;
    if (!popup || !nativePopup.contains(popup)) return { status: 'not-ready' };
    const taskID = popup.getAttribute('translate-task-id');
    const task = queue.find((candidate) => candidate && candidate.id === taskID);
    if (!task || task.type !== 'text' || task.raw !== normalizedQuote || task.itemId !== itemID)
      return { status: 'not-ready' };
    const prefix = popup.getAttribute('zoteropdftranslate-prefix');
    const element = prefix ? popup.ownerDocument.getElementById(`${prefix}-text`) : null;
    if (!element || element.tagName.toLowerCase() !== 'textarea' || !popup.contains(element))
      return { status: 'unsupported' };
    const textarea = element as HTMLTextAreaElement;
    let publishedResult: string | null = null;
    let comparedResult: string | null = null;
    let textareaResult = '';
    const current = (): boolean =>
      !disposed &&
      nativePopup.isConnected &&
      popup.isConnected &&
      translateForZotero248() === runtime &&
      runtime.data?.popup?.currentPopup === popup &&
      popup.getAttribute('translate-task-id') === taskID &&
      queue.includes(task) &&
      task.raw === normalizedQuote &&
      task.itemId === itemID &&
      textarea.isConnected &&
      popup.contains(textarea);
    const verifyPublished = (): void => {
      if (!current() || task.status !== 'success' || !task.result) {
        publishedResult = null;
        return;
      }
      if (comparedResult !== task.result) {
        comparedResult = task.result;
        textareaResult = task.result.replace(/\r\n?/gu, '\n');
      }
      if (textarea.value === textareaResult) publishedResult = task.result;
      else if (publishedResult !== task.result) publishedResult = null;
    };
    textarea.addEventListener('beforeinput', verifyPublished);
    textarea.addEventListener('input', verifyPublished);
    releaseBound = () => {
      textarea.removeEventListener('beforeinput', verifyPublished);
      textarea.removeEventListener('input', verifyPublished);
    };
    readBound = () => {
      if (!current()) return { status: 'retired' };
      verifyPublished();
      if (!publishedResult || !textarea.value.trim()) return { status: 'not-ready' };
      return { status: 'ready', text: textarea.value };
    };
    return null;
  };
  return {
    read: () => {
      if (disposed || !nativePopup.isConnected) return { status: 'retired' };
      try {
        if (!readBound) {
          const unavailable = bind();
          if (unavailable) return unavailable;
        }
        return readBound!();
      } catch {
        return { status: 'retired' };
      }
    },
    dispose: () => {
      disposed = true;
      try {
        releaseBound?.();
      } catch {
        /* A detached native document may already be dead. */
      }
      releaseBound = null;
      readBound = null;
    },
  };
}
