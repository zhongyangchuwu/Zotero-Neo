import { CleanupScope } from '../../core/cleanup';
import {
  cloneInto,
  cloneIntoWithFunctions,
  isDeadObject,
  nativeObjectIdentity,
} from '../../platform/cross-compartment';
import type { PdfWindow, ReaderRuntime } from './contracts';
import { currentReaderPresentation } from './presentation';
import type { InternalReaderRuntime, NativeReaderRuntime } from './private-types';
import {
  groupReaderSelectionPages,
  type ReaderSelectionPage,
  type ReaderSelectionPart,
} from './selection-pages';
import {
  activateReaderTextFilter,
  captureReaderTextAdmission,
  type ReaderTextAdmission,
  type ReaderTextSourceLocation,
} from './text-admission';

// Private surfaces from Zotero 10.0.8 Reader c3d467bf. PDF coordinates, offsets and objects stay in Toolkit.
interface PdfChar {
  readonly c: string;
  readonly rect: readonly number[];
  readonly inlineRect: readonly number[];
  readonly rotation?: number;
  readonly ignorable?: boolean;
  readonly spaceAfter?: boolean;
  readonly lineBreakAfter?: boolean;
  readonly paragraphBreakAfter?: boolean;
}
interface PdfTextPage {
  readonly chars: readonly PdfChar[];
  readonly viewBox: readonly number[];
}
interface NativeRange {
  readonly pageIndex: number;
  readonly anchorOffset: number;
  readonly headOffset: number;
  readonly anchor?: boolean;
  readonly head?: boolean;
  readonly collapsed?: boolean;
  readonly position: ReaderSelectionPart['position'];
  readonly text: string;
  readonly sortIndex: string;
}
type NativeRanges = readonly NativeRange[];
interface NativeProposal extends ReaderSelectionPart {
  readonly type?: string;
  readonly color?: string;
  readonly id?: string;
}
interface SelectionPopup {
  readonly rect: readonly number[];
  readonly annotation: NativeProposal;
}
type PopupKey = 'primaryViewSelectionPopup' | 'secondaryViewSelectionPopup';
interface NativeAnnotationManager {
  addAnnotation(annotation: NativeProposal): NativeProposal | null;
}
interface SelectionReader extends InternalReaderRuntime {
  readonly _annotationManager?: NativeAnnotationManager;
  readonly _state?: InternalReaderRuntime['_state'] &
    Partial<Record<PopupKey, SelectionPopup | null>>;
}
interface PagePaint {
  readonly pageIndex: number;
  _pushSelection(items: unknown[]): void;
}
interface SelectionView {
  readonly _iframe: HTMLIFrameElement;
  readonly _iframeWindow: Window;
  readonly _primary: boolean;
  readonly _nativeTextSelection?: { readonly enabled: boolean } | null;
  readonly _tool: { readonly type: string };
  readonly _selectedAnnotationIDs: readonly string[];
  readonly _pdfPages: Readonly<Record<number, PdfTextPage | undefined>>;
  readonly _pages: readonly PagePaint[];
  readonly action?: { readonly type: string } | null;
  _selectionRanges: NativeRanges;
  _render(pageIndexes?: readonly number[]): void;
  _getAnnotationFromSelectionRanges(
    raw: NativeRanges,
    type?: string,
    color?: string,
  ): NativeProposal | null;
  _onSetSelectionPopup(popup?: SelectionPopup): void;
  _onAddAnnotation(annotation: NativeProposal, select?: boolean): NativeProposal | null;
  _getPageLabel(pageIndex: number, fallback: boolean): string;
  _textAnnotationFocused(): boolean;
  pointerEventToPosition(event: PointerEvent): ReaderSelectionPart['position'] | null;
  getClientRectForPopup(position: ReaderSelectionPart['position']): readonly number[];
}

