import type { ModuleHost, ModuleScope } from '../../core/module-host';
import type { ActionId } from '../../input/actions';
import type { PdfWindow } from '../../reader/types';

export const READER_SELECTION_NORMAL_ACTIONS = [
  'enterVisual',
  'toggleBodySelection',
] as const satisfies readonly ActionId[];
export const READER_SELECTION_SELECT_ACTIONS = [
  'flashText',
  'openSelectionActions',
  'extendDown',
  'extendUp',
  'extendLeft',
  'extendRight',
  'extendTokenBackward',
  'extendTokenForward',
  'extendTokenDown',
  'extendTokenUp',
  'extendSentenceForward',
  'extendSentenceBackward',
  'extendParagraphForward',
  'extendParagraphBackward',
  'extendWordForward',
  'extendWordBackward',
  'extendLineStart',
  'extendLineEnd',
  'copySelection',
  'searchSelection',
  'swapVisualEnds',
  'exitMode',
] as const satisfies readonly ActionId[];
export type ReaderSelectionAction =
  | (typeof READER_SELECTION_NORMAL_ACTIONS)[number]
  | (typeof READER_SELECTION_SELECT_ACTIONS)[number];

export function isReaderSelectionAction(action: ActionId): action is ReaderSelectionAction {
  return (
    (READER_SELECTION_NORMAL_ACTIONS as readonly ActionId[]).includes(action) ||
    (READER_SELECTION_SELECT_ACTIONS as readonly ActionId[]).includes(action)
  );
}

/** Registers actual supported contexts, independent of the current default keymap. */
export function bindReaderSelectionActions(
  host: ModuleHost,
  scope: ModuleScope,
  run: (action: ReaderSelectionAction, window: PdfWindow) => void,
): (action: ReaderSelectionAction, window: PdfWindow) => boolean {
  const handlers = new Map<ReaderSelectionAction, (window: PdfWindow) => boolean>();
  for (const action of READER_SELECTION_NORMAL_ACTIONS)
    handlers.set(
      action,
      host.bind<PdfWindow>(scope, 'reader-normal', action, (window) => run(action, window)),
    );
  for (const action of READER_SELECTION_SELECT_ACTIONS)
    handlers.set(
      action,
      host.bind<PdfWindow>(scope, 'reader-select', action, (window) => run(action, window)),
    );
  return (action, window) => handlers.get(action)?.(window) ?? false;
}
