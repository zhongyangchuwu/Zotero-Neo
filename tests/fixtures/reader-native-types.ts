import type { MainWindow } from '../../src/core/contracts';
import type {
  ReaderLinkOverlay,
  ReaderLinkPosition,
  ReaderNativeOutlineEntry,
} from '../../src/reader/types';
import type { ReaderRuntime as ReaderHandle } from '../../src/toolkit/reader/contracts';

/** Structural host fixtures. Business code deliberately cannot access these fields. */
export interface ReaderRuntime extends ReaderHandle {
  readonly _instanceID?: string;
  readonly _isTabClosed?: boolean;
  readonly _iframeWindow?: Window;
  readonly _window?: MainWindow;
  readonly _internalReader?: InternalReaderRuntime;
  readonly _isReaderInitialized?: boolean;
  readonly _initPromise?: Promise<unknown>;
}

export interface InternalReaderRuntime {
  readonly _primaryView?: ReaderViewRuntime;
  readonly _secondaryView?: ReaderViewRuntime;
  readonly _lastView?: ReaderViewRuntime;
  readonly _lastViewPrimary?: boolean;
  readonly _state?: {
    readonly selectedAnnotationIDs?: readonly string[];
    readonly primaryViewFindState?: { readonly active?: boolean };
    readonly secondaryViewFindState?: { readonly active?: boolean };
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
  toggleFindPopup?(options: { readonly open: boolean }): void;
  findNext?(): void;
  findPrevious?(): void;
  setFilter?(filter: { readonly colors: readonly string[] }): void;
  toggleSidebar?(open?: boolean): void;
  setSidebarView?(view: 'outline' | 'annotations' | 'thumbnails'): void;
  toggleHorizontalSplit?(enable?: boolean): void;
  toggleVerticalSplit?(enable?: boolean): void;
  focusView?(primary?: boolean): void;
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

export interface ReaderViewRuntime {
  readonly _iframeWindow?: Window;
  readonly initializedPromise?: Promise<unknown>;
  readonly _history?: ReaderPdfHistoryRuntime;
  readonly _findState?: { readonly active?: boolean };
  readonly _findController?: ReaderFindControllerRuntime;
  readonly _pdfPages?:
    | Readonly<
        Record<
          number,
          | { readonly overlays?: readonly (ReaderLinkOverlay | { readonly type?: string })[] }
          | undefined
        >
      >
    | readonly (
        | { readonly overlays?: readonly (ReaderLinkOverlay | { readonly type?: string })[] }
        | undefined
      )[];
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

export interface PdfWindow extends Window {
  readonly PDFViewerApplication?: {
    readonly pdfViewer?: {
      currentPageNumber?: number;
      readonly pagesCount?: number;
      readonly container?: HTMLElement;
      readonly _location?: {
        readonly pageNumber: number;
        readonly top: number;
        readonly left: number;
      };
      readonly _pageLabels?: readonly string[];
      readonly _pages?: readonly PdfPageView[];
      update?(): void;
      getPageView?(index: number): PdfPageView | undefined;
    };
    readonly pdfDocument?: {
      getDestination?(destination: string): Promise<unknown>;
      getPageIndex?(reference: unknown): Promise<number>;
      getPage?(page: number): Promise<{
        getViewport(options: { readonly scale: number }): {
          readonly width: number;
          readonly height: number;
        };
      }>;
    };
    readonly pdfLinkService?: {
      getDestinationHash?(destination: unknown): string;
      setHash?(hash: string): void;
      goToDestination?(destination: unknown): Promise<unknown>;
      navigateTo?(destination: unknown): Promise<unknown>;
    };
  };
}

interface PdfPageView {
  readonly div?: HTMLElement;
  readonly viewport?: {
    readonly scale: number;
    readonly height: number;
    convertToPdfPoint?(x: number, y: number): readonly [number, number];
  };
}
