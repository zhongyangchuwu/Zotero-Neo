import { MAIN_NORMAL_ACTIONS, MAIN_SELECT_ACTIONS } from '../main/action-capabilities';
import {
  READER_LOCAL_INSERT_ACTIONS,
  READER_LOCAL_VISUAL_ACTIONS,
  READER_NORMAL_ACTIONS,
} from '../reader/action-capabilities';
import type { Mode } from './bindings';
import type { ActionId } from './actions';

/** Returns the executor-owned ActionId set available for a configurable interaction mode. */
export function actionsForBindingMode(mode: Mode): readonly ActionId[] {
  switch (mode) {
    case 'reader-normal':
      return READER_NORMAL_ACTIONS;
    case 'reader-select':
      return READER_LOCAL_VISUAL_ACTIONS;
    case 'reader-insert':
      return READER_LOCAL_INSERT_ACTIONS;
    case 'main-normal':
      return MAIN_NORMAL_ACTIONS;
    case 'main-select':
      return MAIN_SELECT_ACTIONS;
  }
}
