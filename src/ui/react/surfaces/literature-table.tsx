import {
  LITERATURE_TABLE_TEXT,
  type LiteratureTableCommand,
  type LiteratureTableModel,
} from '../../../literature-table/model';
import { Button } from '../components';
import { React } from '../runtime';
import type { ReactView } from '../types';
import { createReactView } from '../view';

export const LITERATURE_TABLE_CSS = `
.neo-literature-table { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; padding: 16px; }
.neo-literature-table h1, .neo-literature-table p { margin: 0; }
.neo-literature-toolbar { display: flex; align-items: start; gap: 12px; flex-wrap: wrap; }
.neo-literature-toolbar > label { display: flex; align-items: center; gap: 8px; max-width: 100%; }
.neo-literature-toolbar select { max-width: 26rem; }
.neo-literature-toolbar details { padding: 6px 10px; border: 1px solid var(--zotero-neo-border, GrayText); border-radius: 5px; }
.neo-literature-toolbar summary, .neo-literature-column { cursor: pointer; }
.neo-literature-column { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; }
.neo-literature-grid { min-height: 0; overflow: auto; border: 1px solid var(--zotero-neo-border, GrayText); border-radius: 5px; }
.neo-literature-grid table { width: 100%; border-collapse: separate; border-spacing: 0; }
.neo-literature-grid th, .neo-literature-grid td { text-align: start; overflow-wrap: anywhere; border-bottom: 1px solid var(--zotero-neo-border, GrayText); padding: 6px 10px; }
.neo-literature-grid tbody tr:last-child td { border-bottom: 0; }
.neo-literature-grid thead { position: sticky; top: 0; z-index: 1; background: var(--zotero-neo-elevated, Canvas); }
.neo-literature-grid [data-column-id="title"] { min-width: 13rem; }
.neo-literature-grid [data-column-id="year"] { min-width: 5rem; }
.neo-literature-grid th button { width: 100%; text-align: start; }
.neo-literature-grid td[data-cell-state="missing"], .neo-literature-grid td[data-cell-state="ambiguous"] { color: var(--zotero-neo-muted, GrayText); }
.neo-literature-grid td[data-cell-state="invalid"] span { text-decoration: underline dotted; }
.neo-literature-pages { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
`;

export function mountLiteratureTableView(
  root: HTMLElement,
  initialModel: LiteratureTableModel,
  dispatch: (command: LiteratureTableCommand) => void,
): ReactView<LiteratureTableModel> {
  return createReactView(
    root,
    (model) => {
      const text = LITERATURE_TABLE_TEXT[model.language];
      const { scope, scopes, status } = model;
      const unavailableScope = scope && !scopes.some(({ id }) => id === scope.id);
      const retryable = status === 'unavailable' || status === 'error';
      const statusText =
        status === 'loading'
          ? text.loading
          : status === 'unavailable'
            ? text.unavailable
            : status === 'error'
              ? text.error
              : model.total === 0
                ? text.empty
                : null;
      return (
        <section className="neo-ui neo-literature-table" data-neo-ui-part="literature-table">
          <h1>{text.heading}</h1>
          <div className="neo-literature-toolbar">
            <label>
              <span>{text.scope}</span>
              <select
                data-neo-ui-part="scope"
                value={scope?.id ?? ''}
                disabled={!scopes.length}
                onChange={(event) => dispatch({ type: 'scope', id: event.currentTarget.value })}
              >
                {!scope && (
                  <option value="" disabled>
                    —
                  </option>
                )}
                {unavailableScope && (
                  <option value={scope.id} disabled>
                    {scope.label}
                  </option>
                )}
                {scopes.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary data-neo-ui-part="columns">{text.columns}</summary>
              {model.choices.length === 0 && <p className="neo-muted">{text.noColumns}</p>}
              {model.choices.map(({ id, label, shown }) => (
                <label key={id} className="neo-literature-column">
                  <input
                    type="checkbox"
                    data-neo-ui-part="column-toggle"
                    data-column-id={`attribute:${id}`}
                    checked={shown}
                    onChange={() => dispatch({ type: 'column', id })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </details>
          </div>
          {statusText && (
            <p data-neo-ui-part="status" role={retryable ? 'alert' : 'status'}>
              {statusText}
            </p>
          )}
          {retryable && (
            <div>
              <Button data-neo-ui-part="retry" onClick={() => dispatch({ type: 'retry' })}>
                {text.retry}
              </Button>
            </div>
          )}
          {model.locateFailed && (
            <p data-neo-ui-part="locate-error" role="alert">
              {text.locateFailed}
            </p>
          )}
          {status === 'ready' && (
            <div
              className="neo-literature-grid"
              role="region"
              aria-label={text.heading}
              tabIndex={0}
            >
              <table data-neo-ui-part="table" aria-label={scope?.label ?? text.heading}>
                <thead>
                  <tr>
                    {model.columns.map(({ id, label }) => {
                      const direction = id === model.sortColumn ? model.sortDirection : undefined;
                      return (
                        <th key={id} scope="col" data-column-id={id} aria-sort={direction}>
                          <Button
                            data-neo-ui-part="sort"
                            data-column-id={id}
                            onClick={() => dispatch({ type: 'sort', id })}
                          >
                            {label}
                            {direction && (
                              <span aria-hidden="true">
                                {direction === 'ascending' ? ' ↑' : ' ↓'}
                              </span>
                            )}
                          </Button>
                        </th>
                      );
                    })}
                    <th scope="col">{text.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map(({ id, cells }) => (
                    <tr key={id} data-neo-ui-part="row" data-item-id={id}>
                      {model.columns.map(({ id }, index) => {
                        const cell = cells[index]!;
                        return (
                          <td key={id} data-column-id={id} data-cell-state={cell.state}>
                            {'value' in cell ? (
                              <span title={cell.state === 'invalid' ? text.invalid : undefined}>
                                {cell.value}
                              </span>
                            ) : cell.state === 'ambiguous' ? (
                              text.ambiguous
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <Button
                          data-neo-ui-part="locate"
                          data-item-id={id}
                          disabled={model.locating}
                          onClick={() => dispatch({ type: 'locate', id })}
                        >
                          {text.locate}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {status === 'ready' && model.total > 0 && (
            <div className="neo-literature-pages">
              <Button
                data-neo-ui-part="page-previous"
                disabled={model.page <= 1}
                onClick={() => dispatch({ type: 'page', delta: -1 })}
              >
                {text.previous}
              </Button>
              <span data-neo-ui-part="page-status" role="status">
                {text.page(model.page, model.pageCount, model.total)}
              </span>
              <Button
                data-neo-ui-part="page-next"
                disabled={model.page >= model.pageCount}
                onClick={() => dispatch({ type: 'page', delta: 1 })}
              >
                {text.next}
              </Button>
            </div>
          )}
        </section>
      );
    },
    initialModel,
  );
}
