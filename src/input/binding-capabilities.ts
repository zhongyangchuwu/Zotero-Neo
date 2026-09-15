import { MAIN_EXECUTABLE_ACTIONS } from '../main/action-capabilities';
import {
  READER_LOCAL_INSERT_ACTIONS,
  READER_LOCAL_VISUAL_ACTIONS,
  READER_NORMAL_ACTIONS,
} from '../reader/action-capabilities';
import type { Mode } from './bindings';
import type { ActionId } from './actions';

/** Returns the executor-owned ActionId set available for a binding mode. */
export function actionsForBindingMode(mode: Mode): readonly ActionId[] {
  switch (mode) {
    case 'normal':
      return READER_NORMAL_ACTIONS;
    case 'visual':
      return READER_LOCAL_VISUAL_ACTIONS;
    case 'insert':
      return READER_LOCAL_INSERT_ACTIONS;
    case 'main':
      return MAIN_EXECUTABLE_ACTIONS;
  }
}
