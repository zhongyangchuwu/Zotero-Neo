import type { LiteratureTableModel } from '../../literature-table/model';
import { NATIVE_UI_CSS } from './styles';
import { LITERATURE_TABLE_CSS, mountLiteratureTableView } from './surfaces/literature-table';
import type { NativeUIRuntime, ReactView } from './types';

let stylesheet: HTMLElement | undefined;
const runtime: NativeUIRuntime = {
  mount(surface, root, model, dispatch) {
    if (surface !== 'literature-table') throw new Error('Invalid literature renderer surface');
    if (!stylesheet?.isConnected) {
      const document = root.ownerDocument;
      stylesheet = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
      stylesheet.textContent = NATIVE_UI_CSS + LITERATURE_TABLE_CSS;
      document.documentElement.append(stylesheet);
    }
    return mountLiteratureTableView(
      root,
      model as LiteratureTableModel,
      dispatch,
    ) as ReactView<unknown>;
  },
  dispose() {
    stylesheet?.remove();
    stylesheet = undefined;
  },
};
globalThis.NeoLiteratureUI = runtime;