interface RangeFence {
  readonly range: NativeRange;
  readonly pageIndex: number;
  readonly anchorOffset: number;
  readonly headOffset: number;
  readonly anchor?: boolean;
  readonly head?: boolean;
  readonly collapsed?: boolean;
  readonly chars: readonly PdfChar[] | undefined;
}
interface Projection {
  readonly parts: readonly ReaderSelectionPart[];
  readonly pages: ReadonlyMap<number, ReaderSelectionPage>;
  readonly text: string;
}
interface Snapshot {
  readonly raw: NativeRanges;
  readonly fence: readonly RangeFence[];
  readonly projection: Projection | null;
  readonly paint: Map<number, NativeRanges>;
}
interface DomSelectionFence {
  readonly anchor: Node;
  readonly head: Node;
  readonly anchorOffset: number;
  readonly headOffset: number;
  readonly rangeCount: number;
}
interface ClassifiedLayout {
  readonly admission: ReaderTextAdmission;
  readonly glyphs: WeakMap<readonly PdfChar[], Map<number, boolean>>;
}
interface Gesture {
  readonly baseline: NativeRanges;
  layout: ClassifiedLayout | null;
  readonly pointerId: number;
  ending: boolean;
  ended: boolean;
  dom?: DomSelectionFence | null;
  contextMenu?: boolean;
  releaseStyle?: () => void;
  snapshot: Snapshot | null;
  popup?: {
    readonly raw: SelectionPopup;
    readonly shownPosition: ReaderSelectionPart['position'] | null;
  };
}
interface TaggedProposal {
  readonly snapshot: Snapshot;
  readonly original: NativeProposal;
  appearedInPopup?: boolean;
}

const gestures = new WeakMap<Window, () => boolean>();

/** Prevent the Reader UI callback from treating native mouse selection as a Neo Select operation. */
export function readerHasNativeBodyGesture(window: PdfWindow): boolean {
  return gestures.get(window)?.() ?? false;
}

function installMethod<T extends object>(
  object: object,
  key: string,
  owner: Window,
  callback: T,
): () => void {
  const previous = Object.getOwnPropertyDescriptor(object, key);
  const method = nativeObjectIdentity(cloneIntoWithFunctions({ callback }, owner).callback);
  Object.defineProperty(object, key, { configurable: true, writable: true, value: method });
  return () => {
    if (isDeadObject(object)) return;
    const current = Object.getOwnPropertyDescriptor(object, key)?.value;
    if (typeof current !== 'function' || nativeObjectIdentity(current) !== method) return;
    if (previous) Object.defineProperty(object, key, previous);
    else Reflect.deleteProperty(object, key);
  };
}

type PopupRoute = (annotation: NativeProposal) => readonly NativeProposal[] | undefined;
const managers = new WeakMap<
  NativeAnnotationManager,
  { readonly routes: Set<PopupRoute>; readonly restore: () => void }
>();

/** Both split views share a Reader manager. One patch, dispatching only exact popup payloads. */
function leasePopupCommit(
  manager: NativeAnnotationManager,
  owner: Window,
  route: PopupRoute,
): () => void {
  let lease = managers.get(manager);
  if (!lease) {
    const routes = new Set<PopupRoute>();
    const original = manager.addAnnotation;
    const restore = installMethod(manager, 'addAnnotation', owner, (annotation: NativeProposal) => {
      for (const commit of routes) {
        const parts = commit(annotation);
        if (!parts) continue;
        let first: NativeProposal | null = null;
        for (const part of parts) {
          const saved = original.call(manager, part);
          if (!saved) break;
          first ??= saved;
        }
        return first;
      }
      return original.call(manager, annotation);
    });
    lease = { routes, restore };
    managers.set(manager, lease);
  }
  lease.routes.add(route);
  return () => {
    lease.routes.delete(route);
    if (lease.routes.size || managers.get(manager) !== lease) return;
    managers.delete(manager);
    lease.restore();
  };
}

function glyphSource(pageIndex: number, char: PdfChar): ReaderTextSourceLocation {
  return {
    pageIndex,
    rect: char.rect,
    sourceBlockId: null,
    vertical: Math.abs((char.rotation ?? 0) % 180) === 90,
  };
}

function hasPositiveArea(rect: readonly number[]): boolean {
  const [left, top, right, bottom] = rect;
  return (
    rect.length === 4 &&
    Number.isFinite(left) &&
    Number.isFinite(top) &&
    Number.isFinite(right) &&
    Number.isFinite(bottom) &&
    right! > left! &&
    bottom! > top!
  );
}

