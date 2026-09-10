import type { ActionId } from '../input/actions';
import type { Mode } from '../input/bindings';

export type ReaderTimer = number | NodeJS.Timeout;

export const COLORS = {
  yellow: '#ffd400',
  red: '#ff6666',
  green: '#5fb236',
  blue: '#2ea8e5',
  purple: '#a28ae5',
} as const;

export type AnnotationColor = (typeof COLORS)[keyof typeof COLORS];
export type ReaderMode = Exclude<Mode, 'main'>;

export type ReaderRuntime = _ZoteroTypes.ReaderInstance & {
  readonly _instanceID?: string;
  readonly itemID?: number;
  readonly _iframeWindow?: Window;
  readonly _internalReader?: InternalReaderRuntime;
};

export interface InternalReaderRuntime {
  readonly _primaryView?: ReaderViewRuntime;
  readonly _secondaryView?: ReaderViewRuntime;
  readonly _lastView?: ReaderViewRuntime;
  readonly _state?: {
    readonly selectedAnnotationIDs?: readonly string[];
    readonly primaryViewFindState?: { readonly active?: boolean };
    readonly secondaryViewFindState?: { readonly active?: boolean };
  };
  _enableAnnotationDeletionFromComment?: boolean;
  navigateToPreviousPage?(): void;
  navigateToNextPage?(): void;
  navigateToFirstPage?(): void;
  navigateToLastPage?(): void;
  navigate?(payload: {
    readonly pageIndex?: number;
    readonly annotationID?: string;
    readonly position?: ReaderLinkPosition;
  }): void;
  navigateBack?(): void;
  navigateForward?(): void;
  setSelectedAnnotations?(keys: readonly string[]): void;
  toggleFindPopup?(options: { readonly open: boolean }): void;
  findNext?(): void;
  findPrevious?(): void;
  setFilter?(filter: { readonly colors: readonly string[] }): void;
  toggleSidebar?(): void;
  setSidebarOpen?(options: { readonly open: boolean } | boolean): void;
  setSidebarView?(options: { readonly view: 'outline' } | 'outline'): void;
  toggleSplit?(options: { readonly type: 'horizontal' | 'vertical' }): void;
  focusSplit?(options: { readonly direction: 'left' | 'right' | 'up' | 'down' }): void;
}

export interface ReaderViewRuntime {
  readonly _iframeWindow?: Window;
  readonly _findState?: { readonly active?: boolean };
  readonly _pdfPages?:
    | Readonly<Record<number, ReaderPdfPageRuntime | undefined>>
    | readonly (ReaderPdfPageRuntime | undefined)[];
  readonly _annotationRenderRootEl?:
    | Element
    | {
        readonly shadowRoot?: ShadowRoot | null;
        querySelector?(selectors: string): Element | null;
      };
  _onKeyDown?: (event: KeyboardEvent) => unknown;
  _onOpenLink?: (url: string) => void | Promise<void>;
  _textAnnotationFocused?: () => boolean;
  getClientRectForPopup?(position: ReaderLinkPosition): readonly number[];
  navigate?(payload: { readonly position: ReaderLinkPosition }): void | Promise<void>;
  navigateToNextPage?(): void;
}

export interface ReaderLinkPosition {
  readonly pageIndex: number;
  readonly rects: readonly (readonly number[])[];
  readonly nextPageRects?: readonly (readonly number[])[];
}

export type ReaderLinkOverlay =
  | {
      readonly type: 'internal-link';
      readonly position: ReaderLinkPosition;
      readonly destinationPosition: ReaderLinkPosition;
    }
  | {
      readonly type: 'citation';
      readonly position: ReaderLinkPosition;
      readonly references: readonly { readonly position: ReaderLinkPosition }[];
    }
  | {
      readonly type: 'external-link';
      readonly position: ReaderLinkPosition;
      readonly url: string;
    };

export interface ReaderPdfPageRuntime {
  readonly overlays?: readonly (ReaderLinkOverlay | { readonly type?: string })[];
}

export interface PdfViewerRuntime {
  currentPageNumber?: number;
  readonly container?: HTMLElement;
  readonly _pageLabels?: readonly string[];
  readonly _pages?: readonly PdfPageViewRuntime[];
  getPageView?(index: number): PdfPageViewRuntime | undefined;
}

export interface PdfPageViewRuntime {
  readonly viewport?: {
    readonly scale: number;
    readonly height: number;
    convertToPdfPoint?(x: number, y: number): readonly [number, number];
  };
}

export interface PdfDocumentRuntime {
  getOutline?(): Promise<readonly OutlineSourceNode[] | null>;
  getDestination?(destination: string): Promise<unknown>;
  getPageIndex?(reference: unknown): Promise<number>;
  getPage?(page: number): Promise<{
    getViewport(options: { readonly scale: number }): {
      readonly width: number;
      readonly height: number;
    };
  }>;
}

export interface PdfApplicationRuntime {
  readonly pdfViewer?: PdfViewerRuntime;
  readonly pdfDocument?: PdfDocumentRuntime;
  readonly pdfLinkService?: {
    getDestinationHash?(destination: unknown): string;
    setHash?(hash: string): void;
    goToDestination?(destination: unknown): Promise<unknown>;
    navigateTo?(destination: unknown): Promise<unknown>;
  };
}

export interface PdfWindow extends Window {
  readonly PDFViewerApplication?: PdfApplicationRuntime;
}

