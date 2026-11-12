import { React } from '../../ui/react/runtime';
import { createReactView } from '../../ui/react/view';
import type { ReactView } from '../../ui/react/types';
import type { PreparationReactCommand, PreparationReactModel } from './react-model';

const actionStyle = {
  padding: '6px 10px',
  background: 'var(--zotero-neo-input)',
  color: 'var(--zotero-neo-text)',
  border: '1px solid var(--zotero-neo-border)',
  borderRadius: 4,
  font: 'inherit',
};
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
              style={{ marginInlineStart: 8 }}
            />
          </label>
          <span>
            <button type="button" disabled={model.busy} onClick={() => dispatch({ type: 'save' })}>
              {model.save}
            </button>
            <button type="button" disabled={model.busy} onClick={() => dispatch({ type: 'clear' })}>
              {model.clear}
            </button>
          </span>
          <small role="status" style={{ display: 'block', color: 'var(--zotero-neo-muted)' }}>
            {model.credentialStatus}
          </small>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            data-neo-ui-part="start"
            type="button"
            style={actionStyle}
            disabled={model.startDisabled}
            onClick={() => dispatch({ type: 'start' })}
          >
            {model.start}
          </button>
          <button
            data-neo-ui-part="retry"
            type="button"
            style={actionStyle}
            disabled={model.retryDisabled}
            onClick={() => dispatch({ type: 'retry' })}
          >
            {model.retry}
          </button>
          <button
            data-neo-ui-part="stop"
            type="button"
            style={actionStyle}
            disabled={model.stopDisabled}
            onClick={() => dispatch({ type: 'stop' })}
          >
            {model.stop}
          </button>
          <button
            data-neo-ui-part="close"
            type="button"
            style={actionStyle}
            onClick={() => dispatch({ type: 'close' })}
          >
            {model.close}
          </button>
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
