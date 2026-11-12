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
  border-top: 1px solid var(--color-border, currentColor); padding: 4px 8px;
  font: inherit; color: inherit;
}
#zv-reader-captions summary { cursor: pointer; padding-block: 3px; }
#zv-reader-captions details details { margin-inline-start: 8px; }
#zv-reader-captions button {
  display: block; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  border: 0; background: transparent; color: inherit; font: inherit;
  padding: 4px; text-align: start; cursor: pointer;
}
#zv-reader-captions [data-zv-caption-kind="figure"] > summary { color: var(--zv-outline-figure); }
#zv-reader-captions [data-zv-caption-kind="table"] > summary { color: var(--zv-outline-table); }
#zv-reader-captions :focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
#zv-reader-captions .zv-caption-status { opacity: .7; padding: 4px; }
#zv-reader-marks {
  flex: 0 1 auto; max-height: 35%; overflow: auto;
  border-top: 1px solid var(--color-border, currentColor); padding: 8px;
  font: inherit; color: inherit;
}
#zv-reader-marks summary { cursor: pointer; padding-block: 3px; }
#zv-reader-marks .zv-mark-row { display: flex; align-items: center; gap: 4px; }
#zv-reader-marks button {
  font: inherit; color: inherit; background: transparent; border: 0;
  border-radius: 3px; padding: 5px; text-align: start; cursor: pointer;
}
#zv-reader-marks button[data-zv-mark] { flex: 1; min-width: 0; }
#zv-reader-marks button:focus-visible { outline: 2px solid currentColor; }
#zv-reader-marks .zv-empty-marks { opacity: .65; padding-block: 5px; }
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
