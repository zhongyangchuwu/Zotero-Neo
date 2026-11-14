import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import { Button } from '../components';
import type {
  PreparationReactCommand,
  PreparationReactModel,
} from '../../../modules/document-preparation/react-model';

export const DOCUMENT_PREPARATION_REACT_CSS = `
.neo-preparation-actions { display:flex; flex-wrap:wrap; gap:8px; }
.neo-preparation-actions .neo-button { padding:6px 10px; border-radius:4px; }
`;
export function mountDocumentPreparationReactView(
  root: HTMLElement,
  initialModel: PreparationReactModel,
  dispatch: (command: PreparationReactCommand) => void,
): ReactView<PreparationReactModel> {
  return createReactView(
    root,
    (model) => (
      <>
        <h2 style={{ margin: 0 }}>{model.title}</h2>
        <p style={{ margin: 0, color: 'var(--zotero-neo-muted)', whiteSpace: 'pre-wrap' }}>
          {model.help}
        </p>
        <details>
          <summary>{model.selection}</summary>
          <ul>
            {model.names.map((name, index) => (
              <li key={index}>{name}</li>
            ))}
          </ul>
        </details>
        <div data-neo-ui-part="credentials">
          <label>
            <span>{model.token}</span>
            <input
              data-neo-ui-part="token"
              type="password"
              autoComplete="off"
              aria-label={model.token}
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
              style={{ marginInlineStart: 8 }}
            />
          </label>
          <span>
            <button
              type="button"
              disabled={model.credentialChecking}
              onClick={() => dispatch({ type: 'credential-verify' })}
            >
              {model.verify}
            </button>
            <a
              href={model.credentialHelpURL}
              onClick={(event) => {
                event.preventDefault();
                dispatch({ type: 'credential-help' });
              }}
            >
              {model.credentialHelp}
            </a>
          </span>
          <small style={{ display: 'block', color: 'var(--zotero-neo-muted)' }}>
            {model.credentialHint}
          </small>
          <small role="status" style={{ display: 'block', color: 'var(--zotero-neo-muted)' }}>
            {model.credentialStatus}
          </small>
        </div>
        <div className="neo-preparation-actions">
          <Button
            data-neo-ui-part="start"
            disabled={model.startDisabled}
            onClick={() => dispatch({ type: 'start' })}
          >
            {model.start}
          </Button>
          <Button
            data-neo-ui-part="retry"
            disabled={model.retryDisabled}
            onClick={() => dispatch({ type: 'retry' })}
          >
            {model.retry}
          </Button>
          <Button
            data-neo-ui-part="stop"
            disabled={model.stopDisabled}
            onClick={() => dispatch({ type: 'stop' })}
          >
            {model.stop}
          </Button>
          <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
            {model.close}
          </Button>
        </div>
        <p role="status" style={{ margin: 0 }}>
          {model.status}
        </p>
        <ol style={{ margin: 0, paddingInlineStart: 26, overflow: 'auto', minHeight: 100 }}>
          {model.rows.map((row, index) => (
            <li
              key={index}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid var(--zotero-neo-border)',
                overflowWrap: 'anywhere',
              }}
            >
              {row.text}
              {row.receipt && (
                <small style={{ display: 'block', color: 'var(--zotero-neo-muted)' }}>
                  {row.receipt}
                </small>
              )}
            </li>
          ))}
        </ol>
      </>
    ),
    initialModel,
  );
}
