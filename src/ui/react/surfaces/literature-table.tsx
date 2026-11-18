import {
  literatureFilterOperators,
  validLiteratureFilter,
} from '../../../literature-table/filters';
import { cleanLiteratureViewName } from '../../../literature-table/view-storage';
import {
  MAX_LITERATURE_FILTERS,
  MAX_LITERATURE_FILTER_VALUE,
  MAX_LITERATURE_VIEW_NAME,
  type LiteratureFilter,
  type LiteratureFilterOperator,
} from '../../../literature-table/views';
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
.neo-literature-column-list { max-height: min(22rem, 40vh); overflow-y: auto; }
.neo-literature-grid { min-height: 0; overflow: auto; border: 1px solid var(--zotero-neo-border, GrayText); border-radius: 5px; }
.neo-literature-grid table { width: 100%; border-collapse: separate; border-spacing: 0; }
.neo-literature-grid th, .neo-literature-grid td { text-align: start; overflow-wrap: anywhere; border-bottom: 1px solid var(--zotero-neo-border, GrayText); padding: 6px 10px; }
.neo-literature-grid tbody tr:last-child td { border-bottom: 0; }
.neo-literature-grid thead { position: sticky; top: 0; z-index: 1; background: var(--zotero-neo-elevated, Canvas); }
.neo-literature-grid [data-column-id="title"] { min-width: 13rem; }
.neo-literature-grid [data-column-id="year"] { min-width: 5rem; }
.neo-literature-grid th button { width: 100%; text-align: start; }
.neo-literature-grid td[data-cell-state="missing"], .neo-literature-grid td[data-cell-state="ambiguous"] { color: var(--zotero-neo-muted, GrayText); }
.neo-literature-grid td[data-cell-state^="invalid"] span { text-decoration: underline dotted; }
.neo-literature-cell-values { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; padding: 0; margin: 0; }
.neo-literature-cell-values li { border: 1px solid var(--zotero-neo-border, GrayText); border-radius: 4px; padding-inline: 4px; min-width: 0; }
.neo-literature-pages { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.neo-literature-view-controls, .neo-literature-filter-controls { display: flex; flex-direction: column; gap: 8px; }
.neo-literature-view-actions, .neo-literature-filter-editor, .neo-literature-filter-rule { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.neo-literature-filter-editor label, .neo-literature-view-controls label { display: flex; align-items: center; gap: 6px; }
.neo-literature-filter-rules { display: flex; flex-direction: column; gap: 6px; margin: 0; padding-inline-start: 1.5rem; }
.neo-literature-view-controls input, .neo-literature-filter-editor input { max-width: 20rem; }
`;

const VIEW_TEXT = {
  en: {
    filters: 'Filters',
    noFilters: 'No filters applied.',
    count: (shown: number, total: number) => `${shown} of ${total} items`,
    noMatch: 'No items match these filters.',
    filterUnavailable: 'A filter is missing or incompatible. Edit or remove it to see results.',
    missingField: 'Unavailable field',
    field: 'Field',
    chooseField: 'Choose a field',
    operator: 'Operator',
    value: 'Value',
    chooseOption: 'Choose an option',
    missingOption: 'Unavailable option',
    apply: 'Apply filter',
    edit: 'Edit',
    remove: 'Remove',
    cancel: 'Cancel',
    editingChanged: 'This rule changed while you were editing. Cancel and edit it again.',
    invalidFilter: 'Choose a compatible operator and enter a valid value.',
    filterLimit: 'Remove a filter before adding another.',
    savedViews: 'Saved views',
    tagHint: 'Enter one exact, case-sensitive tag. Add another tag filter to require both.',
    dateHint: 'Enter YYYY, YYYY-MM or YYYY-MM-DD.',
    temporary: 'Temporary view',
    dirty: 'Unsaved changes',
    reload: 'Reload saved view',
    switchWarning: 'Switching or reloading discards unsaved changes to this view.',
    confirmSwitch: 'Discard changes and continue',
    saveAs: 'Save as',
    rename: 'Rename saved view',
    update: 'Update saved view',
    name: 'View name',
    save: 'Save',
    delete: 'Delete saved view',
    deleteWarning: 'Delete this saved view? This cannot be undone.',
    confirmDelete: 'Confirm delete',
    layoutUnavailable:
      'Some saved columns or sorting could not be restored. Update the view to save the current usable layout.',
    messages: {
      saved: 'View saved.',
      deleted: 'View deleted.',
      duplicate:
        'A view with that name already exists. Choose another name; it was not overwritten.',
      conflict:
        'This view changed or was removed elsewhere. Reselect or reload it, or save as a new view.',
      'storage-error': 'Could not save the change. Please try again.',
    },
    operators: {
      contains: 'contains',
      equals: 'equals',
      'at-least': 'at least',
      'has-tag': 'has tag',
      'has-choice': 'includes option',
      on: 'on',
      'on-or-after': 'on or after',
      'on-or-before': 'on or before',
      'at-most': 'at most',
      has: 'has PDF',
      missing: 'missing PDF',
    },
  },
  'zh-CN': {
    filters: '筛选',
    noFilters: '未应用筛选条件。',
    count: (shown: number, total: number) => `${total} 条中显示 ${shown} 条`,
    noMatch: '没有条目符合这些筛选条件。',
    filterUnavailable: '筛选条件缺失或不兼容。请编辑或移除后查看结果。',
    missingField: '不可用的字段',
    field: '字段',
    chooseField: '选择字段',
    operator: '运算符',
    value: '值',
    chooseOption: '选择一项',
    missingOption: '不可用的选项',
    apply: '应用筛选',
    edit: '编辑',
    remove: '移除',
    cancel: '取消',
    editingChanged: '编辑期间此条件已更改。请取消并重新编辑。',
    invalidFilter: '请选择兼容的条件，并输入有效值或选择现有选项。',
    filterLimit: '请先移除一个筛选条件，再添加新条件。',
    savedViews: '已保存的视图',
    tagHint: '输入一个完整的标签，区分大小写。添加另一条标签筛选可同时要求两个标签。',
    dateHint: '请输入 YYYY、YYYY-MM 或 YYYY-MM-DD。',
    temporary: '临时视图',
    dirty: '未保存的更改',
    reload: '重新载入已保存的视图',
    switchWarning: '切换或重新载入会丢弃未保存的设置。',
    confirmSwitch: '丢弃更改并继续',
    saveAs: '另存为视图',
    rename: '重命名已保存的视图',
    update: '更新视图',
    name: '视图名称',
    save: '保存',
    delete: '删除已保存的视图',
    deleteWarning: '确定删除此视图？此操作无法撤销。',
    confirmDelete: '确认删除',
    layoutUnavailable: '部分已保存的列或排序无法恢复。更新视图可保存当前可用的布局。',
    messages: {
      saved: '视图已保存。',
      deleted: '视图已删除。',
      duplicate: '已有同名视图。请选择其他名称；原视图未被覆盖。',
      conflict: '此视图已在其他位置更改或删除。请重新选择或载入，或另存为新视图。',
      'storage-error': '无法读取或写入已保存的视图。已有配置未被覆盖。',
    },
    operators: {
      contains: '包含',
      equals: '等于',
      'at-least': '至少',
      'at-most': '至多',
      has: '有 PDF',
      'has-tag': '有标签',
      'has-choice': '包含选项',
      on: '在此日期',
      'on-or-after': '在此日期或之后',
      'on-or-before': '在此日期或之前',
      missing: '无 PDF',
    },
  },
} as const;

type ControlsProps = {
  model: LiteratureTableModel;
  dispatch: (command: LiteratureTableCommand) => void;
};

function FilterControls({ model, dispatch }: ControlsProps) {
  const text = VIEW_TEXT[model.language];
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<LiteratureFilter | null>(null);
  const [editing, setEditing] = React.useState<{
    index: number;
    original: LiteratureFilter;
  } | null>(null);
  const field = model.filterFields.find(({ id }) => id === draft?.field);
  const current = editing && model.filters[editing.index];
  const changed =
    !!editing &&
    (!current ||
      current.field !== editing.original.field ||
      current.kind !== editing.original.kind ||
      current.operator !== editing.original.operator ||
      current.value !== editing.original.value);

  const cancel = () => {
    setDraft(null);
    setEditing(null);
  };

  return (
    <div className="neo-literature-filter-controls">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary data-neo-ui-part="filters">{text.filters}</summary>
        <div className="neo-literature-filter-editor">
          <label>
            {text.field}
            <select
              data-neo-ui-part="filter-field"
              value={draft?.field ?? ''}
              onChange={(event) => {
                const next = model.filterFields.find(({ id }) => id === event.currentTarget.value);
                if (!next) {
                  setDraft(null);
                  return;
                }
                setDraft({
                  field: next.id,
                  kind: next.kind,
                  operator: literatureFilterOperators(next.kind)[0]!,
                  value: '',
                });
              }}
            >
              <option value="">{text.chooseField}</option>
              {draft && !field && (
                <option value={draft.field}>
                  {text.missingField}: {draft.field}
                </option>
              )}
              {model.filterFields.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {draft && field && (
            <>
              <label>
                {text.operator}
                <select
                  data-neo-ui-part="filter-operator"
                  value={draft.operator}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      kind: field.kind,
                      operator: event.currentTarget.value as LiteratureFilterOperator,
                      value: field.kind === 'pdf' ? '' : draft.value,
                    })
                  }
                >
                  {!literatureFilterOperators(field.kind).includes(draft.operator) && (
                    <option value={draft.operator}>{draft.operator}</option>
                  )}
                  {literatureFilterOperators(field.kind).map((operator) => (
                    <option key={operator} value={operator}>
                      {text.operators[operator]}
                    </option>
                  ))}
                </select>
              </label>
              {field.options ? (
                <label>
                  {text.value}
                  <select
                    data-neo-ui-part="filter-value"
                    value={draft.value}
                    onChange={(event) => setDraft({ ...draft, value: event.currentTarget.value })}
                  >
                    <option value="">{text.chooseOption}</option>
                    {draft.value && !field.options.some(({ id }) => id === draft.value) && (
                      <option value={draft.value} disabled>
                        {text.missingOption}: {draft.value}
                      </option>
                    )}
                    {field.options.map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : field.kind !== 'pdf' ? (
                <label>
                  {text.value}
                  <input
                    data-neo-ui-part="filter-value"
                    value={draft.value}
                    maxLength={MAX_LITERATURE_FILTER_VALUE}
                    onChange={(event) => setDraft({ ...draft, value: event.currentTarget.value })}
                  />
                </label>
              ) : null}
              {field.kind === 'pdf' && (
                <p className="neo-muted">
                  {model.language === 'zh-CN'
                    ? '按附件记录判断，不检查下载状态。'
                    : 'Uses attachment records, not download status.'}
                </p>
              )}
              {field.kind === 'tags' && <p className="neo-muted">{text.tagHint}</p>}
              {field.kind === 'date' && <p className="neo-muted">{text.dateHint}</p>}
            </>
          )}
          <Button
            data-neo-ui-part="filter-apply"
            disabled={
              !draft ||
              !field ||
              changed ||
              !validLiteratureFilter(draft, field.kind, field.options) ||
              (!editing && model.filters.length >= MAX_LITERATURE_FILTERS)
            }
            onClick={() => {
              if (!draft) return;
              dispatch({
                type: 'filter-set',
                ...(editing ? { index: editing.index } : {}),
                filter: draft,
              });
              cancel();
            }}
          >
            {text.apply}
          </Button>
          {(draft || editing) && <Button onClick={cancel}>{text.cancel}</Button>}
        </div>
        {draft && field && !validLiteratureFilter(draft, field.kind, field.options) && (
          <p>{text.invalidFilter}</p>
        )}
        {!editing && model.filters.length >= MAX_LITERATURE_FILTERS && <p>{text.filterLimit}</p>}
        {changed && <p role="alert">{text.editingChanged}</p>}
      </details>
      <p data-neo-ui-part="filter-count" role="status">
        {text.count(model.total, model.scopeTotal)}
      </p>
      {model.filterUnavailable && (
        <p data-neo-ui-part="filter-unavailable" role="alert">
          {text.filterUnavailable}
        </p>
      )}
      {model.filters.length === 0 ? (
        <p>{text.noFilters}</p>
      ) : (
        <ul className="neo-literature-filter-rules">
          {model.filters.map((filter, index) => {
            const ruleField = model.filterFields.find(({ id }) => id === filter.field);
            const valid =
              ruleField && validLiteratureFilter(filter, ruleField.kind, ruleField.options);
            const value = ruleField?.options
              ? (ruleField.options.find(({ id }) => id === filter.value)?.label ??
                `${text.missingOption}: ${filter.value}`)
              : filter.value;
            return (
              <li key={index} className="neo-literature-filter-rule">
                <span>
                  {ruleField?.label ?? `${text.missingField}: ${filter.field}`}{' '}
                  {text.operators[filter.operator] ?? filter.operator}
                  {value ? `: ${value}` : ''}
                  {!valid && ` — ${text.filterUnavailable}`}
                </span>
                <Button
                  data-neo-ui-part="filter-edit"
                  aria-label={`${text.edit}: ${ruleField?.label ?? filter.field} ${index + 1}`}
                  onClick={() => {
                    setEditing({ index, original: { ...filter } });
                    setDraft({ ...filter, value: ruleField?.kind === 'pdf' ? '' : filter.value });
                    setOpen(true);
                  }}
                >
                  {text.edit}
                </Button>
                <Button
                  data-neo-ui-part="filter-remove"
                  aria-label={`${text.remove}: ${ruleField?.label ?? filter.field} ${index + 1}`}
                  onClick={() => {
                    dispatch({ type: 'filter-remove', index });
                    cancel();
                  }}
                >
                  {text.remove}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SavedViewControls({ model, dispatch }: ControlsProps) {
  const text = VIEW_TEXT[model.language];
  const [saving, setSaving] = React.useState<{
    mode: 'save-as' | 'rename';
    source: string | null;
  } | null>(null);
  const [name, setName] = React.useState('');
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{
    name: string | null;
    source: string | null;
  } | null>(null);
  const submitting = React.useRef(false);
  const cleanName = cleanLiteratureViewName(name);
  React.useEffect(() => {
    if (submitting.current && model.viewMessage === 'saved' && model.activeViewName === cleanName) {
      submitting.current = false;
      setSaving(null);
    }
  }, [model.viewMessage, model.activeViewName, cleanName]);
  const activeMissing =
    model.activeViewName !== null && !model.viewNames.includes(model.activeViewName);

  const open = (next: string | null) => {
    setDeleting(null);
    setSaving(null);
    submitting.current = false;
    if (model.activeViewName && model.viewDirty) {
      setPending({ name: next, source: model.activeViewName });
    } else {
      setPending(null);
      dispatch({ type: 'view-open', name: next });
    }
  };

  return (
    <div className="neo-literature-view-controls">
      <div className="neo-literature-view-actions">
        <label>
          {text.savedViews}
          <select
            data-neo-ui-part="saved-view"
            value={model.activeViewName ?? ''}
            onChange={(event) => open(event.currentTarget.value || null)}
          >
            <option value="">{text.temporary}</option>
            {activeMissing && <option value={model.activeViewName!}>{model.activeViewName}</option>}
            {model.viewNames.map((viewName) => (
              <option key={viewName} value={viewName}>
                {viewName}
              </option>
            ))}
          </select>
        </label>
        {model.viewDirty && model.activeViewName && <span>{text.dirty}</span>}
        {model.activeViewName && (
          <Button onClick={() => open(model.activeViewName)}>{text.reload}</Button>
        )}
        <Button
          data-neo-ui-part="view-save-as"
          disabled={!model.viewCanSave}
          onClick={() => {
            setName('');
            setSaving({ mode: 'save-as', source: model.activeViewName });
          }}
        >
          {text.saveAs}
        </Button>
        {model.activeViewName && (
          <Button
            data-neo-ui-part="view-update"
            disabled={!model.viewCanSave}
            onClick={() =>
              dispatch({ type: 'view-save', name: model.activeViewName!, replace: true })
            }
          >
            {text.update}
          </Button>
        )}
        {model.activeViewName && (
          <Button
            data-neo-ui-part="view-rename"
            disabled={!model.viewCanSave}
            onClick={() => {
              setName(model.activeViewName!);
              setSaving({ mode: 'rename', source: model.activeViewName });
            }}
          >
            {text.rename}
          </Button>
        )}
        {model.activeViewName && (
          <Button data-neo-ui-part="view-delete" onClick={() => setDeleting(model.activeViewName)}>
            {text.delete}
          </Button>
        )}
      </div>
      {pending && (
        <div className="neo-literature-view-actions">
          <span>{text.switchWarning}</span>
          <Button
            disabled={pending.source !== model.activeViewName}
            onClick={() => {
              dispatch({ type: 'view-open', name: pending.name });
              setPending(null);
            }}
          >
            {text.confirmSwitch}
          </Button>
          <Button onClick={() => setPending(null)}>{text.cancel}</Button>
        </div>
      )}
      {saving && (
        <div className="neo-literature-view-actions">
          <label>
            {text.name}
            <input
              data-neo-ui-part="view-name"
              value={name}
              maxLength={MAX_LITERATURE_VIEW_NAME}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <Button
            data-neo-ui-part="view-save"
            disabled={
              !model.viewCanSave ||
              !cleanName ||
              (saving.mode === 'rename' && saving.source !== model.activeViewName)
            }
            onClick={() => {
              if (!cleanName) return;
              submitting.current = true;
              dispatch({ type: 'view-save', name: cleanName, replace: saving.mode === 'rename' });
            }}
          >
            {text.save}
          </Button>
          <Button
            onClick={() => {
              submitting.current = false;
              setSaving(null);
            }}
          >
            {text.cancel}
          </Button>
        </div>
      )}
      {deleting && (
        <div className="neo-literature-view-actions">
          <span>{text.deleteWarning}</span>
          <Button
            data-neo-ui-part="view-delete-confirm"
            disabled={deleting !== model.activeViewName}
            onClick={() => {
              dispatch({ type: 'view-delete' });
              setDeleting(null);
            }}
          >
            {text.confirmDelete}
          </Button>
          <Button onClick={() => setDeleting(null)}>{text.cancel}</Button>
        </div>
      )}
      {model.layoutUnavailable && (
        <p data-neo-ui-part="view-layout-unavailable" role="alert">
          {text.layoutUnavailable}
        </p>
      )}
      {model.viewMessage && (
        <p
          data-neo-ui-part="view-message"
          role={
            model.viewMessage === 'saved' || model.viewMessage === 'deleted' ? 'status' : 'alert'
          }
        >
          {text.messages[model.viewMessage]}
        </p>
      )}
    </div>
  );
}

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
              : model.filterUnavailable
                ? null
                : model.total === 0
                  ? model.scopeTotal === 0
                    ? text.empty
                    : VIEW_TEXT[model.language].noMatch
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
              <div className="neo-literature-column-list">
                {model.choices.map(({ id, columnID, label, shown }) => (
                  <label key={id} className="neo-literature-column">
                    <input
                      type="checkbox"
                      data-neo-ui-part="column-toggle"
                      data-column-id={columnID}
                      checked={shown}
                      onChange={() => dispatch({ type: 'column', id })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <SavedViewControls model={model} dispatch={dispatch} />
          <FilterControls model={model} dispatch={dispatch} />
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
          {status === 'ready' && !model.filterUnavailable && (
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
                            {'values' in cell ? (
                              <ul className="neo-literature-cell-values" role="list">
                                {cell.values.map((value, index) => (
                                  <li key={index}>{value}</li>
                                ))}
                              </ul>
                            ) : 'value' in cell ? (
                              <span
                                title={
                                  cell.state === 'invalid'
                                    ? text.invalid
                                    : cell.state === 'invalid-date'
                                      ? text.invalidDate
                                      : cell.state === 'invalid-choice'
                                        ? text.invalidChoice
                                        : undefined
                                }
                              >
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
