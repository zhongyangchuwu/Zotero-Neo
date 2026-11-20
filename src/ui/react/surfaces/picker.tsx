import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type {
  PickerReactCommand,
  PickerReactModel,
  PickerRowCells,
} from '../../../main/picker/react-model';

export { PICKER_REACT_CSS } from './picker-styles';

/** Match offsets are UTF-16 indices; keep contiguous matches and surrogate pairs intact. */
function titleWithMatches(title: string, matches: readonly number[] | undefined): React.ReactNode {
  if (!matches?.length) return title;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let start = -1;
  let end = 0;
  const appendMatch = (): void => {
    if (cursor < start) parts.push(title.slice(cursor, start));
    parts.push(
      <mark className="picker-match" key={start}>
        {title.slice(start, end)}
      </mark>,
    );
    cursor = end;
  };

  const indexes = matches
    .filter((index) => Number.isInteger(index) && index >= 0 && index < title.length)
    .sort((a, b) => a - b);
  for (const index of indexes) {
    const code = title.charCodeAt(index);
    const beginsPair =
      code >= 0xdc00 && code <= 0xdfff && (title.codePointAt(index - 1) ?? 0) > 0xffff;
    const left = beginsPair ? index - 1 : index;
    const right = left + ((title.codePointAt(left) ?? 0) > 0xffff ? 2 : 1);
    if (start < 0 || left > end) {
      if (start >= 0) appendMatch();
      start = left;
    }
    end = Math.max(end, right);
  }
  if (start < 0) return title;
  appendMatch();
  if (cursor < title.length) parts.push(title.slice(cursor));
  return parts;
}

// React's option-only `selected` property is not the attribute on a result div.
function markSelected(row: HTMLDivElement | null): (() => void) | void {
  if (!row) return;
  row.setAttribute('selected', '');
  return () => row.removeAttribute('selected');
}

function BibliographicCells({ cells }: { cells: PickerRowCells }): React.ReactNode {
  const citekey = cells.citekey ? `@${cells.citekey}` : undefined;
  return (
    <>
      <span className="picker-cell-title">
        {cells.icon ? (
          <img className="picker-item-icon" src={cells.icon} alt="" draggable={false} />
        ) : (
          <span className="picker-item-icon" aria-hidden="true" />
        )}
        <span className="picker-cell-title-text" title={cells.title}>
          {titleWithMatches(cells.title, cells.matches)}
        </span>
      </span>
      <span className="picker-cell-meta">
        <span className="picker-cell-author" title={cells.author}>
          {cells.author}
        </span>
        <span className="picker-cell-year">{cells.year}</span>
        <span className="picker-cell-detail" title={cells.detail}>
          {cells.detail}
        </span>
      </span>
      <span className="picker-cell-citekey" title={citekey}>
        {citekey}
      </span>
    </>
  );
}

function PickerSurface({ model }: { model: PickerReactModel }): React.ReactNode {
  const id = React.useId();
  const resultsID = `${id}-results`;
  const previewTitleID = `${id}-preview-title`;
  const hasRows = !model.loading && model.rows.length > 0;
  const hasStructuredPreview =
    model.previewSections !== undefined || model.previewMeta !== undefined;

  return (
    <div className="picker-container">
      <div className="picker-input-wrapper">
        <span className="picker-prompt" aria-hidden="true" title={model.title}>
          {'>'}
        </span>
        <button
          type="button"
          className="picker-source"
          data-neo-ui-part="source"
          hidden={model.sourceLabel === null}
          disabled={model.sourceDisabled}
          title={model.sourceLabel ?? undefined}
        >
          {model.sourceLabel}
        </button>
        <input
          className="picker-query"
          no-native=""
          type="text"
          data-neo-ui-part="query"
          aria-label={model.title}
          aria-controls={resultsID}
          placeholder={model.placeholder}
        />
        <span className="picker-count" data-neo-ui-part="count" title={model.count}>
          {model.count}
        </span>
      </div>
      <div className="picker-content">
        <div
          id={resultsID}
          className="picker-list-container"
          data-neo-ui-part="results"
          data-picker-focused={model.focusPane === 'list' ? '' : undefined}
          role={hasRows ? 'listbox' : 'region'}
          tabIndex={-1}
          aria-label={model.title}
          aria-busy={model.loading}
          aria-activedescendant={
            hasRows && model.rows[model.selected] ? `${resultsID}-${model.selected}` : undefined
          }
        >
          {hasRows ? (
            model.rows.map((row, index) => (
              <div
                key={index}
                id={`${resultsID}-${index}`}
                data-zv-picker-row="1"
                data-zv-picker-index={index}
                className={`picker-row${row.boundary ? ' boundary' : ''}${row.cells ? ' picker-row-bibliographic' : ''}`}
                role="option"
                aria-selected={index === model.selected}
                ref={index === model.selected ? markSelected : undefined}
                data-picker-clickable={model.mouseEnabled ? '' : undefined}
              >
                {row.cells ? (
                  <BibliographicCells cells={row.cells} />
                ) : (
                  <span className="picker-cell-title picker-row-text" title={row.text}>
                    {row.text}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="picker-empty">{model.empty}</div>
          )}
        </div>
        <section
          className={`picker-preview-panel${hasStructuredPreview ? ' picker-preview-bibliographic' : ''}`}
          data-neo-ui-part="preview"
          data-picker-focused={model.focusPane === 'preview' ? '' : undefined}
          tabIndex={-1}
          aria-labelledby={previewTitleID}
        >
          <h2 className="picker-preview-title" data-neo-ui-part="preview-title" id={previewTitleID}>
            {model.previewTitle}
          </h2>
          {hasStructuredPreview ? (
            <>
              {model.previewMeta && <p className="picker-preview-meta">{model.previewMeta}</p>}
              {model.previewSections?.map((section, index) => (
                <div className="picker-preview-card" key={index}>
                  <h3 className="picker-preview-card-title">
                    {section.title}{' '}
                    <span className="picker-preview-card-count">{section.count}</span>
                  </h3>
                  {section.names.length > 0 && (
                    <ul className="picker-preview-names">
                      {section.names.map((name, index) => (
                        <li className="picker-preview-name" key={index}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.more && <p className="picker-preview-more">{section.more}</p>}
                </div>
              ))}
            </>
          ) : (
            <div className="picker-preview-body">{model.previewBody}</div>
          )}
        </section>
      </div>
      <footer className="picker-status-bar" hidden={!model.status && !model.shortcutHelp}>
        <div
          className="picker-status"
          data-neo-ui-part="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          title={model.status || undefined}
        >
          {model.status}
        </div>
        {model.shortcutHelp && (
          <div className="picker-shortcut-help" title={model.shortcutHelp}>
            {model.shortcutHelp}
          </div>
        )}
      </footer>
    </div>
  );
}

export function mountPickerReactView(
  root: HTMLElement,
  initialModel: PickerReactModel,
  _dispatch: (command: PickerReactCommand) => void,
): ReactView<PickerReactModel> {
  return createReactView(root, (model) => <PickerSurface model={model} />, initialModel);
}
