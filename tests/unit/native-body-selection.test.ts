import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  leaseNativeBodySelection,
  readerHasNativeBodyGesture,
} from '../../src/toolkit/reader/native-body-selection';
import { leaseReaderPresentation } from '../../src/toolkit/reader/presentation';
import {
  groupReaderSelectionPages,
  type ReaderSelectionPart,
} from '../../src/toolkit/reader/selection-pages';
import {
  leaseReaderTextAdmission,
  type ReaderTextSourceLocation,
} from '../../src/toolkit/reader/text-admission';

const realmAliases = new WeakMap<object, object>();
beforeEach(() => {
  vi.stubGlobal('Components', {
    utils: {
      cloneInto: <T>(value: T, _target: Window, options?: { cloneFunctions?: boolean }) => {
        if (!options?.cloneFunctions) return structuredClone(value);
        const wrapped = {};
        // Gecko hides callable properties through the holder's Xray.
        realmAliases.set(wrapped, value as object);
        return wrapped as T;
      },
      waiveXrays: <T extends object>(value: T) =>
        (realmAliases.get(value) as T | undefined) ?? value,
    },
  });
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllGlobals();
});

type Position = ReaderSelectionPart['position'];
interface Annotation extends ReaderSelectionPart {
  type?: string;
  color?: string;
  id?: string;
}
interface Popup {
  annotation: Annotation;
  rect: readonly number[];
}
interface Range {
  pageIndex: number;
  position: Position;
  anchorOffset: number;
  headOffset: number;
  anchor: boolean;
  head: boolean;
  collapsed?: boolean;
  text: string;
  sortIndex: string;
}

interface ClosestTarget {
  closest(selector: string): ClosestTarget | null;
}

