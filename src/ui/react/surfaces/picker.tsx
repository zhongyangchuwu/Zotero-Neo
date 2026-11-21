import { React } from '../runtime';
import { createReactView } from '../view';
import type { ReactView } from '../types';
import type { PickerColumn } from '../../../main/picker/model';
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

function PickerRowIcon({ icon }: { icon: 'folder' | 'plus' }): React.ReactNode {
  return (
    <svg
      className="picker-item-icon picker-row-icon"
      data-picker-icon={icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d={icon === 'folder' ? 'M3 6h6l2 2h10v11H3z' : 'M12 5v14 M5 12h14'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StructuredColumns({ columns }: { columns: readonly PickerColumn[] }): React.ReactNode {
  return (
    <span className="picker-structured-columns">
      {columns.map((column, index) => {
        const text = titleWithMatches(column.text, column.matches);
        return (
          <span
            key={index}
            className="picker-column"
            data-column-role={column.role}
            data-column-align={column.align}
            style={column.weight === undefined ? undefined : { flexGrow: column.weight }}
            title={column.text}
          >
            {column.role === 'badge' ? <span className="picker-column-badge">{text}</span> : text}
          </span>
        );
      })}
    </span>
  );
}

function BibliographicCells({
  cells,
  check,
  icon,
}: {
  cells: PickerRowCells;
  check: React.ReactNode;
  icon: React.ReactNode;
}): React.ReactNode {
  const citekey = cells.citekey ? `@${cells.citekey}` : undefined;
  return (
    <>
      <span className="picker-cell-title">
        {check}
        {icon ??
          (cells.icon ? (
            <img className="picker-item-icon" src={cells.icon} alt="" draggable={false} />
          ) : (
            <span className="picker-item-icon" aria-hidden="true" />
          ))}
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
  const marked = model.multiSelect && model.marked.length > 0 ? new Set(model.marked) : undefined;

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
        {model.title && (
          <span className="picker-scope" title={model.title}>
            {model.title}
          </span>
        )}
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
          aria-multiselectable={hasRows && model.multiSelect ? true : undefined}
          aria-busy={model.loading}
          aria-activedescendant={
            hasRows && model.rows[model.selected] ? `${resultsID}-${model.selected}` : undefined
          }
        >
          {hasRows ? (
            model.rows.map((row, index) => {
              const active = index === model.selected;
              const markable = model.multiSelect && row.selectable !== false;
              const isMarked = markable && (marked?.has(index) ?? false);
              const check = markable ? <span className="picker-check" aria-hidden="true" /> : null;
              const icon = row.icon ? <PickerRowIcon icon={row.icon} /> : null;
              const columns = row.columns?.length ? row.columns : undefined;
              const cells = columns ? undefined : row.cells;
              return (
                <div
                  key={index}
                  id={`${resultsID}-${index}`}
                  data-zv-picker-row="1"
                  data-zv-picker-index={index}
                  data-row-kind={row.kind ?? 'item'}
                  data-marked={isMarked ? 'true' : undefined}
                  className={`picker-row${row.boundary ? ' boundary' : ''}${cells ? ' picker-row-bibliographic' : ''}`}
                  role="option"
                  aria-selected={model.multiSelect ? (markable ? isMarked : undefined) : active}
                  ref={active ? markSelected : undefined}
                  data-picker-clickable={model.mouseEnabled ? '' : undefined}
                >
                  {cells ? (
                    <BibliographicCells cells={cells} check={check} icon={icon} />
                  ) : (
                    <>
                      {check}
                      {icon}
                      {columns ? (
                        <StructuredColumns columns={columns} />
                      ) : (
                        <span className="picker-cell-title picker-row-text" title={row.text}>
                          {row.text}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="picker-empty">{model.empty}</div>
          )}
        </div>
        {model.panes === 2 && <PickerPreview model={model} titleID={previewTitleID} />}
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

function PickerPreview({
  model,
  titleID,
}: {
  model: PickerReactModel;
  titleID: string;
}): React.ReactNode {
  const hasStructuredPreview =
    model.previewSections !== undefined || model.previewMeta !== undefined;
  return (
    <section
      className={`picker-preview-panel${hasStructuredPreview ? ' picker-preview-bibliographic' : ''}`}
      data-neo-ui-part="preview"
      data-picker-focused={model.focusPane === 'preview' ? '' : undefined}
      tabIndex={-1}
      aria-labelledby={titleID}
    >
      <h2 className="picker-preview-title" data-neo-ui-part="preview-title" id={titleID}>
        {model.previewTitle}
      </h2>
      {model.previewMeta && <p className="picker-preview-meta">{model.previewMeta}</p>}
      {model.previewCitekey && <p className="picker-preview-citekey">@{model.previewCitekey}</p>}
      {hasStructuredPreview ? (
        model.previewSections?.map((section, index) => (
          <div className="picker-preview-card" key={index}>
            <h3 className="picker-preview-card-title">
              {section.title} <span className="picker-preview-card-count">{section.count}</span>
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
        ))
      ) : (
        <div className="picker-preview-body">{model.previewBody}</div>
      )}
    </section>
  );
}

export function mountPickerReactView(
  root: HTMLElement,
  initialModel: PickerReactModel,
  _dispatch: (command: PickerReactCommand) => void,
): ReactView<PickerReactModel> {
  return createReactView(root, (model) => <PickerSurface model={model} />, initialModel);
}
