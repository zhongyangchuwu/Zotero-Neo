import type { ReaderJumpLocation } from '../core/contracts';
import type { ActionId } from '../input/actions';
import type { ItemRef } from '../main/selection-store';

export interface TabNavigationLocation {
  readonly kind: 'tab';
  readonly tabID: string;
}

export interface LibraryNavigationLocation {
  readonly kind: 'library';
  readonly tabID: string;
  readonly scopeIDs: readonly string[];
  readonly quickSearchText: string;
  readonly tags: readonly string[];
  readonly advancedSearch: boolean;
  readonly cursor?: ItemRef;
  readonly panel: 'collections' | 'items';
}

export type NavigationLocation =
  | TabNavigationLocation
  | LibraryNavigationLocation
  | ReaderJumpLocation;

export type NavigationSurface = 'main' | 'reader' | 'note';

export type NavigationEventId =
  | 'main-local-find.confirm'
  | 'main-selection-panel.reveal'
  | 'reader-outline.confirm'
  | 'reader-mark.jump'
  | 'reader-native.hard';

export type NavigationCause =
  | { readonly kind: 'action'; readonly action: ActionId }
  | { readonly kind: 'event'; readonly event: NavigationEventId };

export type ReaderNavigationPath =
  | 'explicit-page'
  | 'search'
  | 'annotation'
  | 'internal-link'
  | 'external-link'
  | 'outline'
  | 'mark'
  | 'page-step'
  | 'scroll'
  | 'fallback-scroll';

export interface NavigationContext {
  readonly mainPanel?: 'collections' | 'items';
  readonly readerPath?: ReaderNavigationPath;
  /** Invocation/view ownership, independent of the window's history epoch. */
  readonly isCurrent?: () => boolean;
}

export interface NavigationIntent {
  readonly cause: NavigationCause;
  readonly surface: NavigationSurface;
  readonly context?: NavigationContext;
}

export type NavigationEvidence = 'settled-change' | 'native-hard' | 'managed-final';

export type HistoryDecision =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'traverse' }
  | { readonly kind: 'record'; readonly evidence: NavigationEvidence };

/** Immutable ownership survives completion/retirement; it never becomes native work. */
export interface NavigationToken {
  readonly id: number;
  readonly epoch: number;
  readonly cause: NavigationCause;
  readonly surface: NavigationSurface;
}

export interface NavigationAttempt {
  readonly token: NavigationToken;
  readonly policy: HistoryDecision;
  isCurrent(): boolean;
  cancel(): void;
}

export type NavigationOutcome =
  | {
      readonly kind: 'completed';
      readonly evidence: NavigationEvidence;
      readonly destination?: NavigationLocation;
      readonly targetIndex?: number;
    }
  | { readonly kind: 'unchanged' | 'unavailable' | 'cancelled' | 'stale' }
  | { readonly kind: 'failed'; readonly error: unknown };

export type NavigationCompletion =
  | { readonly kind: 'immediate'; readonly outcome: NavigationOutcome }
  | { readonly kind: 'deferred'; readonly settled: Promise<NavigationOutcome> };

export interface NavigationOperation {
  readonly dispatch: 'inline' | 'serial-navigation' | 'serial-traversal';
  /** Ordinary movement does not supersede jumps unless its recording policy is enabled. */
  readonly admission?: 'replace' | 'motion';
  /** Exact Reader pane or other narrow capture; otherwise use the window adapter. */
  readonly capture?: () => NavigationLocation | null;
  readonly destinationPanel?: 'collections' | 'items';
  start(attempt: NavigationAttempt): NavigationCompletion;
}

export type NavigationResult = NavigationOutcome & { readonly recorded: boolean };

interface NavigationExecutionOwnership {
  isCurrent(): boolean;
  cancel(): void;
}

export type NavigationExecution = NavigationExecutionOwnership &
  (
    | { readonly pending: false; readonly result: NavigationResult }
    | { readonly pending: true; readonly result: Promise<NavigationResult> }
  );

/** Observation-only port: native work has already run and must not be redispatched. */
export interface NativeNavigationReceipt {
  readonly source: ReaderJumpLocation;
  readonly destination: ReaderJumpLocation;
  readonly isCurrent: () => boolean;
}

export interface NavigationPort {
  execute(intent: NavigationIntent, operation: NavigationOperation): NavigationExecution;
  observeNative(receipt: NativeNavigationReceipt): void;
}
