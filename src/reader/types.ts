import type { ReaderRuntime } from '../toolkit/reader';
export type { PdfWindow, ReaderRuntime, ReaderViewRuntime } from '../toolkit/reader';
import type { ActionId } from '../input/actions';

export type ReaderTimer = number | NodeJS.Timeout;

export const COLORS = {
  yellow: '#ffd400',
  red: '#ff6666',
  green: '#5fb236',
  blue: '#2ea8e5',
  purple: '#a28ae5',
} as const;

export type AnnotationColor = (typeof COLORS)[keyof typeof COLORS];
export type ReaderMode = 'normal' | 'visual';

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

/** Native Reader navigation entries; kind and numbering are not document metadata fields. */
export interface ReaderNativeOutlineEntry {
  readonly title: string;
  readonly items?: readonly ReaderNativeOutlineEntry[];
  /** Zotero 10.0.6 native Outline resolves PDF destinations to a position before publishing. */
  readonly location?: { readonly position: ReaderLinkPosition };
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly matched?: boolean;
  readonly childMatched?: boolean;
}

export interface Pointer {
  readonly textNode: Text;
  readonly offset: number;
}

export interface ReaderSessionState {
  selectionParams: AnnotationSelectionParams | null;
  indicator: HTMLElement | null;
  indicatorThemeCleanup: (() => void) | null;
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

export interface ReaderEventRuntime {
  readonly reader?: ReaderRuntime;
  readonly params?: AnnotationSelectionParams;
}

export type ReaderAction = ActionId;
