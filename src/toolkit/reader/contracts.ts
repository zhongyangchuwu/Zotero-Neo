/** Stable identity of a host Reader. The handle is the actual host object, never a wrapper. */
export interface ReaderRuntime {
  readonly itemID?: number;
  readonly tabID?: string;
  focus?(): void | Promise<void>;
}

/** Opaque native view identity; capabilities must resolve private state internally. */
export type ReaderViewRuntime = object;

export type PdfWindow = Window;

export type ComputedAnnotationPosition =
  | {
      readonly position: string;
      readonly sortIndex: string;
      readonly pageLabel: string;
      readonly failure?: never;
    }
  | {
      readonly position: null;
      readonly sortIndex?: never;
      readonly pageLabel: string;
      readonly failure: 'unsupported-page-span' | 'invalid-geometry';
    };
