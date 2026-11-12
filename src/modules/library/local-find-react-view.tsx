import { React } from '../../ui/react/runtime';
import type { ReactView } from '../../ui/react/types';
import { createReactView } from '../../ui/react/view';
import type { LocalFindReactCommand, LocalFindReactModel } from './local-find-react-model';

export const LOCAL_FIND_REACT_CSS = `
.neo-local-find { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
.neo-local-find .local-find-prefix { color:var(--zotero-neo-muted); font-weight:bold; }
.neo-local-find input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--zotero-neo-text); font:inherit; }
`;

export function mountLocalFindReactView(
  root: HTMLElement,
  initialModel: LocalFindReactModel,
  _dispatch: (command: LocalFindReactCommand) => void,
): ReactView<LocalFindReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-local-find">
        <span className="local-find-prefix">/</span>
        <input
          type="text"
          data-neo-ui-part="query"
          autoComplete="off"
          spellCheck={false}
          placeholder={model.placeholder}
        />
      </div>
    ),
    initialModel,
  );
}
