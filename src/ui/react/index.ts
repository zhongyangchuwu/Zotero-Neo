import { mountSettingsReactView, SETTINGS_REACT_CSS } from '../../main/settings-react';
import type { SettingsReactModel } from '../../main/settings-react-model';
import { mountPickerReactView, PICKER_REACT_CSS } from '../../main/picker/react-view';
import type { PickerReactModel } from '../../main/picker/react-model';
import { mountReferenceReactView, REFERENCES_REACT_CSS } from '../../references/react-view';
import type { ReferenceViewModel } from '../../references/react-model';
import {
  mountTabSidebarReactView,
  TAB_SIDEBAR_REACT_CSS,
} from '../../modules/tab-enhancements/react-view';
import type { TabSidebarReactModel } from '../../modules/tab-enhancements/react-model';
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
        TAB_SIDEBAR_REACT_CSS;
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
      case 'tab-sidebar':
        return mountTabSidebarReactView(
          root,
          model as TabSidebarReactModel,
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
