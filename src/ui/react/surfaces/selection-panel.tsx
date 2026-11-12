import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  SelectionPanelReactCommand,
  SelectionPanelReactModel,
} from '../../../modules/worksets/react-model';

export const SELECTION_PANEL_REACT_CSS = `
.neo-selection-panel { width:min(900px,calc(100vw - 80px)); height:min(600px,calc(100vh - 80px)); min-width:580px; min-height:380px; display:flex; flex-direction:column; overflow:hidden; background:var(--zotero-neo-surface); border:1px solid var(--zotero-neo-border); border-radius:8px; box-shadow:0 24px 70px var(--zotero-neo-shadow); }
.neo-selection-panel header { display:flex; align-items:center; gap:14px; padding:12px 14px; background:var(--zotero-neo-elevated); border-bottom:1px solid var(--zotero-neo-border); }
.neo-selection-panel header strong { font-size:14px; white-space:nowrap; }
.neo-selection-panel header span { color:var(--zotero-neo-muted); white-space:nowrap; }
.neo-selection-panel .selection-content { display:grid; grid-template-columns:minmax(300px,52%) minmax(260px,48%); flex:1; min-height:0; }
.neo-selection-panel .selection-list { overflow:auto; min-height:0; padding:7px 0; border-right:1px solid var(--zotero-neo-border); outline:none; }
.neo-selection-panel .selection-row { padding:7px 12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.neo-selection-panel .selection-row.selected { background:var(--zotero-neo-selected); color:var(--zotero-neo-selected-text); }
.neo-selection-panel .selection-empty { padding:12px 14px; color:var(--zotero-neo-muted); }
.neo-selection-panel .selection-details { overflow:auto; min-height:0; padding:20px 22px; background:var(--zotero-neo-elevated); white-space:pre-wrap; outline:none; }
.neo-selection-panel footer { padding:7px 12px; color:var(--zotero-neo-muted); border-top:1px solid var(--zotero-neo-border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;

export function mountSelectionPanelReactView(
  root: HTMLElement,
  initialModel: SelectionPanelReactModel,
  _dispatch: (command: SelectionPanelReactCommand) => void,
): ReactView<SelectionPanelReactModel> {
  return createReactView(
    root,
    (model) => {
      const visible = model.entries.filter((entry) => entry.state === 'visible').length;
      const hidden = model.entries.filter((entry) => entry.state === 'hidden').length;
      const unavailable = model.entries.length - visible - hidden;
      const count = `${model.entries.length} selected · ${visible} visible${hidden ? ` · ${hidden} hidden` : ''}${unavailable ? ` · ${unavailable} unavailable` : ''}`;
      const entry = model.entries[model.selected];
      const details = entry
        ? `${entry.title}\n\nStatus: ${entry.state}\nLibrary: ${entry.libraryID}\nItem: ${entry.itemID}\n\nReveal is explicit and may change the current Zotero View when the item is hidden.`
        : 'No explicit Selection members.';
      return (
        <section className="neo-ui neo-selection-panel">
          <header>
            <strong>Selection</strong>
            <span>{count}</span>
          </header>
          <div className="selection-content">
            <div className="selection-list" data-neo-ui-part="list" tabIndex={-1}>
              {model.entries.length === 0 ? (
                <div className="selection-empty">Selection is empty</div>
              ) : (
                model.entries.map((row, index) => (
                  <div
                    key={`${row.libraryID}:${row.itemID}`}
                    data-index={index}
                    data-neo-ui-part={index === model.selected ? 'selected' : undefined}
                    className={`selection-row${index === model.selected ? ' selected' : ''}`}
                  >
                    [{row.state === 'visible' ? 'V' : row.state === 'hidden' ? 'H' : '!'}]{' '}
                    {row.title}
                  </div>
                ))
              )}
            </div>
            <div className="selection-details" tabIndex={-1}>
              {details}
            </div>
          </div>
          <footer>{model.footer}</footer>
        </section>
      );
    },
    initialModel,
  );
}
