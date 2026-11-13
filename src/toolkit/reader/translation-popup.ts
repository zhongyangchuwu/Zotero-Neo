import { asElement } from '../../platform/dom';

import type { ReaderEventRuntime } from '../../reader/types';

export const TRANSLATION_CONTROL_ATTRIBUTE = 'data-zv-translation-control';

/** Identify only this integration's controls, not arbitrary native sidebar elements. */
export function isReaderTranslationControl(target: EventTarget | null): boolean {
  const element = asElement(target);
  return (
    typeof element?.closest === 'function' &&
    !!element.closest(`[${TRANSLATION_CONTROL_ATTRIBUTE}]`)
  );
}

/** Attach through the event and identify only the popup containing that new action. */
export function appendTranslationPopupAction(
  event: ReaderEventRuntime,
  label: string,
): { readonly button: HTMLButtonElement; readonly popup: Element } | null {
  if (!event.doc || !event.append) return null;
  const button = event.doc.createElement('button');
  button.className = 'toolbar-button wide-button';
  button.setAttribute(TRANSLATION_CONTROL_ATTRIBUTE, '');
  button.textContent = label;
  event.append(button);
  const popup = button.closest('.selection-popup');
  if (!popup) {
    button.remove();
    return null;
  }
  return { button, popup };
}
