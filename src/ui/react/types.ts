import type {
  React as ReactTypes,
  createRoot as createReactRoot,
} from '../../../vendor/react/index.js';
import type { flushSync as flushReactSync } from 'react-dom';

export type NativeReactSurface =
  | 'settings'
  | 'picker'
  | 'references'
  | 'selection-panel'
  | 'tab-sidebar'
  | 'local-find';

/** One renderer-owned root. Updates commit before an imperative host reads UI parts. */
export interface ReactView<Model> {
  update(model: Model): void;
  getElement(part: string): HTMLElement | null;
  dispose(): void;
}

/** The host can retire a pending script load without ever mounting its view. */
export interface NativeReactView<Model> extends ReactView<Model> {
  readonly ready: Promise<void>;
}

export interface NativeReactLibrary {
  readonly React: typeof ReactTypes;
  readonly createRoot: typeof createReactRoot;
  readonly flushSync: typeof flushReactSync;
}

/** Type erasure occurs only at the serialized chrome/content script boundary. */
export interface NativeUIRuntime {
  mount(
    surface: NativeReactSurface,
    root: HTMLElement,
    model: unknown,
    dispatch: (command: unknown) => void,
  ): ReactView<unknown>;
  dispose(): void;
}

export interface NativeReactViewOptions<Model extends object, Command> {
  readonly surface: NativeReactSurface;
  readonly root: HTMLElement;
  readonly model: Model;
  readonly dispatch: (command: Command) => void;
  readonly isCurrent: () => boolean;
  readonly loadingText: string;
  readonly errorText: string;
  readonly onError: (error: unknown) => void;
}

declare global {
  var NeoReactRuntime: NativeReactLibrary | undefined;
  var NeoNativeUI: NativeUIRuntime | undefined;
}
