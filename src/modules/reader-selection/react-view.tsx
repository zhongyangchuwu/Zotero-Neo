import { React } from '../../ui/react/runtime';
import { createReactView } from '../../ui/react/view';
import type { ReactView } from '../../ui/react/types';
import type { SelectionActionsReactCommand, SelectionActionsReactModel } from './react-model';

export const SELECTION_ACTIONS_REACT_CSS = `
.neo-selection-actions { font:12px/1.4 system-ui,sans-serif; }
.neo-selection-actions .title { font-weight:700; letter-spacing:.06em; color:var(--zotero-neo-accent); margin-bottom:6px; }
.neo-selection-actions .result-title { letter-spacing:.04em; margin-bottom:8px; }
.neo-selection-actions .preview { padding:6px 8px; margin-bottom:8px; border-radius:5px; background:var(--zotero-neo-elevated); color:var(--zotero-neo-muted); white-space:normal; }
.neo-selection-actions .status { padding:8px; color:var(--zotero-neo-text); }
.neo-selection-actions .row { padding:5px 8px; border-radius:4px; color:var(--zotero-neo-text); }
.neo-selection-actions .row.selected { background:var(--zotero-neo-accent); color:var(--zotero-neo-on-accent); font-weight:600; }
.neo-selection-actions .result { white-space:pre-wrap; user-select:text; -moz-user-select:text; padding:8px; border-radius:5px; background:var(--zotero-neo-elevated); color:var(--zotero-neo-text); }
.neo-selection-actions .help { margin-top:8px; color:var(--zotero-neo-muted); }
`;

export function mountSelectionActionsReactView(
  root: HTMLElement,
  initialModel: SelectionActionsReactModel,
  _dispatch: (command: SelectionActionsReactCommand) => void,
): ReactView<SelectionActionsReactModel> {
  return createReactView(
    root,
    (model) => (
      <div className="neo-selection-actions">
        {model.stage === 'result' ? (
          <>
            <div className="title result-title">{model.resultTitle || 'RESULT'}</div>
            <div className="result">{model.resultText}</div>
            <div className="help">y copy result · Enter/Esc close</div>
          </>
        ) : (
          <>
            <div className="title">SELECT ACTIONS</div>
            <div className="preview">{model.preview}</div>
            {model.stage === 'busy' ? (
              <div className="status">{model.message}</div>
            ) : (
              <>
                {model.actions.map((label, index) => (
                  <div key={index} className={`row${index === model.selected ? ' selected' : ''}`}>
                    {index < 9 ? index + 1 : '·'}
                    {'  '}
                    {label}
                  </div>
                ))}
                <div className="help">j/k move · 1–9 run · Enter run · Esc close</div>
              </>
            )}
          </>
        )}
      </div>
    ),
    initialModel,
  );
}
