import type { MainWindow } from '../../core/contracts';
import type {
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderNativeOutlineEntry,
} from '../../reader/types';
import type { ReaderRuntime } from './contracts';

/** Native structures are confined to Toolkit; casts preserve the host object's identity. */
export type NativeReaderRuntime = ReaderRuntime & {
  readonly _instanceID?: string;
  readonly _isTabClosed?: boolean;
  readonly _iframeWindow?: Window;
  readonly _window?: MainWindow & { readonly ZoteroContextPane?: { focus?(): boolean | void } };
  readonly _internalReader?: InternalReaderRuntime;
  readonly _isReaderInitialized?: boolean;
  readonly _initPromise?: Promise<unknown>;
};

interface NativeReaderFindState {
  readonly active?: boolean;
  readonly popupOpen?: boolean;
  readonly query?: string;
}

export interface InternalReaderRuntime {
  readonly _primarySDTView?: NativeReaderViewRuntime;
  readonly _secondarySDTView?: NativeReaderViewRuntime;
  readonly _primaryView?: NativeReaderViewRuntime;
  readonly _secondaryView?: NativeReaderViewRuntime;
  readonly _lastView?: NativeReaderViewRuntime;
  readonly _lastViewPrimary?: boolean;
  readonly _state?: {
    readonly annotations?: readonly NativeReaderAnnotationRuntime[];
    readonly filter?: object;
    readonly showAnnotations?: boolean;
    readonly primaryReadingModeEnabled?: boolean;
    readonly secondaryReadingModeEnabled?: boolean;
    readonly selectedAnnotationIDs?: readonly string[];
    readonly primaryViewFindState?: NativeReaderFindState;
    readonly secondaryViewFindState?: NativeReaderFindState;
    readonly primary?: boolean;
    readonly sidebarOpen?: boolean;
    readonly sidebarView?: 'outline' | 'annotations' | 'thumbnails';
    readonly outline?: readonly ReaderNativeOutlineEntry[] | null;
    readonly pageLabels?: readonly string[];
  };
  readonly splitType?: 'horizontal' | 'vertical' | null;
  _enableAnnotationDeletionFromComment?: boolean;
  navigateToPreviousPage?(): void;
  navigateToNextPage?(): void;
  zoomIn?(): void;
  zoomOut?(): void;
  zoomReset?(): void;
  navigate?(
    payload: {
      readonly pageIndex?: number;
      readonly pageLabel?: string;
      readonly pageNumber?: string;
      readonly annotationID?: string;
      readonly position?: ReaderLinkPosition;
      readonly dest?: unknown;
    },
    options?: { readonly skipHistory?: boolean },
  ): void | Promise<void>;
  setSelectedAnnotations?(keys: readonly string[]): void;
  toggleFindPopup?(options: { readonly primary?: boolean; readonly open: boolean }): void;
  findNext?(): void;
  findPrevious?(): void;
  setFilter?(filter: { readonly colors: readonly string[] }): void;
  toggleSidebar?(open?: boolean): void;
  setSidebarView?(view: 'outline' | 'annotations' | 'thumbnails'): void;
  toggleHorizontalSplit?(enable?: boolean): void;
  toggleVerticalSplit?(enable?: boolean): void;
  focusView?(primary?: boolean): void;
  _setReadingMode?(primary: boolean, enabled: boolean): Promise<void>;
}

export interface ReaderFindControllerRuntime {
  _state?: object | null;
  _selected?: { readonly pageIdx: number; readonly matchIdx: number };
  _onNavigate?: (pageIndex: number, matchIndex: number) => unknown;
  _onUpdateState?: (state: unknown) => unknown;
  find?(state: object): void;
  _updateMatch?(...args: unknown[]): unknown;
  getMatchPositionsAsync?(pageIndex: number): Promise<readonly ReaderLinkPosition[]>;
}

export interface NativeReaderAnnotationRuntime {
  readonly id?: string;
  readonly type?: string;
  readonly text?: string;
  readonly comment?: string;
  readonly _hidden?: boolean;
  readonly position?: {
    readonly pageIndex?: number;
    readonly rects?: readonly (readonly number[])[];
    readonly nextPageRects?: readonly (readonly number[])[];
    readonly rotation?: number;
  };
}

