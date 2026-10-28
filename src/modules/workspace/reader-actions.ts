import type { ActionId } from '../../input/actions';

export const READER_WORKSPACE_ACTIONS = [
  'toggleReaderSplitHorizontal',
  'toggleReaderSplitVertical',
  'focusReaderSplitLeft',
  'focusReaderSplitDown',
  'focusReaderSplitUp',
  'focusReaderSplitRight',
] as const satisfies readonly ActionId[];

export type ReaderWorkspaceAction = (typeof READER_WORKSPACE_ACTIONS)[number];

export function isReaderWorkspaceAction(action: ActionId): action is ReaderWorkspaceAction {
  return (READER_WORKSPACE_ACTIONS as readonly ActionId[]).includes(action);
}