const viewer: ClosestTarget = {
  closest: (selector) => (selector === '#viewerContainer' ? viewer : null),
};
const popupButton: ClosestTarget = {
  closest: (selector) => (selector === '.primary-view .selection-popup' ? popupButton : null),
};
const noteEditor: ClosestTarget = {
  closest: (selector) => (selector.startsWith('input,') ? noteEditor : null),
};
function dispatch(target: EventTarget, type: string, fields: Record<string, unknown> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

function harness(pageTexts = ['AxBxC', 'DuE', 'z', 'Unused', 'FG']) {
  const pdf = new EventTarget();
  const readerDocument = new EventTarget();
  const iframe = {};
  const ownerDocument = Object.assign(readerDocument, {
    activeElement: iframe,
    hasFocus: () => true,
  });
  const owner = { document: ownerDocument } as unknown as Window;
  const styles = new Set<object>();
  const document = Object.assign(new EventTarget(), {
    documentElement: { appendChild: (style: object) => styles.add(style) },
    createElement: () => {
      const style = { setAttribute() {}, remove: () => styles.delete(style) };
      return style;
    },
  });
  const dom = {
    rangeCount: 0,
    isCollapsed: true,
    anchorNode: {},
    focusNode: {},
    anchorOffset: 0,
    focusOffset: 0,
  };
  const window = Object.assign(pdf, { document, getSelection: () => dom }) as unknown as Window;
  const state = { primaryViewSelectionPopup: undefined as Popup | undefined };
  const manager = {
    addAnnotation: vi.fn((annotation: Annotation) => ({ ...annotation, id: 'saved' })),
  };
  const body = (glyph: string) => !'xuz'.includes(glyph);
  const textPages = pageTexts.map((text) => ({
    viewBox: [0, 0, 600, 800],
    overlays: [],
    chars: Array.from(text, (c, index) => ({
      c,
      rect: [index * 10, 1, index * 10 + 6, 9],
      inlineRect: [index * 10, 0, index * 10 + 6, 10],
    })),
  }));
  const ready = new Set([0]);
  let layout = true;
  let current = true;
  let commentFocused = false;
  const accepts = vi.fn(({ pageIndex, rect }: ReaderTextSourceLocation) => {
    const glyph = rect && pageIndex !== null && pageTexts[pageIndex]?.[rect[0]! / 10];
    return !glyph || body(glyph);
  });
  const releaseAdmission = leaseReaderTextAdmission(
    window,
    accepts,
    () => true,
    () => layout,
    ({ pageIndex }) => pageIndex !== null && ready.has(pageIndex),
  );
  cleanups.push(releaseAdmission);
  const drawn = new Map<number, Position>();
  const pages = textPages.map((_page, pageIndex) => ({
    pageIndex,
    _pageIndex: pageIndex,
    _pushSelection(items: Position[]): void {
      if (view._tool.type === 'highlight' && view._selectionRanges.length) {
        const position = view._getAnnotationFromSelectionRanges(
          view._selectionRanges,
          'highlight',
        )?.position;
        if (position?.pageIndex === pageIndex) items.push(position);
        else if (position?.nextPageRects && position.pageIndex + 1 === pageIndex)
          items.push({ pageIndex, rects: position.nextPageRects });
        return;
      }
      for (const { position } of view._selectionRanges) {
        if (position.pageIndex === pageIndex) items.push(position);
      }
    },
  }));
  const view = {
    _primary: true,
    _iframe: iframe,
    _iframeWindow: window,
    _selectedAnnotationIDs: [] as string[],
    _tool: { type: 'pointer' },
    action: null as { type: string } | null,
    _selectionRanges: [] as Range[],
    _pdfPages: textPages,
    _pages: pages,
    _textAnnotationFocused: () => commentFocused,
    _getPageLabel: (pageIndex: number) => String(pageIndex + 1),
    getClientRectForPopup: (position: Position) => position.rects[0] ?? [],
    pointerEventToPosition: (event: PointerEvent) => ({
      pageIndex: event.clientY > 20 ? 1 : 0,
      rects: [[event.clientX, event.clientY % 20]],
    }),
    _render(pageIndexes?: readonly number[]) {
      for (const page of pages) {
        if (pageIndexes && !pageIndexes.includes(page.pageIndex)) continue;
        const positions: Position[] = [];
        page._pushSelection(positions);
        const first = positions[0];
        if (first) drawn.set(page.pageIndex, first);
        else drawn.delete(page.pageIndex);
      }
    },
    _getAnnotationFromSelectionRanges(
      ranges: Range[],
      type?: string,
      color?: string,
    ): Annotation | null {
      const [first, next] = [...ranges].sort((a, b) => a.pageIndex - b.pageIndex);
      if (!first || first.collapsed) return null;
      return {
        type,
        color,
        position: next ? { ...first.position, nextPageRects: next.position.rects } : first.position,
        pageLabel: String(first.pageIndex + 1),
        text: next ? `${first.text} ${next.text}` : first.text,
        sortIndex: first.sortIndex,
      };
    },
    _onSetSelectionPopup(popup?: Popup) {
      state.primaryViewSelectionPopup = popup;
    },
    _onAddAnnotation: (annotation: Annotation) => manager.addAnnotation(annotation),
  };
  const internal = { _primaryView: view, _state: state, _annotationManager: manager };
  const reader = { itemID: 3, _iframeWindow: owner, _internalReader: internal };
  const releasePresentation = leaseReaderPresentation(window, view, () => current);
  cleanups.push(releasePresentation);
  function range(pageIndex: number, start = 0, end = pageTexts[pageIndex]!.length): Range {
    return {
      pageIndex,
      position: { pageIndex, rects: [[start * 10, 0, (end - 1) * 10 + 6, 10]] },
      anchorOffset: start,
      headOffset: end,
      anchor: pageIndex === 0,
      head: true,
      text: pageTexts[pageIndex]!.slice(start, end),
      sortIndex: `${pageIndex}|${start}`,
    };
  }
  // Zotero 10.0.8 initializes this capture listener first. stopPropagation() still lets
  // a later capture listener on the same iframe Window replace its clipboard payload.
  pdf.addEventListener(
    'copy',
    (event) => {
      const data = (event as ClipboardEvent).clipboardData!;
      if (commentFocused) return;
      event.preventDefault();
      event.stopPropagation();
      if (view._selectedAnnotationIDs.length) {
        data.setData('text/plain', 'ordinary annotation');
        return;
      }
      if (view._selectionRanges.length > 2) {
        data.setData('text/plain', view._selectionRanges.map(({ text }) => text).join('\n'));
        return;
      }
      const proposal = view._getAnnotationFromSelectionRanges(view._selectionRanges, 'highlight');
      if (!proposal) return;
      data.setData('text/plain', proposal.text);
      data.setData('text/html', `<p>${proposal.text}</p>`);
    },
    true,
  );
  const originalRender = view._render;
  const originalSave = manager.addAnnotation;
  const release = leaseNativeBodySelection(reader, window, () => current, vi.fn());
  cleanups.push(release);
  function pointer(type: string, fields: Record<string, unknown> = {}) {
    return dispatch(pdf, type, {
      target: viewer,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 3,
      clientY: 4,
      ...fields,
    });
  }
  function finish() {
    pointer('pointerup');
    const proposal = view._getAnnotationFromSelectionRanges(view._selectionRanges, 'highlight');
    if (proposal) view._onSetSelectionPopup({ rect: [1, 2, 3, 4], annotation: proposal });
    // Native pointerup publishes raw DOM endpoints separately from overlay paint.
    dom.rangeCount = 1;
    dom.isCollapsed = false;
    dom.focusOffset = 5;
    view.action = null;
    view._render();
  }
  function select(ranges: Range[]) {
    view.action = { type: 'selectText' };
    view._selectionRanges = ranges;
    view._render();
  }
  function copy(target = viewer) {
    const formats = new Map<string, string>();
    const clipboardData = {
      clearData: () => formats.clear(),
      setData: (format: string, value: string) => formats.set(format, value),
    };
    dispatch(pdf, 'copy', { target, clipboardData });
    return Object.fromEntries(formats);
  }
  return {
    pdf,
    window,
    ownerDocument,
    iframe,
    state,
    view,
    manager,
    originalSave,
    originalRender,
    range,
    drawn,
    styles,
    ready,
    pointer,
    finish,
    select,
    copy,
    release,
    accepts,
    setDomHead(offset: number | null, emit = true) {
      dom.rangeCount = offset === null ? 0 : 1;
      dom.isCollapsed = offset === null;
      dom.focusOffset = offset ?? 0;
      if (emit) dispatch(document, 'selectionchange');
    },
    setLayout: (value: boolean) => {
      layout = value;
    },
    setCurrent: (value: boolean) => {
      current = value;
    },
    setCommentFocused: (value: boolean) => {
      commentFocused = value;
    },
  };
}

const ragged = [
  [0, 0, 6, 10],
  [20, 0, 26, 10],
  [40, 0, 46, 10],
];

describe('native PDF Body-Only selection', () => {
  it('skips missing native capabilities without acquiring privileged wrappers', () => {
    vi.stubGlobal('Components', { utils: {} });
    const window = new EventTarget() as unknown as Window;
    const reader = { itemID: 3, _iframeWindow: window, _internalReader: {} };
    cleanups.push(leaseReaderPresentation(window, {}, () => true));
    const debug = vi.fn();
    expect(() => leaseNativeBodySelection(reader, window, () => true, debug)()).not.toThrow();
    expect(debug).not.toHaveBeenCalled();
  });

  it('classifies each native glyph only once while dragging over the same layout', () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0, 0, 3)]);
    t.select([t.range(0)]);
    t.select([t.range(0, 0, 4)]);
    expect(t.accepts).toHaveBeenCalledTimes(5);
  });

  it('normalizes filtered clipboard text to NFC and collapsed whitespace', async () => {
    const t = harness(['Ax e\u0301  C']);
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    expect(t.copy()['text/plain']).toBe('A é C');
  });

  it('does not paint invalid rects or bridge excluded and malformed glyphs', () => {
    const t = harness();
    t.view._pdfPages[0]!.chars[2]!.inlineRect = [20, 0, 20, 10];
    t.view._pdfPages[0]!.chars[4]!.inlineRect = [40, 0, Infinity, 10];
    t.pointer('pointerdown');
    t.select([t.range(0), t.range(1)]);
    expect(t.drawn.get(0)?.rects).toEqual([[0, 0, 6, 10]]);
    expect(t.drawn.get(1)?.rects).toEqual([
      [0, 0, 6, 10],
      [20, 0, 26, 10],
    ]);
  });

  it('paints admitted ragged geometry without replacing the native drag endpoints', async () => {
    const t = harness();
    t.pointer('pointerdown');
    expect(t.styles.size).toBe(1);
    const raw = [t.range(0)];
    t.select(raw);
    expect(t.drawn.get(0)?.rects).toEqual(ragged);
    expect(t.view._selectionRanges).toBe(raw);
    expect(t.view._selectionRanges[0]).toMatchObject({ anchorOffset: 0, headOffset: 5 });
    t.finish();
    expect(t.styles.size).toBe(0);
    await Promise.resolve();
    expect(readerHasNativeBodyGesture(t.window)).toBe(true);
    expect(t.copy()).toEqual({ 'text/plain': 'A B C', 'text/html': '<p>A B C</p>' });
  });

  it('overwrites the earlier native capture listener for exact cross-page copy, including after right-click', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0), t.range(1), t.range(2), t.range(4)]);
    t.finish();
    await Promise.resolve();
    expect(t.copy()).toEqual({ 'text/plain': 'A B C D E FG' });
    expect(t.drawn.has(2)).toBe(false);
    t.pointer('pointerdown', { button: 2 });
    t.setDomHead(null); // Native mousedown clears selection before contextmenu opens.
    t.pointer('contextmenu', { button: 2 });
    t.ownerDocument.activeElement = {};
    dispatch(t.pdf, 'blur');
    await Promise.resolve();
    expect(t.copy()).toEqual({ 'text/plain': 'A B C D E FG' });
    t.view._selectedAnnotationIDs = ['existing'];
    expect(t.copy()).toEqual({ 'text/plain': 'ordinary annotation' });
    t.setCommentFocused(true);
    expect(t.copy(noteEditor)).toEqual({});
  });

  it.each([
    { name: 'Alt', fields: { altKey: true }, cold: false },
    { name: 'a non-body glyph', fields: { clientX: 13 }, cold: false },
    { name: 'unknown text geometry', fields: { clientX: 8 }, cold: false },
    { name: 'an unprepared anchor', fields: {}, cold: true },
  ])('passes the whole interaction through when starting with $name', async ({ fields, cold }) => {
    const t = harness();
    if (cold) t.ready.clear();
    t.pointer('pointerdown', fields);
    expect(t.styles.size).toBe(0);
    // Finishing after preparation may not retroactively admit the raw gesture.
    t.ready.add(0);
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    expect(t.drawn.get(0)?.rects).toEqual([[0, 0, 46, 10]]);
    expect(t.copy()).toEqual({ 'text/plain': 'AxBxC', 'text/html': '<p>AxBxC</p>' });
    expect(readerHasNativeBodyGesture(t.window)).toBe(true);
  });

  it('commits only the owning popup selection as legal annotation parts, even when popup focus moves', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0), t.range(1), t.range(2), t.range(4)]);
    t.finish();
    await Promise.resolve();
    dispatch(t.ownerDocument, 'focusin', { target: popupButton });
    const popup = t.state.primaryViewSelectionPopup!;
    // SelectionPopup shades a shallow copy; an unrelated structurally equal annotation is native.
    const ordinary = { ...structuredClone(popup.annotation), type: 'highlight', color: '#fff' };
    t.manager.addAnnotation(ordinary);
    expect(t.originalSave).toHaveBeenCalledExactlyOnceWith(ordinary);
    t.originalSave.mockClear();
    const position = { ...popup.annotation.position };
    realmAliases.set(position, popup.annotation.position);
    const saved = t.manager.addAnnotation({
      ...popup.annotation,
      position,
      type: 'underline',
      color: '#ff0',
    });
    expect(saved.id).toBe('saved');
    expect(t.originalSave.mock.calls.map(([annotation]) => annotation)).toEqual([
      {
        type: 'underline',
        color: '#ff0',
        text: 'A B C D E',
        sortIndex: '00000|000000|00790',
        pageLabel: '1',
        position: {
          pageIndex: 0,
          rects: ragged,
          nextPageRects: [
            [0, 0, 6, 10],
            [20, 0, 26, 10],
          ],
        },
      },
      {
        type: 'underline',
        color: '#ff0',
        text: 'FG',
        sortIndex: '4|0',
        pageLabel: '5',
        position: { pageIndex: 4, rects: [[0, 0, 16, 10]] },
      },
    ]);
  });

  it('saves legal parts through the native active annotation tool too', () => {
    const t = harness();
    t.view._tool.type = 'highlight';
    t.pointer('pointerdown');
    t.select([t.range(0), t.range(1), t.range(4)]);
    expect(t.drawn.get(0)?.rects).toEqual(ragged);
    expect(t.drawn.get(1)?.rects).toEqual([
      [0, 0, 6, 10],
      [20, 0, 26, 10],
    ]);
    t.pointer('pointerup');
    const native = t.view._getAnnotationFromSelectionRanges(
      t.view._selectionRanges,
      'highlight',
      '#ff0',
    )!;
    t.view._onAddAnnotation(native);
    expect(
      t.originalSave.mock.calls.map(([annotation]) => [
        annotation.position.pageIndex,
        annotation.text,
      ]),
    ).toEqual([
      [0, 'A B C D E'],
      [4, 'FG'],
    ]);
  });

  it('does not turn a projection with zero retained glyphs into a saved annotation or a popup', () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0, 1, 2)]);
    const native = t.view._getAnnotationFromSelectionRanges(
      t.view._selectionRanges,
      'highlight',
      '#ff0',
    )!;
    t.view._onAddAnnotation(native);
    t.finish();
    expect(t.originalSave).not.toHaveBeenCalled();
    expect(t.state.primaryViewSelectionPopup).toBeUndefined();
    expect(t.drawn.has(0)).toBe(false);
    expect(t.copy()).toEqual({ 'text/plain': '' });
  });

  it('falls back after exact endpoints change or a new presentation replaces the lease', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    t.view._selectionRanges[0]!.headOffset = 2;
    expect(t.copy()['text/plain']).toBe('AxBxC');
    expect(readerHasNativeBodyGesture(t.window)).toBe(false);
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    t.setCurrent(false);
    expect(t.copy()['text/plain']).toBe('AxBxC');
    expect(readerHasNativeBodyGesture(t.window)).toBe(false);
  });

  it.each([null, 1])(
    'retires the settled projection after unrelated DOM endpoint %s',
    async (offset) => {
      const t = harness();
      t.pointer('pointerdown');
      t.select([t.range(0)]);
      t.finish();
      await Promise.resolve();
      const popup = t.state.primaryViewSelectionPopup!;
      t.setDomHead(offset, offset === null);
      expect(t.copy()['text/plain']).toBe('AxBxC');
      expect(readerHasNativeBodyGesture(t.window)).toBe(false);
      // A React click already obtained from the displaced native popup can only use native fallback.
      t.manager.addAnnotation({ ...popup.annotation, type: 'highlight', color: '#ff0' });
      expect(t.originalSave.mock.calls[0]?.[0].text).toBe('AxBxC');
    },
  );

  it('does not commit a projected selection after the exact layout is retired', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0), t.range(1), t.range(4)]);
    t.finish();
    await Promise.resolve();
    const popup = t.state.primaryViewSelectionPopup!;
    t.setLayout(false);
    t.manager.addAnnotation({ ...popup.annotation, type: 'highlight', color: '#ff0' });
    expect(t.originalSave).toHaveBeenCalledTimes(1);
    expect(t.originalSave.mock.calls[0]?.[0].text).toBe('AxBxC DuE');
    expect(t.copy()['text/plain']).toBe('AxBxC\nDuE\nFG');
    expect(t.drawn.get(0)?.rects).toEqual([[0, 0, 46, 10]]);
  });

  it('immediately releases style on cancel and restores native methods, popup and paint on disposal', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.pointer('pointercancel');
    expect(t.styles.size).toBe(0);
    expect(t.drawn.get(0)?.rects).toEqual([[0, 0, 46, 10]]);
    expect(readerHasNativeBodyGesture(t.window)).toBe(false);
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    t.release();
    expect(t.view._render).toBe(t.originalRender);
    expect(t.manager.addAnnotation).toBe(t.originalSave);
    expect(t.state.primaryViewSelectionPopup?.annotation.text).toBe('AxBxC');
    expect(t.drawn.get(0)?.rects).toEqual([[0, 0, 46, 10]]);
    expect(t.copy()).toMatchObject({ 'text/plain': 'AxBxC' });
  });

  it('retires the snapshot on focus moving to a native editor or another split', async () => {
    const t = harness();
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    dispatch(t.ownerDocument, 'focusin', { target: noteEditor });
    expect(readerHasNativeBodyGesture(t.window)).toBe(false);
    expect(t.copy()).toMatchObject({ 'text/plain': 'AxBxC' });
    t.pointer('pointerdown');
    t.select([t.range(0)]);
    t.finish();
    await Promise.resolve();
    dispatch(t.ownerDocument, 'focusin', { target: {} });
    expect(readerHasNativeBodyGesture(t.window)).toBe(false);
    expect(t.copy()).toMatchObject({ 'text/plain': 'AxBxC' });
  });
});

