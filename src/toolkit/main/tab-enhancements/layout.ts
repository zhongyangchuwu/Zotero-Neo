import { normalizeTabRailWidth, TAB_RAIL_WIDTH } from '../tab-enhancements-types';
import type { TabRailLayout, TabRailLayoutOptions } from '../tab-enhancements-types';

/** The rail is a sibling of the entire native content, never a wrapper around it. */
export function mountRail(
  window: Window,
  root: HTMLElement,
  toolbarSlot: HTMLElement,
  initial: TabRailLayoutOptions,
  onResize: (width: number) => void,
): TabRailLayout {
  const doc = window.document;
  const browser = doc.getElementById('browser');
  const content = doc.getElementById('appcontent');
  const titleBar = doc.getElementById('zotero-title-bar');
  const strip = doc.getElementById('tab-bar-container');
  const toolbar = doc.getElementById('zotero-tabs-toolbar');
  if (
    !browser ||
    !content ||
    content.parentElement !== browser ||
    !titleBar ||
    !strip ||
    !toolbar ||
    strip.parentElement !== titleBar ||
    toolbar.parentElement !== titleBar ||
    Array.from(titleBar.children).some((child) => child !== strip && child !== toolbar)
  ) {
    throw new Error('Unsupported native tab layout; native tabs remain visible');
  }
  const toolbarNext = toolbar.nextSibling;
  const nativeBrowser = browser;
  const nativeContent = content;
  const nativeTitleBar = titleBar;
  const nativeStrip = strip;
  const nativeToolbar = toolbar;
  const splitter = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  const titleDisplay = titleBar.style.getPropertyValue('display');
  const titleDisplayPriority = titleBar.style.getPropertyPriority('display');
  const stripDisplay = strip.style.getPropertyValue('display');
  const stripDisplayPriority = strip.style.getPropertyPriority('display');
  const rootStyle = root.style.cssText;
  function restoreDisplay(element: HTMLElement, value: string, priority: string): void {
    if (value) element.style.setProperty('display', value, priority);
    else element.style.removeProperty('display');
  }
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('aria-orientation', 'vertical');
  splitter.setAttribute('aria-label', 'Resize tab sidebar');
  splitter.tabIndex = 0;
  splitter.style.cssText = 'width: 5px; flex: 0 0 5px; cursor: col-resize;';
  function normalizeOptions(next: TabRailLayoutOptions): TabRailLayoutOptions {
    const width = normalizeTabRailWidth(next.width);
    return width === next.width ? next : { ...next, width };
  }
  let options = normalizeOptions(initial);
  let disposed = false;
  let drag: { x: number; width: number; lastWidth: number } | null = null;
  splitter.setAttribute('aria-valuemin', String(TAB_RAIL_WIDTH.min));
  splitter.setAttribute('aria-valuemax', String(TAB_RAIL_WIDTH.max));
  function updateTopSafeArea(): void {
    if (disposed || options.side !== 'top') return;
    const style = window.getComputedStyle?.(nativeStrip);
    root.style.paddingInlineStart = style?.getPropertyValue('--safe-area-start').trim() || '0px';
    root.style.paddingInlineEnd = style?.getPropertyValue('--safe-area-end').trim() || '0px';
  }
  function place(): void {
    const focused = doc.activeElement as HTMLElement | null;
    const restoreFocus = !!focused && (root.contains(focused) || nativeToolbar.contains(focused));
    if (options.side === 'top') {
      splitter.remove();
      if (nativeToolbar.parentNode === toolbarSlot)
        nativeTitleBar.insertBefore(
          nativeToolbar,
          toolbarNext?.parentNode === nativeTitleBar ? toolbarNext : null,
        );
      restoreDisplay(nativeTitleBar, titleDisplay, titleDisplayPriority);
      nativeTitleBar.insertBefore(root, nativeStrip);
      nativeStrip.style.setProperty('display', 'none', 'important');
      root.dataset.zvTabTop = '1';
      root.style.cssText = rootStyle;
      root.style.display = 'flex';
      root.style.height = 'auto';
      root.style.flex = '1 1 auto';
      root.style.minWidth = '0';
      updateTopSafeArea();
    } else {
      restoreDisplay(nativeStrip, stripDisplay, stripDisplayPriority);
      delete root.dataset.zvTabTop;
      root.style.cssText = rootStyle;
      if (options.side === 'left') {
        nativeBrowser.insertBefore(root, nativeContent);
        nativeBrowser.insertBefore(splitter, nativeContent);
      } else {
        nativeBrowser.insertBefore(splitter, nativeContent.nextSibling);
        nativeBrowser.insertBefore(root, splitter.nextSibling);
      }
      toolbarSlot.appendChild(nativeToolbar);
      nativeTitleBar.style.display = 'none';
    }
    if (restoreFocus && focused?.isConnected && doc.activeElement !== focused) focused.focus();
  }
  function update(next: TabRailLayoutOptions): void {
    if (disposed) return;
    const normalized = normalizeOptions(next);
    const sideChanged = normalized.side !== options.side;
    if (sideChanged && drag) finishDrag(false);
    options = normalized;
    if (sideChanged) place();
    if (options.side === 'top') {
      if (options.collapsed) restoreDisplay(nativeStrip, stripDisplay, stripDisplayPriority);
      else nativeStrip.style.setProperty('display', 'none', 'important');
      root.style.flex = options.collapsed ? '0 0 auto' : '1 1 auto';
    }
    if (options.side !== 'top') {
      root.style.width = `${options.collapsed ? 48 : options.width}px`;
      root.style.flex = '0 0 auto';
    }
    splitter.style.display = options.side === 'top' || options.collapsed ? 'none' : '';
    splitter.setAttribute('aria-valuenow', String(options.width));
  }
  function move(event: MouseEvent): void {
    if (!drag || disposed) return;
    const delta = (event.clientX - drag.x) * (options.side === 'left' ? 1 : -1);
    const width = normalizeTabRailWidth(drag.width + delta);
    root.style.width = `${width}px`;
    splitter.setAttribute('aria-valuenow', String(width));
    drag.lastWidth = width;
  }
  function finishDrag(commit: boolean): void {
    const finished = drag;
    drag = null;
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);
    if (commit && finished && !disposed) {
      options = { ...options, width: finished.lastWidth };
      onResize(finished.lastWidth);
    }
  }
  function stop(): void {
    finishDrag(true);
  }
  function start(event: MouseEvent): void {
    if (event.button !== 0 || options.collapsed) return;
    event.preventDefault();
    drag = { x: event.clientX, width: options.width, lastWidth: options.width };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  }
  function key(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = (event.key === 'ArrowRight' ? 1 : -1) * (options.side === 'left' ? 1 : -1);
    const width = normalizeTabRailWidth(options.width + direction * (event.shiftKey ? 40 : 10));
    update({ ...options, width });
    onResize(options.width);
  }
  try {
    place();
    splitter.addEventListener('mousedown', start);
    splitter.addEventListener('keydown', key);
    window.addEventListener('resize', updateTopSafeArea);
    update(initial);
  } catch (error) {
    window.removeEventListener('resize', updateTopSafeArea);
    if (toolbar.parentNode === toolbarSlot)
      titleBar.insertBefore(toolbar, toolbarNext?.parentNode === titleBar ? toolbarNext : null);
    restoreDisplay(titleBar, titleDisplay, titleDisplayPriority);
    restoreDisplay(strip, stripDisplay, stripDisplayPriority);
    splitter.remove();
    root.remove();
    throw error;
  }
  return {
    ownsTarget(target) {
      return target === splitter;
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      finishDrag(false);
      splitter.removeEventListener('mousedown', start);
      splitter.removeEventListener('keydown', key);
      window.removeEventListener('resize', updateTopSafeArea);
      if (toolbar.parentNode === toolbarSlot)
        titleBar.insertBefore(toolbar, toolbarNext?.parentNode === titleBar ? toolbarNext : null);
      restoreDisplay(titleBar, titleDisplay, titleDisplayPriority);
      restoreDisplay(strip, stripDisplay, stripDisplayPriority);
      splitter.remove();
      root.remove();
    },
  };
}