export interface AnnotationRuntime {
  readonly id?: number;
  readonly key: string;
  libraryID?: number;
  readonly deleted?: boolean;
  annotationType?: string;
  annotationColor?: string;
  annotationText?: string;
  annotationComment?: string;
  annotationPosition?: string;
  annotationSortIndex?: string;
  annotationPageLabel?: string;
  readonly tags?: readonly { readonly tag: string }[];
  loadDataType?(dataType: 'annotation'): Promise<unknown>;
  saveTx(): Promise<unknown>;
  eraseTx?(): Promise<unknown>;
}

export interface AnnotationDraft extends AnnotationRuntime {
  libraryID: number;
  parentID: number;
  annotationIsExternal: boolean;
}
export interface ItemRuntime extends AnnotationRuntime {
  readonly parentItemID?: number;
  readonly parentID?: number;
  readonly itemType?: string;
  getAnnotations?(): readonly AnnotationRuntime[];
  getField?(field: 'extra'): string;
  setField?(field: 'extra', value: string): void;
}

export interface Mark {
  readonly pageIndex: number | null;
  readonly ratio: number;
  readonly key: string | null;
  readonly ts: number;
}

export interface MarksPayload {
  readonly v: 1;
  readonly marks: Readonly<Record<string, Omit<Mark, 'ts'>>>;
}

export interface OutlineSourceNode {
  readonly title?: string;
  readonly label?: string;
  readonly dest?: unknown;
  readonly url?: string;
  readonly pageIndex?: number;
  readonly items?: readonly OutlineSourceNode[];
  readonly children?: readonly OutlineSourceNode[];
}

export interface OutlineNode {
  readonly id: string;
  readonly parentID: string | null;
  readonly depth: number;
  readonly title: string;
  readonly dest: unknown;
  readonly url: string | null;
  pageIndex: number | null;
  expanded: boolean;
  children: OutlineNode[];
  hint: string;
}

export interface Pointer {
  readonly textNode: Text;
  readonly offset: number;
}

export interface SmoothHold {
  active: boolean;
  releasing: boolean;
  key: string | null;
  axis: 'x' | 'y' | null;
  direction: -1 | 0 | 1;
  speed: number;
  rafId: number | null;
  lastTimestamp: number;
}

export interface ViewHandlers {
  readonly keyDown: EventListener;
  readonly keyUp: EventListener;
  readonly blur: EventListener;
  readonly selection: EventListener;
  readonly resize: EventListener;
  readonly scroll: EventListener;

  readonly scrollElement: Element | null;
}
export interface OutlineState {
  open: boolean;
  loading: boolean;
  tree: OutlineNode[] | null;
  visible: OutlineNode[];
  selected: number;
  overlay: HTMLElement | null;
  list: HTMLElement | null;
  status: HTMLElement | null;
  themeCleanup: (() => void) | null;
  hintBuffer: string;
  hintTimer: ReaderTimer | null;
  commandBuffer: string;
  commandTimer: ReaderTimer | null;
}

export interface ReaderSessionState {
  mode: ReaderMode;
  keyBuffer: string;
  countBuffer: string;
  keyTimeout: ReaderTimer | null;
  selectionParams: AnnotationSelectionParams | null;
  indicator: HTMLElement | null;
  indicatorThemeCleanup: (() => void) | null;
  activePdfWindow: PdfWindow;
  visualAnchor: Pointer | null;
  visualPreferredX: number | null;
  cursorPreferredX: number | null;
  hintBadges: HintBadge[];
  hintBuffer: string;
  hintStage: 'coarse' | 'fine' | null;
  hintTargetMode: ReaderMode | null;
  hintStarts: Pointer[];
  hintRepositionFrame: number | null;
  linkHintBadges: LinkHintBadge[];
  linkHintBuffer: string;
  linkHintWindow: PdfWindow | null;
  linkHintRepositionFrame: number | null;
  destinationCue: HTMLElement | null;
  destinationCuePosition: ReaderLinkPosition | null;
  destinationCueWindow: PdfWindow | null;
  destinationCueTimer: ReaderTimer | null;
  destinationCueRepositionFrame: number | null;
  marks: Record<string, Mark>;
  marksExplorerOpen: boolean;
  marksExplorerSelected: number;
  marksOverlay: HTMLElement | null;
  marksList: HTMLElement | null;
  marksThemeCleanup: (() => void) | null;
  outline: OutlineState;
  sidebarOutlineIndex: number;
  filterColor: AnnotationColor | null;
  lastAnnotationKey: string | null;
  smoothHold: SmoothHold;
  commentOverlay: HTMLElement | null;
  commentInput: HTMLTextAreaElement | null;
  commentThemeCleanup: (() => void) | null;
  commentItemID: number | null;
  commentLibraryID: number | null;
  commentAutosaveTimer: ReaderTimer | null;
  composing: boolean;
  insertSession: number;
  insertWatchdog: ReaderTimer | null;
  previousDeleteFromComment: boolean | undefined;
  popupGuard: MutationObserver | null;
}

export interface AnnotationSelectionParams {
  readonly annotation: {
    readonly text?: string;
    readonly sortIndex?: string;
    readonly pageLabel?: string;
    readonly position?: string | unknown;
  };
  readonly onAddAnnotation?: unknown;
}

export interface HintBadge {
  readonly element: HTMLElement;
  readonly label: string;
  readonly textNode: Text;
  readonly offset: number;
}

export interface LinkHintBadge {
  readonly element: HTMLElement;
  readonly label: string;
  readonly overlay: ReaderLinkOverlay;
}

export interface ReaderEventRuntime {
  readonly reader?: ReaderRuntime;
  readonly params?: AnnotationSelectionParams;
}

export type ReaderAction = ActionId;
