import { MAIN_NORMAL_ACTIONS, MAIN_SELECT_ACTIONS } from '../main/action-capabilities';
import { NOTE_INSERT_ACTIONS, NOTE_NORMAL_ACTIONS } from '../main/note-action-capabilities';
import {
  READER_LOCAL_VISUAL_ACTIONS,
  READER_NORMAL_ACTIONS,
  READER_OUTLINE_ACTIONS,
  READER_MARKS_ACTIONS,
  READER_ANNOTATIONS_ACTIONS,
  READER_THUMBNAILS_ACTIONS,
} from '../reader/action-capabilities';
import { PICKER_INPUT_ACTIONS, PICKER_LIST_ACTIONS } from '../main/picker/action-capabilities';
import { PLUGINS_INPUT_ACTIONS, PLUGINS_LIST_ACTIONS } from '../main/plugin-manager-capabilities';
import type { BindingContext } from './bindings';
import type { ActionId } from './actions';

/** Returns the executor-owned ActionId set available for a configurable interaction mode. */
export function actionsForBindingMode(mode: BindingContext): readonly ActionId[] {
  switch (mode) {
    case 'reader-normal':
      return READER_NORMAL_ACTIONS;
    case 'reader-select':
      return READER_LOCAL_VISUAL_ACTIONS;
    case 'main-normal':
      return MAIN_NORMAL_ACTIONS;
    case 'note-normal':
      return NOTE_NORMAL_ACTIONS;
    case 'note-insert':
      return NOTE_INSERT_ACTIONS;
    case 'main-select':
      return MAIN_SELECT_ACTIONS;
    case 'reader-outline':
      return READER_OUTLINE_ACTIONS;
    case 'reader-marks':
      return READER_MARKS_ACTIONS;
    case 'reader-annotations':
      return READER_ANNOTATIONS_ACTIONS;
    case 'reader-thumbnails':
      return READER_THUMBNAILS_ACTIONS;
    case 'picker-input':
      return PICKER_INPUT_ACTIONS;
    case 'picker-list':
      return PICKER_LIST_ACTIONS;
    case 'plugins-input':
      return PLUGINS_INPUT_ACTIONS;
    case 'plugins-list':
      return PLUGINS_LIST_ACTIONS;
  }
}
