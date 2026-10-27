/** Check a host element and its ancestors without relying on cross-realm constructors. */
export function visibleElement(window: Window, element: Element): boolean {
  if (!element.isConnected || element.ownerDocument !== window.document) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (
      !style ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    )
      return false;
  }
  return true;
}

/** A retained PDF document is not visible when any containing Reader frame is hidden. */
export function visibleWindow(window: Window): boolean {
  try {
    if (window.closed) return false;
    let frame = window.frameElement;
    while (frame) {
      const owner = frame.ownerDocument.defaultView;
      if (!owner || owner.closed || !visibleElement(owner, frame)) return false;
      frame = owner.frameElement;
    }
    return true;
  } catch {
    return false;
  }
}
