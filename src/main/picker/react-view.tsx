import { React } from '../../ui/react/runtime';
import { createReactView } from '../../ui/react/view';
import type { ReactView } from '../../ui/react/types';
import type { PickerReactCommand, PickerReactModel } from './react-model';

export const PICKER_REACT_CSS = `
.neo-picker { height:100%; color:var(--zotero-neo-text); font:13px/1.45 system-ui,sans-serif; }
.neo-picker .picker-content { display:grid; grid-template-columns:minmax(360px,48%) minmax(0,1fr); height:100%; min-height:0; }
.neo-picker .picker-content.single { grid-template-columns:1fr; grid-template-rows:minmax(280px,1fr) minmax(180px,.65fr); }
.neo-picker section { display:flex; flex-direction:column; min-width:0; min-height:0; }
.neo-picker .picker-left { border-right:1px solid var(--zotero-neo-border); }
.neo-picker .single .picker-left { border-right:0; border-bottom:1px solid var(--zotero-neo-border); }
.neo-picker header { padding:4px 12px; color:var(--zotero-neo-accent); background:var(--zotero-neo-elevated); border-bottom:1px solid var(--zotero-neo-border); font-weight:700; }
.neo-picker .picker-header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; }
.neo-picker .picker-source { grid-column:1; grid-row:1; justify-self:start; font:inherit; color:inherit; background:var(--zotero-neo-input); border:1px solid var(--zotero-neo-border); border-radius:3px; padding:2px 6px; }
.neo-picker .picker-title { grid-column:2; }
.neo-picker .picker-count { grid-column:3; justify-self:end; color:var(--zotero-neo-muted); }
.neo-picker input { margin:8px 10px; background:var(--zotero-neo-input); color:inherit; border:1px solid var(--zotero-neo-border); outline:2px solid var(--zotero-neo-focus-ring); outline-offset:1px; border-radius:3px; padding:7px 10px; font:inherit; }
.neo-picker .picker-help { flex:0 0 auto; min-height:18px; padding:0 10px 6px; color:var(--zotero-neo-muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.neo-picker .picker-results { overflow:auto; flex:1; min-height:0; outline:none; padding:2px 0; }
.neo-picker .picker-row { padding:6px 12px; border-left:3px solid transparent; }
.neo-picker .picker-row.boundary { border-top:1px solid var(--zotero-neo-border); }
.neo-picker .picker-row.selected { color:var(--zotero-neo-selected-text); border-left-color:var(--zotero-neo-accent); background:var(--zotero-neo-selected); }
.neo-picker .picker-status { padding:0 10px 6px; font-size:12px; }
.neo-picker .picker-preview-header { text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.neo-picker .picker-preview { overflow:auto; flex:1; min-height:0; outline:none; padding:14px 16px; white-space:pre-wrap; background:var(--zotero-neo-elevated); }
.neo-picker .focused { box-shadow:inset 0 0 0 2px var(--zotero-neo-focus-ring); }
`;

export function mountPickerReactView(
  root: HTMLElement,
  initialModel: PickerReactModel,
  _dispatch: (command: PickerReactCommand) => void,
): ReactView<PickerReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-ui neo-picker">
        <div className={`picker-content${model.single ? ' single' : ''}`}>
          <section className="picker-left">
            <header className="picker-header">
              <button
                type="button"
                className="picker-source"
                data-neo-ui-part="source"
                hidden={model.sourceLabel === null}
                disabled={model.sourceDisabled}
              >
                {model.sourceLabel}
              </button>
              <span className="picker-title">{model.title}</span>
              <span className="picker-count" data-neo-ui-part="count">
                {model.count}
              </span>
            </header>
            <input type="text" data-neo-ui-part="query" placeholder={model.placeholder} />
            <div className="picker-help" data-neo-ui-part="query-help">
              {model.queryHelp}
            </div>
            <div
              className={`picker-results${model.focusPane === 'list' ? ' focused' : ''}`}
              data-neo-ui-part="results"
              tabIndex={-1}
            >
              {model.loading || !model.rows.length
                ? model.empty
                : model.rows.map((row, index) => (
                    <div
                      key={index}
                      data-zv-picker-row="1"
                      data-zv-picker-index={index}
                      className={`picker-row${row.boundary ? ' boundary' : ''}${index === model.selected ? ' selected' : ''}`}
                      style={{ cursor: model.mouseEnabled ? 'pointer' : 'default' }}
                    >
                      <span>{row.text}</span>
                    </div>
                  ))}
            </div>
            {model.listHelp !== null && (
              <div className="picker-help" data-neo-ui-part="list-help">
                {model.listHelp}
              </div>
            )}
            <div
              className="picker-status"
              data-neo-ui-part="status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              hidden={!model.status}
            >
              {model.status}
            </div>
          </section>
          <section>
            <header className="picker-preview-header" data-neo-ui-part="preview-title">
              {model.previewTitle}
            </header>
            <div
              className={`picker-preview${model.focusPane === 'preview' ? ' focused' : ''}`}
              data-neo-ui-part="preview"
              tabIndex={-1}
            >
              {model.previewBody}
            </div>
          </section>
        </div>
      </div>
    ),
    initialModel,
  );
}