function projectSelection(
  view: SelectionView,
  raw: NativeRanges,
  layout: ClassifiedLayout,
): Projection | null {
  const pages = new Map<number, ReaderSelectionPage>();
  let changed = false;
  for (const range of raw) {
    if (range.collapsed) continue;
    const { pageIndex } = range.position;
    const page = view._pdfPages[pageIndex];
    const from = Math.min(range.anchorOffset, range.headOffset);
    const to = Math.max(range.anchorOffset, range.headOffset);
    if (
      !page ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to > page.chars.length ||
      from === to
    )
      return null;
    const chars = nativeObjectIdentity(page.chars);
    let admissionByOffset = layout.glyphs.get(chars);
    if (!admissionByOffset) layout.glyphs.set(chars, (admissionByOffset = new Map()));
    let denied: number[] | undefined;
    for (let offset = from; offset < to; offset += 1) {
      // Readiness is an origin gate. Unknown glyphs on later pages pass, but a known
      // non-body glyph never comes back merely because its page isn't prepared.
      let accepted = admissionByOffset.get(offset);
      if (accepted === undefined) {
        accepted = layout.admission.accepts(glyphSource(pageIndex, chars[offset]!));
        admissionByOffset.set(offset, accepted);
      }
      if (!accepted) {
        (denied ??= []).push(offset);
      }
    }
    if (!denied) {
      const original = range.position.rects;
      let rects = original;
      for (const rect of original) {
        if (hasPositiveArea(rect)) continue;
        rects = Array.from(original).filter(hasPositiveArea);
        changed = true;
        break;
      }
      if (!rects.length) {
        changed = true;
        continue;
      }
      pages.set(pageIndex, {
        pageIndex,
        rects,
        text: range.text,
        sortIndex: range.sortIndex,
        pageLabel: view._getPageLabel(pageIndex, true),
      });
      continue;
    }
    changed = true;
    if (denied.length === to - from) continue;

    const fragments: number[][] = [];
    let rect: number[] | undefined;
    let first = -1;
    const text: string[] = [];
    let skip = 0;
    let gap = false;
    const endRun = () => {
      if (rect) fragments.push(rect);
      rect = undefined;
    };
    for (let offset = from; offset < to; offset += 1) {
      const char = page.chars[offset]!;
      if (offset === denied[skip]) {
        skip += 1;
        gap = true;
        endRun();
        continue;
      }
      const inline = char.inlineRect;
      if (!hasPositiveArea(inline)) {
        gap = true;
        endRun();
        continue;
      }
      if (first < 0) first = offset;
      if (!char.ignorable) {
        if (gap && text.length && text.at(-1) !== ' ') text.push(' ');
        gap = false;
        text.push(char.c);
        if (char.spaceAfter || char.lineBreakAfter || char.paragraphBreakAfter) text.push(' ');
      }
      if (!rect) rect = [...inline];
      else {
        rect[0] = Math.min(rect[0]!, inline[0]!);
        rect[1] = Math.min(rect[1]!, inline[1]!);
        rect[2] = Math.max(rect[2]!, inline[2]!);
        rect[3] = Math.max(rect[3]!, inline[3]!);
      }
      if (char.lineBreakAfter || char.paragraphBreakAfter) endRun();
    }
    endRun();
    if (first < 0) continue;
    const firstRect = fragments[0]!;
    const top = Math.max(0, Math.floor(page.viewBox[3]! - page.viewBox[1]! - firstRect[3]!));
    pages.set(pageIndex, {
      pageIndex,
      rects: fragments,
      text: text.join('').trim(),
      sortIndex: `${String(pageIndex).slice(0, 5).padStart(5, '0')}|${String(first).slice(0, 6).padStart(6, '0')}|${String(top).slice(0, 5).padStart(5, '0')}`,
      pageLabel: view._getPageLabel(pageIndex, true),
    });
  }
  const parts = groupReaderSelectionPages([...pages.values()]);
  if (!changed && parts.length <= 1) return null;
  return {
    parts,
    pages,
    text: parts
      .map(({ text }) => text)
      .join(' ')
      .normalize('NFC')
      .replace(/\s+/gu, ' ')
      .trim(),
  };
}

