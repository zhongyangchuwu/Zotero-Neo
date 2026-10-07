import type { ActionId } from '../input/actions';
import type { HistoryDecision, NavigationEventId, NavigationIntent } from './types';

const IGNORE: HistoryDecision = { kind: 'ignore' };
const TRAVERSE: HistoryDecision = { kind: 'traverse' };
const SETTLED_CHANGE: HistoryDecision = { kind: 'record', evidence: 'settled-change' };
const NATIVE_HARD: HistoryDecision = { kind: 'record', evidence: 'native-hard' };
const MANAGED_FINAL: HistoryDecision = { kind: 'record', evidence: 'managed-final' };

type Rule = (intent: NavigationIntent) => HistoryDecision;

const isMain = (intent: NavigationIntent): boolean => intent.surface === 'main';
const isItems = (intent: NavigationIntent): boolean =>
  isMain(intent) && intent.context?.mainPanel === 'items';
const isReaderPath = (
  intent: NavigationIntent,
  path: NonNullable<NavigationIntent['context']>['readerPath'],
): boolean => intent.surface === 'reader' && intent.context?.readerPath === path;

const ACTION_RULES: Partial<Record<ActionId, Rule>> = {
  previousTab: () => SETTLED_CHANGE,
  nextTab: () => SETTLED_CHANGE,
  switchTab: () => SETTLED_CHANGE,
  mainNavFirst: (intent) => (isItems(intent) ? SETTLED_CHANGE : IGNORE),
  mainNavLast: (intent) => (isItems(intent) ? SETTLED_CHANGE : IGNORE),
  findNext: (intent) =>
    isItems(intent) ? SETTLED_CHANGE : isReaderPath(intent, 'search') ? NATIVE_HARD : IGNORE,
  findPrevious: (intent) =>
    isItems(intent) ? SETTLED_CHANGE : isReaderPath(intent, 'search') ? NATIVE_HARD : IGNORE,
  mainOpenPDF: (intent) => (intent.surface === 'note' || isItems(intent) ? SETTLED_CHANGE : IGNORE),
  mainActivate: (intent) => (isItems(intent) ? SETTLED_CHANGE : IGNORE),
  findAllItems: () => SETTLED_CHANGE,
  findCollectionItems: () => SETTLED_CHANGE,
  findNotes: () => SETTLED_CHANGE,
  showInLibrary: (intent) =>
    intent.surface === 'reader' || intent.surface === 'note' ? SETTLED_CHANGE : IGNORE,
  firstPage: (intent) => (isReaderPath(intent, 'explicit-page') ? NATIVE_HARD : IGNORE),
  lastPage: (intent) => (isReaderPath(intent, 'explicit-page') ? NATIVE_HARD : IGNORE),
  prevAnnotation: (intent) => (isReaderPath(intent, 'annotation') ? NATIVE_HARD : IGNORE),
  nextAnnotation: (intent) => (isReaderPath(intent, 'annotation') ? NATIVE_HARD : IGNORE),
  followLink: (intent) => (isReaderPath(intent, 'internal-link') ? NATIVE_HARD : IGNORE),
  navigateBack: () => TRAVERSE,
  navigateForward: () => TRAVERSE,
};

const EVENT_RULES: Readonly<Record<NavigationEventId, Rule>> = {
  'main-local-find.confirm': (intent) => (isItems(intent) ? SETTLED_CHANGE : IGNORE),
  'main-selection-panel.reveal': (intent) => (isItems(intent) ? SETTLED_CHANGE : IGNORE),
  'reader-outline.confirm': (intent) => (isReaderPath(intent, 'outline') ? NATIVE_HARD : IGNORE),
  'reader-mark.jump': (intent) => (isReaderPath(intent, 'mark') ? MANAGED_FINAL : IGNORE),
  'reader-native.hard': (intent) => (intent.surface === 'reader' ? NATIVE_HARD : IGNORE),
};

/** The sole configured source for Neo navigation-history recording decisions. */
export function resolveHistoryPolicy(intent: NavigationIntent): HistoryDecision {
  if (intent.cause.kind === 'event') return EVENT_RULES[intent.cause.event](intent);
  return ACTION_RULES[intent.cause.action]?.(intent) ?? IGNORE;
}
