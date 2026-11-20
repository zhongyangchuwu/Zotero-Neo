import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  ReaderSidebarCommand,
  ReaderSidebarViewModel,
} from '../../../modules/reader-navigation/react-model';

export const READER_SIDEBAR_REACT_CSS = `
#zv-reader-captions {
  flex: 0 1 auto; max-height: 35%; overflow: auto;
  border-top: 1px solid var(--zotero-neo-border); padding: 4px 8px;
  background: var(--zotero-neo-surface); color: var(--zotero-neo-text);
  font-family: var(--neo-font-ui);
}
#zv-reader-captions summary { cursor: pointer; padding-block: 3px; }
#zv-reader-captions details details { margin-inline-start: 8px; }
#zv-reader-captions button {
  display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  border: 0; background: transparent; color: inherit; font: inherit;
  border-radius: var(--neo-radius-small);
  padding: 4px; text-align: start; cursor: pointer;
}
#zv-reader-captions [data-zv-caption-kind="figure"] > summary { color: var(--zotero-neo-mode-insert-text); }
#zv-reader-captions [data-zv-caption-kind="table"] > summary { color: var(--zotero-neo-mode-visual-text); }
#zv-reader-captions :focus-visible { outline: 2px solid var(--zotero-neo-focus-ring); outline-offset: -2px; }
#zv-reader-captions .zv-caption-status { color: var(--zotero-neo-muted); padding: 4px; }
#zv-reader-marks {
  flex: 0 1 auto; max-height: 35%; overflow: auto;
  border-top: 1px solid var(--zotero-neo-border); padding: 8px;
  background: var(--zotero-neo-surface); color: var(--zotero-neo-text);
  font-family: var(--neo-font-ui);
}
#zv-reader-marks summary { cursor: pointer; padding-block: 3px; }
#zv-reader-marks .zv-mark-row { display: flex; align-items: center; gap: 4px; }
#zv-reader-marks button {
  font: inherit; color: inherit; background: transparent; border: 0;
  border-radius: var(--neo-radius-small); padding: 5px; text-align: start; cursor: pointer;
}
#zv-reader-marks button[data-zv-mark] { flex: 1; min-width: 0; }
#zv-reader-marks button:focus-visible { outline: 2px solid var(--zotero-neo-focus-ring); }
#zv-reader-marks .zv-empty-marks { color: var(--zotero-neo-muted); padding-block: 5px; }
`;

export function mountReaderSidebarReactView(
  root: HTMLElement,
  initialModel: ReaderSidebarViewModel,
  dispatch: (command: ReaderSidebarCommand) => void,
): ReactView<ReaderSidebarViewModel> {
  return createReactView(
    root,
    (model) =>
      model.kind === 'marks' ? (
        <details open={model.open}>
          <summary tabIndex={-1}>
            {model.label} ({model.entries.length})
          </summary>
          {!model.entries.length && <div className="zv-empty-marks">{model.empty}</div>}
          {model.entries.map((entry) => (
            <div className="zv-mark-row" key={entry.char}>
              <button
                type="button"
                tabIndex={-1}
                data-zv-mark={entry.char}
                onClick={() => dispatch({ type: 'jump-mark', char: entry.char })}
              >
                {entry.label}
              </button>
              <button
                type="button"
                tabIndex={-1}
                data-zv-delete-mark={entry.char}
                aria-label={entry.deleteLabel}
                onClick={() => dispatch({ type: 'delete-mark', char: entry.char })}
              >
                ×
              </button>
            </div>
          ))}
        </details>
      ) : (
        <details open={model.open}>
          <summary data-tabstop="1" tabIndex={0} aria-label={model.label} title={model.cost}>
            ▧ / ▤
          </summary>
          {model.status ? (
            <div className="zv-caption-status" role="status">
              {model.status}
            </div>
          ) : (
            model.groups.map((group) => (
              <details key={group.kind} data-zv-caption-kind={group.kind} open={group.open}>
                <summary data-tabstop="1" tabIndex={0} aria-label={group.label}>
                  {group.kind === 'figure' ? '▧' : '▤'} {group.entries.length}
                </summary>
                {group.entries.map((entry) => (
                  <button
                    key={entry.index}
                    type="button"
                    data-zv-caption={entry.index}
                    data-tabstop="1"
                    title={entry.title}
                    onClick={() => dispatch({ type: 'caption', index: entry.index })}
                  >
                    {entry.label}
                  </button>
                ))}
              </details>
            ))
          )}
        </details>
      ),
    initialModel,
  );
}