export interface NativeReaderViewRuntime {
  toDisplayedRange?(position: object): Range | null;
  getAnnotationFromRange?(
    range: Range,
    type: 'highlight',
  ): {
    readonly position: ReaderLinkPosition;
    readonly sortIndex: string;
    readonly pageLabel: string;
  } | null;
  readonly _iframeWindow?: Window;
  /** AnnotationManager's already-filtered list passed to this exact view. */
  readonly _annotations?: readonly NativeReaderAnnotationRuntime[];
  readonly _pages?: readonly {
    readonly _pageIndex: number;
  }[];
  readonly initializedPromise?: Promise<unknown>;
  readonly _history?: ReaderPdfHistoryRuntime;
  readonly _findState?: { readonly active?: boolean };
  readonly _findController?: ReaderFindControllerRuntime;
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
  _scrolling?: boolean;
  _pageLabelsPromise?: unknown;
  _pushHistoryPoint?(): Promise<unknown> | unknown;
  /** Native PDFView loader; does not change sidebar UI. */
  setSidebarView?(view: 'outline' | 'annotations' | 'thumbnails'): void | Promise<void>;
  navigateToPosition?(position: ReaderLinkPosition, options?: unknown): void | Promise<void>;
  getClientRectForPopup?(position: ReaderLinkPosition): readonly number[];
  getPositionBoundingViewRect?(position: ReaderLinkPosition): readonly number[];
  navigate?(
    payload:
      | { readonly position: ReaderLinkPosition }
      | { readonly dest: unknown }
      | { readonly pageIndex: number }
      | { readonly pageLabel: string }
      | { readonly pageNumber: string }
      | { readonly annotationID: string },
    options?: { readonly skipHistory?: boolean; readonly block?: 'start' | 'center' | 'nearest' },
  ): void | Promise<void>;
  focus?(): void;
  navigateToNextPage?(): void;
}

export interface ReaderPdfHistoryLocationRuntime {
  readonly dest?: readonly unknown[];
}

export interface ReaderPdfHistoryRuntime {
  readonly _currentLocation?: ReaderPdfHistoryLocationRuntime | null;
  save?: (location: ReaderPdfHistoryLocationRuntime, transient?: boolean) => unknown;
}

export interface ReaderPdfPageRuntime {
  readonly overlays?: readonly (ReaderLinkOverlay | { readonly type?: string })[];
}

export interface PdfViewerRuntime {
  currentPageNumber?: number;
  readonly pagesCount?: number;
  readonly container?: HTMLElement;
  readonly _location?: { readonly pageNumber: number; readonly top: number; readonly left: number };
  readonly _pageLabels?: readonly string[];
  readonly _pages?: readonly PdfPageViewRuntime[];
  update?(): void;
  getPageView?(index: number): PdfPageViewRuntime | undefined;
}

export interface PdfPageViewRuntime {
  readonly div?: HTMLElement;
  readonly viewport?: {
    readonly scale: number;
    readonly height: number;
    convertToPdfPoint?(x: number, y: number): readonly [number, number];
  };
}

export interface PdfViewportRuntime {
  readonly width: number;
  readonly height: number;
  convertToViewportRectangle?(rect: readonly number[]): readonly number[];
}

export interface PdfRenderTaskRuntime {
  readonly promise: Promise<void>;
  cancel(): void;
}

export interface PdfDocumentRuntime {
  readonly numPages?: number;
  getDestination?(destination: string): Promise<unknown>;
  getPageIndex?(reference: unknown): Promise<number>;
  getPage?(page: number): Promise<{
    readonly view?: readonly number[];
    readonly rotate?: number;
    readonly _pageInfo?: { readonly view: readonly number[]; readonly rotate?: number };
    getViewport(options: { readonly scale: number }): PdfViewportRuntime;
    render?(options: {
      readonly viewport: PdfViewportRuntime;
      readonly canvasContext: CanvasRenderingContext2D;
      readonly transform: readonly number[];
      readonly annotationMode: number;
    }): PdfRenderTaskRuntime;
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

export interface NativePdfWindow extends Window {
  readonly PDFViewerApplication?: PdfApplicationRuntime;
}