describe('legal annotation page grouping', () => {
  it('sorts without changing input and never encodes an empty or nonadjacent page as nextPageRects', () => {
    const page = (pageIndex: number, rects: readonly (readonly number[])[] = [[0, 0, 1, 1]]) => ({
      pageIndex,
      rects,
      text: `text${pageIndex}`,
      pageLabel: String(pageIndex + 1),
      sortIndex: `sort${pageIndex}`,
    });
    const input = [page(6), page(0), page(1), page(2), page(3, []), page(4), page(5)];
    expect(groupReaderSelectionPages(input)).toEqual([
      {
        position: { pageIndex: 0, rects: [[0, 0, 1, 1]], nextPageRects: [[0, 0, 1, 1]] },
        text: 'text0 text1',
        pageLabel: '1',
        sortIndex: 'sort0',
      },
      {
        position: { pageIndex: 2, rects: [[0, 0, 1, 1]] },
        text: 'text2',
        pageLabel: '3',
        sortIndex: 'sort2',
      },
      {
        position: { pageIndex: 4, rects: [[0, 0, 1, 1]], nextPageRects: [[0, 0, 1, 1]] },
        text: 'text4 text5',
        pageLabel: '5',
        sortIndex: 'sort4',
      },
      {
        position: { pageIndex: 6, rects: [[0, 0, 1, 1]] },
        text: 'text6',
        pageLabel: '7',
        sortIndex: 'sort6',
      },
    ]);
    expect(input.map(({ pageIndex }) => pageIndex)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });
});
