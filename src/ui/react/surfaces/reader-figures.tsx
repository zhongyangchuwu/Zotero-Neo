import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  ReaderFiguresReactCommand,
  ReaderFiguresReactModel,
} from '../../../modules/reader-figures/react-model';

export const READER_FIGURES_REACT_CSS = `
.neo-figures { position:fixed; inset:4%; z-index:2147483645; padding:16px; display:flex; flex-direction:column; gap:10px; overflow:auto; background:var(--zotero-neo-surface); color:var(--zotero-neo-text); border:1px solid var(--zotero-neo-border); border-radius:8px; box-shadow:0 8px 40px #0006; font:menu; }
.neo-figures h2, .neo-figures p { margin:0; }
.neo-figures .controls, .neo-figures .tools { display:flex; gap:8px; }
.neo-figures .controls { flex-wrap:wrap; }
.neo-figures input { flex:1; min-width:160px; }
.neo-figures .help { color:var(--zotero-neo-muted); }
.neo-figures .content { display:flex; flex-wrap:wrap; gap:12px; flex:1; min-height:0; }
.neo-figures .list { flex:1 1 260px; min-height:120px; overflow:auto; border:1px solid var(--zotero-neo-border); }
.neo-figures .row { padding:8px; cursor:pointer; white-space:pre-wrap; overflow-wrap:anywhere; border-bottom:1px solid var(--zotero-neo-border); }
.neo-figures .row.selected { background:var(--zotero-neo-selected); }
.neo-figures .right { flex:2 1 360px; display:flex; flex-direction:column; min-width:0; min-height:160px; }
.neo-figures .preview { flex:1; min-height:120px; overflow:auto; background:var(--zotero-neo-elevated); margin-top:8px; }
.neo-figures img { display:block; height:auto; max-width:none; }
`;

export function mountReaderFiguresReactView(
  root: HTMLElement,
  initialModel: ReaderFiguresReactModel,
  dispatch: (command: ReaderFiguresReactCommand) => void,
): ReactView<ReaderFiguresReactModel> {
  return createReactView(
    root,
    (model) => {
      const t = model.text;
      return (
        <section
          className="neo-ui neo-figures"
          data-zv-figure-picker="1"
          role="dialog"
          aria-modal="true"
          aria-label={t.title}
        >
          <h2>{t.title}</h2>
          <div className="controls">
            <input
              data-neo-ui-part="query"
              type="search"
              placeholder={t.search}
              aria-label={t.search}
              disabled={model.pending}
            />
            <select
              aria-label={t.kind}
              value={model.kind}
              disabled={model.pending}
              onChange={(event) => dispatch({ type: 'kind', value: event.currentTarget.value })}
            >
              {['all', 'figure', 'table'].map((value) => (
                <option key={value} value={value}>
                  {t[value]}
                </option>
              ))}
            </select>
            <select
              aria-label={t.part}
              value={model.part}
              disabled={model.pending}
              onChange={(event) => dispatch({ type: 'part', value: event.currentTarget.value })}
            >
              {['groups', 'bodies'].map((value) => (
                <option key={value} value={value}>
                  {t[value]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => dispatch({ type: 'close' })}>
              {t.close}
            </button>
          </div>
          <p className="help">{t.help}</p>
          <p role="status">{model.status}</p>
          <div className="content">
            <div
              className="list"
              data-neo-ui-part="list"
              tabIndex={0}
              role="listbox"
              aria-label={t.list}
              aria-activedescendant={
                model.rows.length ? `zv-figure-choice-${model.selected}` : undefined
              }
            >
              {model.rows.length
                ? model.rows.map((row, index) => (
                    <div
                      key={index}
                      id={`zv-figure-choice-${index}`}
                      data-zv-figure-row={index}
                      className={`row${index === model.selected ? ' selected' : ''}`}
                      role="option"
                      aria-selected={index === model.selected}
                      onClick={() => dispatch({ type: 'select', index })}
                    >
                      {row}
                    </div>
                  ))
                : t.empty}
            </div>
            <section className="right">
              <div className="tools">
                <button
                  type="button"
                  aria-label={t.zoomOut}
                  onClick={() => dispatch({ type: 'zoom', direction: -1 })}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={t.zoomIn}
                  onClick={() => dispatch({ type: 'zoom', direction: 1 })}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={t.zoomReset}
                  onClick={() => dispatch({ type: 'zoom', direction: 0 })}
                >
                  100%
                </button>
                <button
                  type="button"
                  disabled={model.pending || !model.rows.length}
                  onClick={() => dispatch({ type: 'confirm' })}
                >
                  {t.jump}
                </button>
              </div>
              <div
                className="preview"
                data-neo-ui-part="preview"
                tabIndex={0}
                aria-label={t.preview}
              >
                {model.image ? (
                  <img
                    src={model.image.src}
                    alt={model.image.alt}
                    style={{ width: `${model.zoom * 100}%` }}
                  />
                ) : (
                  model.previewText
                )}
              </div>
            </section>
          </div>
        </section>
      );
    },
    initialModel,
  );
}
