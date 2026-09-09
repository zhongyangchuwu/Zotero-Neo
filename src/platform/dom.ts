/** Returns an iframe/chrome Element without relying on constructors absent from Bootstrap globals. */
export function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object' || !('tagName' in target)) return null;
  return target as Element;
}

/** Detects native text-entry targets across Gecko chrome/content compartments. */
export function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const localName = element.localName.toLowerCase();
  return (
    ['input', 'textarea', 'textbox', 'search'].includes(localName) ||
    ('isContentEditable' in element && element.isContentEditable === true) ||
    !!element.shadowRoot?.querySelector('input,textarea')
  );
}

/** Narrows a registered keyboard listener event without using the unavailable global constructor. */
export function asKeyboardEvent(event: Event): KeyboardEvent | null {
  return 'key' in event && typeof event.key === 'string' ? (event as KeyboardEvent) : null;
}
