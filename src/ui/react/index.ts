import { mountSettingsReactView, SETTINGS_REACT_CSS } from './surfaces/settings';
import type { SettingsReactModel } from '../../main/settings-react-model';
import { mountPickerReactView, PICKER_REACT_CSS } from './surfaces/picker';
import type { PickerReactModel } from '../../main/picker/react-model';
import { mountReferenceReactView, REFERENCES_REACT_CSS } from './surfaces/references';
import type { ReferenceViewModel } from '../../references/react-model';
import {
  mountSelectionPanelReactView,
  SELECTION_PANEL_REACT_CSS,
} from './surfaces/selection-panel';
import type { SelectionPanelReactModel } from '../../modules/worksets/react-model';
import { mountTabSidebarReactView, TAB_SIDEBAR_REACT_CSS } from './surfaces/tab-sidebar';
import type { TabSidebarReactModel } from '../../modules/tab-enhancements/react-model';
import { mountLocalFindReactView, LOCAL_FIND_REACT_CSS } from './surfaces/local-find';
import type { LocalFindReactModel } from '../../modules/library/local-find-react-model';
import { mountExtensionsReactView, EXTENSIONS_REACT_CSS } from './surfaces/extensions';
import type { ExtensionsReactModel } from '../../modules/extensions/react-model';
import { mountSearchDialogReactView, SEARCH_DIALOG_REACT_CSS } from './surfaces/search-dialog';
import type { SearchDialogReactModel } from '../search-dialog-react-model';
import { mountReaderFiguresReactView, READER_FIGURES_REACT_CSS } from './surfaces/reader-figures';
import type { ReaderFiguresReactModel } from '../../modules/reader-figures/react-model';
import {
  mountDocumentPreparationReactView,
  DOCUMENT_PREPARATION_REACT_CSS,
} from './surfaces/document-preparation';
import type { PreparationReactModel } from '../../modules/document-preparation/react-model';
import {
  mountDocumentComparisonReactView,
  DOCUMENT_COMPARISON_REACT_CSS,
} from './surfaces/document-comparison';
import type { DocumentComparisonModel } from '../../modules/document-comparison/react-model';
import {
  mountAnnotationCommentReactView,
  ANNOTATION_COMMENT_REACT_CSS,
} from './surfaces/annotation-comment';
import type { AnnotationCommentReactModel } from '../../modules/reader-annotations/react-model';
import {
  mountSelectionActionsReactView,
  SELECTION_ACTIONS_REACT_CSS,
} from './surfaces/selection-actions';
import type { SelectionActionsReactModel } from '../../modules/reader-selection/react-model';
import { NATIVE_UI_CSS } from './styles';
import type { NativeUIRuntime, ReactView } from './types';

let stylesheet: HTMLElement | null = null;
const runtime: NativeUIRuntime = {
  mount(surface, root, model, dispatch) {
    if (!stylesheet || stylesheet.ownerDocument !== root.ownerDocument || !stylesheet.isConnected) {
      stylesheet?.remove();
      stylesheet = root.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'style');
      stylesheet.id = 'zotero-neo-native-react-style';
      stylesheet.textContent =
        NATIVE_UI_CSS +
        SETTINGS_REACT_CSS +
        PICKER_REACT_CSS +
        REFERENCES_REACT_CSS +
        SELECTION_PANEL_REACT_CSS +
        TAB_SIDEBAR_REACT_CSS +
        LOCAL_FIND_REACT_CSS +
        EXTENSIONS_REACT_CSS +
        SEARCH_DIALOG_REACT_CSS +
        READER_FIGURES_REACT_CSS +
        DOCUMENT_COMPARISON_REACT_CSS +
        DOCUMENT_PREPARATION_REACT_CSS +
        ANNOTATION_COMMENT_REACT_CSS +
        SELECTION_ACTIONS_REACT_CSS;
      root.ownerDocument.documentElement.append(stylesheet);
    }
    switch (surface) {
      case 'settings':
        return mountSettingsReactView(root, model as SettingsReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'picker':
        return mountPickerReactView(root, model as PickerReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'references':
        return mountReferenceReactView(root, model as ReferenceViewModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'selection-panel':
        return mountSelectionPanelReactView(
          root,
          model as SelectionPanelReactModel,
          () => {},
        ) as ReactView<unknown>;
      case 'tab-sidebar':
        return mountTabSidebarReactView(
          root,
          model as TabSidebarReactModel,
          () => {},
        ) as ReactView<unknown>;
      case 'local-find':
        return mountLocalFindReactView(
          root,
          model as LocalFindReactModel,
          () => {},
        ) as ReactView<unknown>;
      case 'extensions':
        return mountExtensionsReactView(root, model as ExtensionsReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'search-dialog':
        return mountSearchDialogReactView(root, model as SearchDialogReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'reader-figures':
        return mountReaderFiguresReactView(root, model as ReaderFiguresReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'document-preparation':
        return mountDocumentPreparationReactView(root, model as PreparationReactModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'document-comparison':
        return mountDocumentComparisonReactView(root, model as DocumentComparisonModel, (command) =>
          dispatch(command),
        ) as ReactView<unknown>;
      case 'annotation-comment':
        return mountAnnotationCommentReactView(
          root,
          model as AnnotationCommentReactModel,
          () => {},
        ) as ReactView<unknown>;
      case 'selection-actions':
        return mountSelectionActionsReactView(
          root,
          model as SelectionActionsReactModel,
          () => {},
        ) as ReactView<unknown>;
      default:
        throw new Error(`Unsupported native UI surface: ${String(surface)}`);
    }
  },
  dispose() {
    try {
      stylesheet?.remove();
    } catch {
      /* Its exact owner document may already have been destroyed. */
    }
    stylesheet = null;
  },
};
globalThis.NeoNativeUI = runtime;