function targetElement(target: EventTarget | null): Element | null {
  const element = target as Element | null;
  return typeof element?.closest === 'function' ? element : (element?.parentElement ?? null);
}

/** Lease native desktop PDF selection to one exact mounted Reader presentation. */
export function leaseNativeBodySelection(
  reader: ReaderRuntime,
  window: PdfWindow,
  current: () => boolean,
  debug: (message: string) => void,
): () => void {
  const scope = new CleanupScope();
  try {
    return mountNativeBodySelection(reader, window, current, debug, scope);
  } catch (error) {
    scope.dispose();
    debug(`Native Body-Only selection: ${String(error)}`);
    return () => {};
  }
}

function mountNativeBodySelection(
  reader: ReaderRuntime,
  window: PdfWindow,
  current: () => boolean,
  debug: (message: string) => void,
  scope: CleanupScope,
): () => void {
  const host = reader as NativeReaderRuntime;
  const owner = host._iframeWindow;
  const internal = host._internalReader as SelectionReader | undefined;
  const presentation = currentReaderPresentation(window);
  const candidate = presentation as unknown as SelectionView | null;
  const annotationManager = internal?._annotationManager;
  if (
    !owner ||
    !internal ||
    !candidate ||
    candidate._iframeWindow !== window ||
    candidate._nativeTextSelection?.enabled ||
    typeof candidate._getAnnotationFromSelectionRanges !== 'function' ||
    typeof candidate._render !== 'function' ||
    typeof candidate.pointerEventToPosition !== 'function' ||
    typeof candidate._onSetSelectionPopup !== 'function' ||
    typeof candidate._onAddAnnotation !== 'function' ||
    typeof annotationManager?.addAnnotation !== 'function'
  )
    return () => {};
  const view = nativeObjectIdentity(candidate);
  const manager = nativeObjectIdentity(annotationManager);
  const document = window.document;
  const ownerDocument = owner.document;
  const key: PopupKey = view._primary ? 'primaryViewSelectionPopup' : 'secondaryViewSelectionPopup';
  const originalRender = view._render;
  const nativeProposal = view._getAnnotationFromSelectionRanges;
  const setPopup = view._onSetSelectionPopup;
  const onAdd = view._onAddAnnotation;
  const tagged = new WeakMap<ReaderSelectionPart['position'], TaggedProposal>();
  const paintMethods = new Map<PagePaint, () => void>();
  const emptyPaint = cloneInto<NativeRanges>([], owner);
  let gesture: Gesture | null = null;
  let painting = false;
  let renderSnapshot: Snapshot | null | undefined;
  let logged = false;
  const warn = (error: unknown) => {
    if (logged) return;
    logged = true;
    debug(`Native Body-Only selection: ${String(error)}`);
  };

  const attached = () =>
    !isDeadObject(view) &&
    !isDeadObject(window) &&
    !isDeadObject(owner) &&
    !host._isTabClosed &&
    host._internalReader === internal &&
    host._iframeWindow === owner &&
    window.document === document &&
    owner.document === ownerDocument &&
    view._iframeWindow === window &&
    (view._primary ? internal._primaryView : internal._secondaryView) === presentation;
  const live = () =>
    !scope.disposed &&
    attached() &&
    current() &&
    currentReaderPresentation(window) === presentation;
  const positionToken = (annotation: NativeProposal | null | undefined) =>
    annotation?.position ? nativeObjectIdentity(annotation.position) : undefined;
  const tag = (annotation: NativeProposal | null | undefined): TaggedProposal | undefined => {
    const token = positionToken(annotation);
    return token && tagged.get(token);
  };
  const ownsPopup = (target: EventTarget | null) =>
    !!gesture?.popup?.shownPosition &&
    !!targetElement(target)?.closest(
      `.${view._primary ? 'primary' : 'secondary'}-view .selection-popup`,
    ) &&
    positionToken(internal._state?.[key]?.annotation) === gesture.popup.shownPosition;
  const domStillMatches = (intent: Gesture): boolean => {
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      selection.isCollapsed ||
      !selection.anchorNode ||
      !selection.focusNode
    ) {
      if (intent.contextMenu || ownsPopup(ownerDocument.activeElement)) {
        // Right-click can clear the text-layer Selection without changing PdfView's canvas selection.
        intent.dom = null;
      }
      return !intent.dom;
    }
    const { dom } = intent;
    return (
      !!dom &&
      selection.anchorNode === dom.anchor &&
      selection.focusNode === dom.head &&
      selection.anchorOffset === dom.anchorOffset &&
      selection.focusOffset === dom.headOffset &&
      selection.rangeCount === dom.rangeCount
    );
  };
  const release = (intent: Gesture) => {
    const cleanup = intent.releaseStyle;
    intent.releaseStyle = undefined;
    cleanup?.();
  };
  const rawMatches = (snapshot: Snapshot): boolean => {
    const ranges = view._selectionRanges;
    return (
      ranges === snapshot.raw &&
      ranges.length === snapshot.fence.length &&
      snapshot.fence.every((fence, index) => {
        const range = ranges[index];
        return (
          range === fence.range &&
          range.position.pageIndex === fence.pageIndex &&
          range.anchorOffset === fence.anchorOffset &&
          range.headOffset === fence.headOffset &&
          range.anchor === fence.anchor &&
          range.head === fence.head &&
          range.collapsed === fence.collapsed &&
          view._pdfPages[fence.pageIndex]?.chars === fence.chars
        );
      })
    );
  };
  const restorePopup = (intent: Gesture) => {
    if (!intent.popup || !attached()) return;
    const currentPopup = internal._state?.[key];
    const { shownPosition, raw } = intent.popup;
    intent.popup = undefined;
    if (shownPosition ? positionToken(currentPopup?.annotation) === shownPosition : !currentPopup) {
      setPopup.call(view, intent.snapshot && rawMatches(intent.snapshot) ? raw : undefined);
    }
  };
  const retire = (repaint: boolean) => {
    const old = gesture;
    gesture = null;
    if (!old) return;
    release(old);
    restorePopup(old);
    if (repaint && old.snapshot?.projection && attached()) view._render();
  };
  const sync = (repaint = true): Snapshot | null => {
    const intent = gesture;
    if (!intent) return null;
    try {
      if (!live() || (intent.ended && !domStillMatches(intent))) {
        retire(repaint);
        return null;
      }
      if (intent.layout && !intent.layout.admission.current()) {
        // A lost layout becomes a raw gesture; a replacement lease cannot admit it later.
        const old = intent.snapshot;
        restorePopup(intent);
        intent.layout = null;
        release(intent);
        intent.snapshot = old && rawMatches(old) ? { ...old, projection: null } : null;
        if (repaint && old?.projection) view._render();
      }
      const ranges = view._selectionRanges;
      if (intent.snapshot && rawMatches(intent.snapshot)) return intent.snapshot;
      if (intent.ended || intent.snapshot?.raw === ranges) {
        retire(repaint);
        return null;
      }
      if (
        ranges === intent.baseline ||
        !ranges.length ||
        ranges[0]?.collapsed ||
        view.action?.type !== 'selectText'
      )
        return null;
      const snapshot: Snapshot = {
        raw: ranges,
        fence: Array.from(ranges, (range) => ({
          range,
          pageIndex: range.position.pageIndex,
          anchorOffset: range.anchorOffset,
          headOffset: range.headOffset,
          anchor: range.anchor,
          head: range.head,
          collapsed: range.collapsed,
          chars: view._pdfPages[range.position.pageIndex]?.chars,
        })),
        projection: intent.layout ? projectSelection(view, ranges, intent.layout) : null,
        paint: new Map(),
      };
      intent.snapshot = snapshot;
      return snapshot;
    } catch (error) {
      retire(false);
      warn(error);
      return null;
    }
  };

  const mountPagePaint = () => {
    for (const [page, restore] of paintMethods) {
      if (view._pages.includes(page)) continue;
      paintMethods.delete(page);
      restore();
    }
    for (const page of view._pages) {
      if (paintMethods.has(page) || typeof page._pushSelection !== 'function') continue;
      const original = page._pushSelection;
      const restore = installMethod(page, '_pushSelection', owner, (items: unknown[]) => {
        const snapshot = renderSnapshot === undefined ? sync(false) : renderSnapshot;
        if (!snapshot?.projection) return original.call(page, items);
        const pageData = snapshot.projection.pages.get(page.pageIndex);
        let projected = emptyPaint;
        const fence =
          pageData && snapshot.fence.find(({ pageIndex }) => pageIndex === page.pageIndex);
        if (pageData && fence) {
          const cached = snapshot.paint.get(page.pageIndex);
          projected =
            cached ??
            cloneInto<NativeRanges>(
              [
                {
                  ...fence.range,
                  sortIndex: pageData.sortIndex,
                  text: pageData.text,
                  position: { pageIndex: pageData.pageIndex, rects: pageData.rects },
                },
              ],
              owner,
            );
          if (!cached) snapshot.paint.set(page.pageIndex, projected);
        }
        const raw = view._selectionRanges;
        const previous = painting;
        // Page._pushSelection is synchronous. Only inside this paint call does the native
        // overlay see filtered rects; pointer/keyboard logic always sees native offsets.
        view._selectionRanges = projected;
        painting = true;
        try {
          original.call(page, items);
        } finally {
          painting = previous;
          if (view._selectionRanges === projected) view._selectionRanges = raw;
        }
      });
      paintMethods.set(page, restore);
    }
  };

  const buildCommit = (
    annotation: NativeProposal,
    record: TaggedProposal,
    snapshot: Snapshot | null,
  ): readonly NativeProposal[] => {
    if (snapshot !== record.snapshot) {
      return [
        cloneInto(
          { ...annotation, ...record.original, type: annotation.type, color: annotation.color },
          owner,
        ),
      ];
    }
    return snapshot.projection!.parts.map((part) => cloneInto({ ...annotation, ...part }, owner));
  };
  const hasGesture = () => {
    const selected = sync();
    return !!gesture && (!gesture.ended || !!selected);
  };
  const editable = (target: EventTarget | null) =>
    !!targetElement(target)?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    );

  try {
    scope.add(() => {
      for (const restore of paintMethods.values()) {
        try {
          restore();
        } catch (error) {
          warn(error);
        }
      }
      paintMethods.clear();
    });
    mountPagePaint();
    scope.add(
      installMethod(view, '_render', owner, (pages?: readonly number[]) => {
        const previous = renderSnapshot;
        try {
          try {
            mountPagePaint();
          } catch (error) {
            warn(error);
          }
          renderSnapshot = sync(false);
          originalRender.call(view, pages);
        } finally {
          renderSnapshot = previous;
        }
      }),
    );
    scope.add(
      installMethod(
        view,
        '_getAnnotationFromSelectionRanges',
        owner,
        (raw: NativeRanges, type?: string, color?: string) => {
          const snapshot = !painting && raw === view._selectionRanges ? sync() : null;
          const original = nativeProposal.call(view, raw, type, color);
          if (!original || !snapshot?.projection) return original;
          const projected = cloneInto({ ...original, ...snapshot.projection.parts[0] }, owner);
          tagged.set(nativeObjectIdentity(projected.position), {
            snapshot,
            original: cloneInto(original, owner),
          });
          return projected;
        },
      ),
    );
    scope.add(
      installMethod(view, '_onSetSelectionPopup', owner, (requested?: SelectionPopup) => {
        const record = requested && tag(requested.annotation);
        const snapshot = record && sync();
        if (!record || !requested || !gesture || snapshot !== record.snapshot) {
          if (gesture) gesture.popup = undefined;
          return setPopup.call(
            view,
            record && requested
              ? cloneInto({ ...requested, annotation: record.original }, owner)
              : requested,
          );
        }
        const raw = cloneInto({ ...requested, annotation: record.original }, owner);
        const part = snapshot.projection!.parts[0];
        if (part) {
          // Keep the annotation position identity when passing the owning popup into Reader.
          const position = cloneInto(
            { pageIndex: part.position.pageIndex, rects: part.position.rects },
            owner,
          );
          const popupRequest = cloneInto(
            { ...requested, rect: view.getClientRectForPopup(position) },
            owner,
          );
          Object.defineProperty(popupRequest, 'annotation', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: requested.annotation,
          });
          record.appearedInPopup = true;
          gesture.popup = { raw, shownPosition: positionToken(requested.annotation)! };
          return setPopup.call(view, popupRequest);
        }
        gesture.popup = { raw, shownPosition: null };
        return setPopup.call(view);
      }),
    );
    scope.add(
      installMethod(
        view,
        '_onAddAnnotation',
        owner,
        (annotation: NativeProposal, select?: boolean) => {
          const record = tag(annotation);
          if (
            !record ||
            annotation.id ||
            !['highlight', 'underline'].includes(annotation.type ?? '')
          ) {
            return onAdd.call(view, annotation, select);
          }
          let first: NativeProposal | null = null;
          for (const part of buildCommit(annotation, record, sync())) {
            const saved: NativeProposal | null = onAdd.call(view, part, first ? false : select);
            if (!saved) break;
            first ??= saved;
          }
          return first;
        },
      ),
    );
    scope.add(
      leasePopupCommit(manager, owner, (annotation) => {
        if (!['highlight', 'underline'].includes(annotation.type ?? '') || annotation.id)
          return undefined;
        const record = tag(annotation);
        if (!record?.appearedInPopup) return undefined;
        const owned =
          positionToken(internal._state?.[key]?.annotation) === positionToken(annotation);
        return buildCommit(annotation, record, owned ? sync() : null);
      }),
    );

    scope.addEventListener(
      window,
      'pointerdown',
      (event) => {
        const pointer = event as PointerEvent;
        if (pointer.isPrimary === false) return;
        if (
          pointer.button === 2 &&
          gesture?.ended &&
          !editable(pointer.target) &&
          targetElement(pointer.target)?.closest('#viewerContainer')
        ) {
          gesture.contextMenu = true;
          sync();
        }
        if (pointer.button !== 0) return;
        const previous = sync();
        const mayExtend = !!gesture?.layout && !!previous;
        retire(true);
        if (
          !live() ||
          view._nativeTextSelection?.enabled ||
          editable(pointer.target) ||
          !targetElement(pointer.target)?.closest('#viewerContainer') ||
          !['pointer', 'highlight', 'underline'].includes(view._tool.type)
        )
          return;
        const intent: Gesture = {
          baseline: view._selectionRanges,
          layout: null,
          pointerId: pointer.pointerId,
          ending: false,
          ended: false,
          snapshot: null,
        };
        gesture = intent;
        if (pointer.altKey || (pointer.shiftKey && !mayExtend && intent.baseline.length)) return;
        try {
          const admission = captureReaderTextAdmission(window);
          if (!admission?.current()) return;
          const position = view.pointerEventToPosition(pointer);
          const point = position?.rects[0];
          if (!position || !point) return;
          const [x, y] = point;
          if (x === undefined || y === undefined) return;
          const chars = view._pdfPages[position.pageIndex]?.chars;
          if (!chars) return;
          let offset = 0;
          for (; offset < chars.length; offset += 1) {
            const { rect } = chars[offset]!;
            if (
              x >= rect[0]! &&
              y >= rect[1]! &&
              x <= rect[2]! &&
              y <= rect[3]! &&
              hasPositiveArea(rect)
            )
              break;
          }
          const char = chars[offset];
          if (!char) return;
          const source = glyphSource(position.pageIndex, char);
          if (!admission.ready(source) || !admission.accepts(source)) return;
          intent.releaseStyle = activateReaderTextFilter(window);
          intent.layout = {
            admission,
            glyphs: new WeakMap([[nativeObjectIdentity(chars), new Map([[offset, true]])]]),
          };
        } catch (error) {
          warn(error);
        }
      },
      true,
    );
    scope.addEventListener(
      window,
      'pointerup',
      (event) => {
        const intent = gesture;
        if (
          !intent ||
          intent.pointerId !== (event as PointerEvent).pointerId ||
          intent.ending ||
          intent.ended
        )
          return;
        release(intent);
        intent.ending = true;
        sync();
        // Native pointerup builds the SelectionPopup (or saves the active annotation tool) synchronously.
        queueMicrotask(() => {
          if (gesture !== intent) return;
          const selection = sync();
          if (!selection) return retire(true);
          const dom = window.getSelection();
          intent.dom =
            dom?.rangeCount && !dom.isCollapsed && dom.anchorNode && dom.focusNode
              ? {
                  anchor: dom.anchorNode,
                  head: dom.focusNode,
                  anchorOffset: dom.anchorOffset,
                  headOffset: dom.focusOffset,
                  rangeCount: dom.rangeCount,
                }
              : null;
          intent.ended = true;
        });
      },
      true,
    );
    scope.addEventListener(
      document,
      'selectionchange',
      () => {
        if (gesture?.ended) sync();
      },
      true,
    );
    scope.addEventListener(
      window,
      'pointercancel',
      (event) => {
        if (gesture && !gesture.ended && gesture.pointerId === (event as PointerEvent).pointerId) {
          retire(true);
        }
      },
      true,
    );
    scope.addEventListener(
      window,
      'focusin',
      (event) => {
        const target = event.target;
        if (
          editable(target) ||
          (target !== window &&
            target !== document &&
            target !== document.body &&
            target !== document.documentElement &&
            !targetElement(target)?.closest('#viewerContainer'))
        ) {
          retire(true);
        } else if (gesture) {
          sync();
          if (gesture) gesture.contextMenu = false;
        }
      },
      true,
    );
    const leave = (event: Event) => {
      if (event.target !== view._iframe && !ownsPopup(event.target)) retire(true);
    };
    scope.addEventListener(ownerDocument, 'focusin', leave, true);
    scope.addEventListener(ownerDocument, 'pointerdown', leave, true);
    scope.addEventListener(
      window,
      'contextmenu',
      (event) => {
        // A native chrome menu does not necessarily surface a Reader focusin event.
        if (
          !editable(event.target) &&
          targetElement(event.target)?.closest('#viewerContainer') &&
          sync() &&
          gesture
        )
          gesture.contextMenu = true;
      },
      true,
    );
    scope.addEventListener(
      window,
      'focus',
      (event) => {
        if (event.target !== window || !gesture) return;
        sync();
        if (gesture) gesture.contextMenu = false;
      },
      true,
    );
    scope.addEventListener(
      window,
      'blur',
      (event) => {
        if (event.target !== window || !gesture) return;
        const intent = gesture;
        queueMicrotask(() => {
          if (gesture !== intent || !attached()) return;
          const active = ownerDocument.activeElement;
          if (
            ownsPopup(active) ||
            intent.contextMenu ||
            (active === view._iframe && ownerDocument.hasFocus())
          )
            return;
          retire(true);
        });
      },
      true,
    );
    scope.addEventListener(window, 'pagehide', () => retire(false), true);
    scope.addEventListener(
      window,
      'copy',
      (event) => {
        const copy = event as ClipboardEvent;
        if (
          !copy.clipboardData ||
          !gesture ||
          view._selectedAnnotationIDs.length ||
          view._textAnnotationFocused() ||
          editable(copy.target)
        )
          return;
        const snapshot = sync();
        if (!snapshot?.projection) return;
        // The pinned listener is bound at init and calls stopPropagation (not immediate).
        // It already serialized a filtered native proposal for one legal part; keep its rich
        // formats. For multipart or empty selections, drop the earlier raw/native payload.
        if (snapshot.raw.length > 2 || snapshot.projection.parts.length !== 1)
          copy.clipboardData.clearData();
        copy.clipboardData.setData('text/plain', snapshot.projection.text);
        copy.preventDefault();
        copy.stopPropagation();
      },
      true,
    );
    gestures.set(window, hasGesture);
    scope.add(() => {
      if (gestures.get(window) === hasGesture) gestures.delete(window);
    });
  } catch (error) {
    scope.dispose();
    warn(error);
  }
  return () => {
    try {
      retire(true);
    } catch (error) {
      warn(error);
    } finally {
      scope.dispose();
    }
  };
}
