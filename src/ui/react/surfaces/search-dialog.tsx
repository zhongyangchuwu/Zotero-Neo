import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  SearchDialogReactCommand,
  SearchDialogReactModel,
} from '../../search-dialog-react-model';

export const SEARCH_DIALOG_REACT_CSS = `
.neo-search-backdrop { position:fixed; inset:0; z-index:2147483645; background:var(--zotero-neo-backdrop); }
.neo-search-dialog { position:absolute; inset:8%; display:flex; flex-direction:column; gap:10px; padding:18px; overflow:auto; background:var(--zotero-neo-surface); color:var(--zotero-neo-text); border:1px solid var(--zotero-neo-border); border-radius:8px; box-shadow:0 8px 40px #0006; font:menu; }
.neo-search-dialog h2, .neo-search-dialog p { margin:0; }
.neo-search-controls { display:flex; gap:8px; flex-wrap:wrap; }
.neo-search-controls input { flex:1; min-width:160px; color:var(--zotero-neo-text) !important; background:var(--zotero-neo-input) !important; }
.neo-search-controls input::placeholder { color:var(--zotero-neo-muted) !important; opacity:1; }
.neo-search-content { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr); grid-template-rows:minmax(0,1fr); gap:12px; flex:1; min-height:0; overflow:hidden; }
.neo-search-results { overflow:auto; min-width:0; min-height:0; }
.neo-search-row { padding:10px; white-space:pre-wrap; overflow-wrap:anywhere; cursor:pointer; border-bottom:1px solid var(--zotero-neo-border); }
.neo-search-row[aria-selected="true"] { background:var(--zotero-neo-selected); }
.neo-search-preview { overflow:auto; min-width:0; min-height:0; }
.neo-search-preview img { display:block; width:100%; height:auto; }
.neo-search-preview pre { white-space:pre-wrap; overflow-wrap:anywhere; }
@media (max-width:720px) {
  .neo-search-content { grid-template-columns:minmax(0,1fr); grid-template-rows:repeat(2,minmax(0,1fr)); }
}
`;

export function mountSearchDialogReactView(
  root: HTMLElement,
  initialModel: SearchDialogReactModel,
  dispatch: (command: SearchDialogReactCommand) => void,
): ReactView<SearchDialogReactModel> {
  return createReactView(
    root,
    (model) => (
      <div
        className="neo-search-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) dispatch({ type: 'close' });
        }}
      >
        <section
          className="neo-search-dialog"
          data-zv-search-dialog="1"
          role="dialog"
          aria-modal="true"
          aria-label={model.title}
        >
          <h2>{model.title}</h2>
          <div className="neo-search-controls">
            <select
              data-neo-ui-part="scopes"
              aria-label={model.title}
              hidden={!model.scopes.length}
              disabled={model.pending}
              value={model.scope}
              onChange={(event) => dispatch({ type: 'scope', value: event.currentTarget.value })}
            >
              {model.scopes.map((scope) => (
                <option key={scope.id} value={scope.id}>
                  {scope.title}
                </option>
              ))}
            </select>
            <input
              data-neo-ui-part="input"
              type="search"
              placeholder={model.placeholder}
              aria-label={model.placeholder}
              disabled={model.pending}
            />
            {model.actions.map((action, index) => (
              <button
                key={index}
                type="button"
                disabled={action.disabled}
                onClick={() => dispatch({ type: 'action', index })}
              >
                {action.label}
              </button>
            ))}
            <button type="button" onClick={() => dispatch({ type: 'close' })}>
              {model.close}
            </button>
          </div>
          <p>{model.help}</p>
          <p role="status">{model.status}</p>
          <div className="neo-search-content">
            <div
              className="neo-search-results"
              data-neo-ui-part="results"
              role="listbox"
              tabIndex={0}
              aria-activedescendant={
                model.rows.length ? `zv-search-result-${model.selected}` : undefined
              }
            >
              {model.rows.map((label, index) => (
                <div
                  className="neo-search-row"
                  id={`zv-search-result-${index}`}
                  key={index}
                  role="option"
                  aria-selected={index === model.selected}
                  onClick={() => dispatch({ type: 'select', index })}
                >
                  {label}
                </div>
              ))}
              {model.loaded && !model.rows.length && model.empty}
            </div>
            <div
              className="neo-search-preview"
              data-neo-ui-part="preview"
              tabIndex={0}
              hidden={!model.hasPreview}
            >
              {model.previewImages.map((image, index) => (
                <img key={index} src={image.dataURL} alt={image.alt} />
              ))}
              {model.previewText && <pre>{model.previewText}</pre>}
            </div>
          </div>
        </section>
      </div>
    ),
    initialModel,
  );
}
