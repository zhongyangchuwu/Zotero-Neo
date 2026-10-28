import type { ModuleHost, ModuleScope } from '../../core/module-host';
import type { ActionId } from '../../input/actions';
import type { PdfWindow } from '../../reader/types';

export const READER_ANNOTATION_NORMAL_ACTIONS = [
  'editAnnotation',
  'deleteAnnotation',
  'recolorYellow',
  'recolorRed',
  'recolorGreen',
  'recolorPurple',
  'filterYellow',
  'filterRed',
  'filterGreen',
  'filterBlue',
  'filterPurple',
  'filterClear',
  'yankAnnotation',
  'yankAnnotationComment',
] as const satisfies readonly ActionId[];
export const READER_ANNOTATION_SELECT_ACTIONS = [
  'highlightYellow',
  'highlightRed',
  'highlightGreen',
  'highlightBlue',
  'highlightPurple',
  'underlineSelection',
  'addNote',
] as const satisfies readonly ActionId[];
export type ReaderAnnotationAction =
  | (typeof READER_ANNOTATION_NORMAL_ACTIONS)[number]
  | (typeof READER_ANNOTATION_SELECT_ACTIONS)[number];

export function isReaderAnnotationAction(action: ActionId): action is ReaderAnnotationAction {
  return (
    (READER_ANNOTATION_NORMAL_ACTIONS as readonly ActionId[]).includes(action) ||
    (READER_ANNOTATION_SELECT_ACTIONS as readonly ActionId[]).includes(action)
  );
}

export function bindReaderAnnotationActions(
  host: ModuleHost,
  scope: ModuleScope,
  run: (action: ReaderAnnotationAction, window: PdfWindow) => void,
): (action: ReaderAnnotationAction, window: PdfWindow) => boolean {
  const handlers = new Map<ReaderAnnotationAction, (window: PdfWindow) => boolean>();
  for (const action of READER_ANNOTATION_NORMAL_ACTIONS)
    handlers.set(
      action,
      host.bind<PdfWindow>(scope, 'reader-normal', action, (window) => run(action, window)),
    );
  for (const action of READER_ANNOTATION_SELECT_ACTIONS)
    handlers.set(
      action,
      host.bind<PdfWindow>(scope, 'reader-select', action, (window) => run(action, window)),
    );
  return (action, window) => handlers.get(action)?.(window) ?? false;
}
