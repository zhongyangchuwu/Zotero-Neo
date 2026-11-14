import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  DocumentComparisonCommand,
  DocumentComparisonModel,
} from '../../../modules/document-comparison/react-model';

export const DOCUMENT_COMPARISON_REACT_CSS = `
.neo-comparison-controls { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.neo-comparison-controls input { width:min(420px,80%); }
.neo-comparison-credential input { margin-inline-start:8px; width:auto; }
.neo-comparison-credential small { display:block; color:var(--zotero-neo-muted); }
.neo-comparison-results { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.neo-comparison-results details { padding:6px 0; border-bottom:1px solid var(--zotero-neo-border); }
.neo-comparison-correction { display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:8px 0; }
.neo-comparison-correction select { max-width:100%; }
.neo-comparison-results p { white-space:pre-wrap; overflow-wrap:anywhere; }
.neo-comparison-vocabulary { grid-column:1 / -1; }
`;

export function mountDocumentComparisonReactView(
  root: HTMLElement,
  initialModel: DocumentComparisonModel,
  dispatch: (command: DocumentComparisonCommand) => void,
): ReactView<DocumentComparisonModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-ui neo-comparison">
        <h2>{model.title}</h2>
        <p>{model.description}</p>
        <div className="neo-comparison-controls">
          <select
            aria-label={model.providerLabel}
            value={model.provider}
            disabled={model.busy}
            onChange={(event) =>
              dispatch({
                type: 'provider',
                value: event.currentTarget.value === 'oxr' ? 'oxr' : 'mineru',
              })
            }
          >
            <option value="mineru">MinerU</option>
            <option value="oxr">OXR</option>
          </select>
          <input
            type="url"
            aria-label={model.endpointLabel}
            hidden={model.provider === 'mineru'}
            disabled={model.busy}
            defaultValue={model.endpoint}
            onBlur={(event) => dispatch({ type: 'endpoint', value: event.currentTarget.value })}
          />
          <div className="neo-comparison-credential">
            <label>
              {model.credentialLabel}
              <input
                data-neo-ui-part="credential"
                type="password"
                autoComplete="off"
                aria-label={model.credentialLabel}
                disabled={model.busy}
                onCompositionStart={() => dispatch({ type: 'credential-composition' })}
                onCompositionEnd={() => dispatch({ type: 'credential-change' })}
                onInput={(event) =>
                  dispatch({
                    type: (event.nativeEvent as InputEvent).isComposing
                      ? 'credential-composition'
                      : 'credential-change',
                  })
                }
              />
            </label>
            {model.provider === 'mineru' && (
              <span>
                <button
                  type="button"
                  disabled={model.credentialChecking}
                  onClick={() => dispatch({ type: 'credential-verify' })}
                >
                  {model.credentialVerifyLabel}
                </button>
                <a
                  href={model.credentialHelpURL}
                  onClick={(event) => {
                    event.preventDefault();
                    dispatch({ type: 'credential-help' });
                  }}
                >
                  {model.credentialHelpLabel}
                </a>
              </span>
            )}
            {model.credentialHint && <small>{model.credentialHint}</small>}
            <small role="status">{model.credentialStatus}</small>
          </div>
          <button
            type="button"
            disabled={!model.ready || model.busy}
            onClick={() => dispatch({ type: 'parse' })}
          >
            {model.parseLabel}
          </button>
          <button
            type="button"
            disabled={!model.ready || model.busy}
            onClick={() => dispatch({ type: 'refresh' })}
          >
            {model.refreshLabel}
          </button>
          <button type="button" onClick={() => dispatch({ type: 'copy' })}>
            {model.copyLabel}
          </button>
          <button
            type="button"
            data-neo-ui-part="close"
            onClick={() => dispatch({ type: 'close' })}
          >
            {model.closeLabel}
          </button>
        </div>
        <p role="status">{model.status}</p>
        <p>{model.corrections.hint}</p>
        <div className="neo-comparison-results">
          {model.vocabulary && (
            <details className="neo-comparison-vocabulary">
              <summary>{model.vocabularyLabel}</summary>
              <p>{model.vocabulary}</p>
            </details>
          )}
          {model.columns.map((column, index) => (
            <section key={index}>
              {model.corrections.undoColumns.includes(index) && (
                <button
                  type="button"
                  disabled={model.corrections.busy}
                  onClick={() => dispatch({ type: 'correct-undo', column: index })}
                >
                  {model.corrections.undo}
                </button>
              )}
              <h3>{column.label}</h3>
              {column.error && <p>{column.error}</p>}
              {column.summary && <p>{column.summary}</p>}
              {column.cache && <p>{column.cache}</p>}
              {column.pageCount > 1 && (
                <div className="neo-comparison-controls">
                  <button
                    type="button"
                    disabled={model.busy || column.page === 0}
                    onClick={() =>
                      dispatch({ type: 'regions-page', column: index, page: column.page - 1 })
                    }
                  >
                    {column.previousLabel}
                  </button>
                  <span>
                    {column.page + 1} / {column.pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={model.busy || column.page + 1 >= column.pageCount}
                    onClick={() =>
                      dispatch({ type: 'regions-page', column: index, page: column.page + 1 })
                    }
                  >
                    {column.nextLabel}
                  </button>
                </div>
              )}
              {column.targets.map((target) => (
                <details key={target.id}>
                  <summary>{target.title}</summary>
                  <p>{target.text}</p>
                  <button type="button" onClick={() => dispatch({ type: 'locate', id: target.id })}>
                    {target.action}
                  </button>
                  {target.correction && (
                    <div className="neo-comparison-correction">
                      {target.correction.corrected && <strong>{model.corrections.saved}</strong>}
                      <button
                        type="button"
                        disabled={model.corrections.busy}
                        onClick={() =>
                          dispatch({
                            type: 'correct-body',
                            column: index,
                            regionID: target.correction!.regionID,
                          })
                        }
                      >
                        {model.corrections.body}
                      </button>
                      <button
                        type="button"
                        disabled={model.corrections.busy || !target.correction.corrected}
                        onClick={() =>
                          dispatch({
                            type: 'correct-restore',
                            column: index,
                            regionID: target.correction!.regionID,
                          })
                        }
                      >
                        {model.corrections.restore}
                      </button>
                      {target.correction.bodies.length > 0 && (
                        <form
                          className="neo-comparison-correction"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const select = event.currentTarget.querySelector('select');
                            if (select?.value)
                              dispatch({
                                type: 'correct-caption',
                                column: index,
                                regionID: target.correction!.regionID,
                                bodyID: select.value,
                              });
                          }}
                        >
                          <label>
                            {model.corrections.target}
                            <select required defaultValue="" disabled={model.corrections.busy}>
                              <option value="" disabled>
                                {model.corrections.choose}
                              </option>
                              {target.correction.bodies.map((body) => (
                                <option key={body.id} value={body.id}>
                                  {body.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="submit" disabled={model.corrections.busy}>
                            {model.corrections.caption}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </details>
              ))}
              {column.truncated && <p>{column.truncated}</p>}
            </section>
          ))}
        </div>
      </div>
    ),
    initialModel,
  );
}
