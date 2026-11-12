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
                disabled={model.busy || model.credentialPending}
              />
            </label>
            {model.provider === 'mineru' && (
              <span>
                <button
                  type="button"
                  disabled={model.busy || model.credentialPending}
                  onClick={() => dispatch({ type: 'credential-save' })}
                >
                  {model.credentialSaveLabel}
                </button>
                <button
                  type="button"
                  disabled={model.busy || model.credentialPending}
                  onClick={() => dispatch({ type: 'credential-clear' })}
                >
                  {model.credentialClearLabel}
                </button>
              </span>
            )}
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
        <div className="neo-comparison-results">
          {model.vocabulary && (
            <details className="neo-comparison-vocabulary">
              <summary>{model.vocabularyLabel}</summary>
              <p>{model.vocabulary}</p>
            </details>
          )}
          {model.columns.map((column, index) => (
            <section key={index}>
              <h3>{column.label}</h3>
              {column.error && <p>{column.error}</p>}
              {column.summary && <p>{column.summary}</p>}
              {column.cache && <p>{column.cache}</p>}
              {column.targets.map((target) => (
                <details key={target.id}>
                  <summary>{target.title}</summary>
                  <p>{target.text}</p>
                  <button type="button" onClick={() => dispatch({ type: 'locate', id: target.id })}>
                    {target.action}
                  </button>
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
