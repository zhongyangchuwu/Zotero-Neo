import { Menu, Popover, Radio, RadioGroup, Checkbox } from '../../../../vendor/base-ui/index.js';
import {
  encodeAttributeChoices,
  normalizeAttributeValue,
  readAttributeChoices,
} from '../../../item-attributes/extra';
import { isChoiceAttribute } from '../../../item-attributes/types';
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
  type LiteratureFilterField,
  type LiteratureFilterOperator,
} from '../../../literature-table/views';
import {
  LITERATURE_TABLE_TEXT,
  type LiteratureColumnID,
  type LiteratureLanguage,
  type LiteratureSortDirection,
  type LiteratureTableCommand,
  type LiteratureTableModel,
} from '../../../literature-table/model';
import { Button } from '../components';
import { React } from '../runtime';
import type { ReactView } from '../types';
import { createReactView } from '../view';

export { LITERATURE_TABLE_CSS } from './literature-table-style';

const VIEW_TEXT = {
  en: {
    filters: 'Filters',
    filter: 'Filter',
    sort: 'Sort',
    searchFields: 'Search fields',
    searchOptions: 'Search options',
    noMatchingOptions: 'No matching options.',
    searchColumns: 'Search columns',
    noResults: 'No matching fields.',
    ascending: 'Ascending',
    descending: 'Descending',
    hide: 'Hide column',
    viewActions: 'View actions',
    pinned: 'Pinned',
    locate: 'Locate',
    clear: 'Clear value',
    savingCell: 'Saving…',
    savedCell: 'Value saved.',
    saveFailed: 'Could not save this value.',
    invalidCell: 'Enter a valid value.',
    repairChoice: 'Choose a replacement, keep available options, or clear this value.',
    keepChoices: 'Keep available options',
    noChoices: 'No options are available.',
    editCell: (label: string, item: string | number) => `Edit ${label} for ${item}`,
    count: (shown: number, total: number) => `${shown} of ${total} items`,
    noMatch: 'No items match these filters.',
    filterUnavailable: 'A filter is missing or incompatible. Edit or remove it to see results.',
    missingField: 'Unavailable field',
    field: 'Field',
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
    filter: '筛选',
    sort: '排序',
    searchFields: '搜索字段',
    searchOptions: '搜索选项',
    noMatchingOptions: '没有匹配的选项。',
    searchColumns: '搜索列',
    noResults: '没有匹配的字段。',
    ascending: '升序',
    descending: '降序',
    hide: '隐藏列',
    viewActions: '视图操作',
    pinned: '已固定',
    locate: '定位',
    clear: '清除值',
    savingCell: '正在保存…',
    savedCell: '值已保存。',
    saveFailed: '无法保存此值。',
    invalidCell: '请输入有效的值。',
    repairChoice: '请选择替代选项、保留可用选项，或清除此值。',
    keepChoices: '保留可用选项',
    noChoices: '没有可用的选项。',
    editCell: (label: string, item: string | number) => `编辑 ${item} 的${label}`,
    filters: '筛选',
    count: (shown: number, total: number) => `${total} 条中显示 ${shown} 条`,
    noMatch: '没有条目符合这些筛选条件。',
    filterUnavailable: '筛选条件缺失或不兼容。请编辑或移除后查看结果。',
    missingField: '不可用的字段',
    field: '字段',
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

type PortalTarget = HTMLElement | null;

type FilterSession = {
  draft: LiteratureFilter | null;
  editing?: { index: number; original: LiteratureFilter };
};

const placement = { align: 'start', sideOffset: 5, collisionPadding: 8 } as const;

function filterFor(field: LiteratureFilterField): LiteratureFilter {
  return {
    field: field.id,
    kind: field.kind,
    operator: literatureFilterOperators(field.kind)[0]!,
    value: '',
  };
}

function matchesSearch(value: string, search: string, language: LiteratureLanguage): boolean {
  return value.toLocaleLowerCase(language).includes(search.trim().toLocaleLowerCase(language));
}

function FilterForm({
  model,
  dispatch,
  session,
  setSession,
}: ControlsProps & {
  session: FilterSession;
  setSession: (session: FilterSession | null) => void;
}) {
  const text = VIEW_TEXT[model.language];
  const { draft, editing } = session;
  const [chooseField, setChooseField] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const operatorRef = React.useRef<HTMLSelectElement>(null);
  const focusOperator = React.useRef(false);
  const choosing = !draft || chooseField;
  React.useLayoutEffect(() => {
    if (!choosing && focusOperator.current) {
      focusOperator.current = false;
      operatorRef.current?.focus();
    }
  }, [choosing]);
  const field = model.filterFields.find(({ id }) => id === draft?.field);
  const current = editing && model.filters[editing.index];
  const changed =
    !!editing &&
    (!current ||
      current.field !== editing.original.field ||
      current.kind !== editing.original.kind ||
      current.operator !== editing.original.operator ||
      current.value !== editing.original.value);

  const matching = choosing
    ? model.filterFields.filter(({ label, id }) =>
        matchesSearch(`${label} ${id}`, query, model.language),
      )
    : [];
  const valid = !!draft && !!field && validLiteratureFilter(draft, field.kind, field.options);
  const limit = !editing && model.filters.length >= MAX_LITERATURE_FILTERS;
  const fieldLabel = field?.label ?? (draft ? `${text.missingField}: ${draft.field}` : '');
  return (
    <>
      <Popover.Title>{text.filters}</Popover.Title>
      {draft && (
        <button
          type="button"
          className="neo-literature-option"
          data-neo-ui-part="filter-field"
          aria-expanded={choosing}
          onClick={() => {
            setQuery('');
            setChooseField(!chooseField);
          }}
        >
          {text.field}: {fieldLabel} ▾
        </button>
      )}
      {choosing && (
        <>
          <input
            type="search"
            data-neo-ui-part="filter-search"
            aria-label={text.searchFields}
            placeholder={text.searchFields}
            autoFocus={chooseField}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className="neo-literature-options">
            {matching.length === 0 && <p className="neo-muted">{text.noResults}</p>}
            {matching.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="neo-literature-option"
                data-neo-ui-part="filter-field-option"
                data-column-id={candidate.id}
                onClick={() => {
                  focusOperator.current = true;
                  setChooseField(false);
                  setSession({ ...session, draft: filterFor(candidate) });
                }}
              >
                <FieldIcon kind={candidate.kind} />
                {candidate.label}
              </button>
            ))}
          </div>
        </>
      )}
      {!choosing && draft && field && (
        <>
          <label className="neo-literature-field">
            {text.operator}
            <select
              data-neo-ui-part="filter-operator"
              ref={operatorRef}
              value={draft.operator}
              onChange={(event) =>
                setSession({
                  ...session,
                  draft: {
                    ...draft,
                    kind: field.kind,
                    operator: event.currentTarget.value as LiteratureFilterOperator,
                    value: field.kind === 'pdf' ? '' : draft.value,
                  },
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
            <label className="neo-literature-field">
              {text.value}
              <select
                data-neo-ui-part="filter-value"
                value={draft.value}
                onChange={(event) =>
                  setSession({ ...session, draft: { ...draft, value: event.currentTarget.value } })
                }
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
            <label className="neo-literature-field">
              {text.value}
              <input
                data-neo-ui-part="filter-value"
                value={draft.value}
                maxLength={MAX_LITERATURE_FILTER_VALUE}
                onChange={(event) =>
                  setSession({ ...session, draft: { ...draft, value: event.currentTarget.value } })
                }
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
      <div className="neo-literature-popup-actions">
        <Button
          data-neo-ui-part="filter-apply"
          disabled={!valid || changed || limit}
          onClick={() => {
            if (!draft || !valid || changed || limit) return;
            dispatch({
              type: 'filter-set',
              ...(editing ? { index: editing.index } : {}),
              filter: draft,
            });
            setSession(null);
          }}
        >
          {text.apply}
        </Button>
        <Button onClick={() => setSession(null)}>{text.cancel}</Button>
      </div>
      {!choosing && draft && !valid && <p className="neo-muted">{text.invalidFilter}</p>}
      {limit && <p>{text.filterLimit}</p>}
      {changed && <p role="alert">{text.editingChanged}</p>}
    </>
  );
}

function SavedViewControls({
  model,
  dispatch,
  portal,
  children,
}: ControlsProps & { portal: PortalTarget; children: React.ReactNode }) {
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
  const focusViewForm = React.useRef(false);
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
    <>
      <div className="neo-literature-toolbar">
        <select
          data-neo-ui-part="saved-view"
          aria-label={text.savedViews}
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
        {model.viewDirty && model.activeViewName && <span className="neo-muted">{text.dirty}</span>}
        {children}
        <Menu.Root
          modal={false}
          onOpenChange={(isOpen) => {
            if (isOpen) focusViewForm.current = false;
          }}
        >
          <Menu.Trigger
            className="neo-literature-control"
            data-neo-ui-part="view-actions"
            aria-label={text.viewActions}
            title={text.viewActions}
          >
            ⋯
          </Menu.Trigger>
          {portal && (
            <Menu.Portal container={portal}>
              <Menu.Positioner {...placement} align="end" className="neo-literature-positioner">
                <Menu.Popup
                  className="neo-literature-popup"
                  aria-label={text.viewActions}
                  finalFocus={() => !focusViewForm.current}
                >
                  <Menu.Item
                    className="neo-literature-option"
                    data-neo-ui-part="view-save-as"
                    disabled={!model.viewCanSave}
                    onClick={() => {
                      focusViewForm.current = true;
                      setPending(null);
                      setDeleting(null);
                      submitting.current = false;
                      setName('');
                      setSaving({ mode: 'save-as', source: model.activeViewName });
                    }}
                  >
                    {text.saveAs}
                  </Menu.Item>
                  {model.activeViewName && (
                    <>
                      <Menu.Item
                        className="neo-literature-option"
                        data-neo-ui-part="view-update"
                        disabled={!model.viewCanSave}
                        onClick={() =>
                          dispatch({
                            type: 'view-save',
                            name: model.activeViewName!,
                            replace: true,
                          })
                        }
                      >
                        {text.update}
                      </Menu.Item>
                      <Menu.Item
                        className="neo-literature-option"
                        data-neo-ui-part="view-rename"
                        disabled={!model.viewCanSave}
                        onClick={() => {
                          focusViewForm.current = true;
                          setPending(null);
                          setDeleting(null);
                          submitting.current = false;
                          setName(model.activeViewName!);
                          setSaving({ mode: 'rename', source: model.activeViewName });
                        }}
                      >
                        {text.rename}
                      </Menu.Item>
                      <Menu.Item
                        className="neo-literature-option"
                        data-neo-ui-part="view-reload"
                        onClick={() => {
                          focusViewForm.current = model.viewDirty;
                          open(model.activeViewName);
                        }}
                      >
                        {text.reload}
                      </Menu.Item>
                      <Menu.Item
                        className="neo-literature-option"
                        data-neo-ui-part="view-delete"
                        onClick={() => {
                          focusViewForm.current = true;
                          setPending(null);
                          setSaving(null);
                          submitting.current = false;
                          setDeleting(model.activeViewName);
                        }}
                      >
                        {text.delete}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          )}
        </Menu.Root>
      </div>
      {pending && (
        <div className="neo-literature-view-actions">
          <span>{text.switchWarning}</span>
          <Button
            autoFocus
            data-neo-ui-part="view-discard-confirm"
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
              autoFocus
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
            autoFocus
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
    </>
  );
}

const FIELD_ICONS = {
  text: 'Aa',
  number: '#',
  date: '▦',
  tags: '◇',
  'single-select': '◉',
  'multi-select': '☷',
  pdf: '▤',
} satisfies Record<LiteratureFilterField['kind'], string>;

function FieldIcon({ kind }: { kind: LiteratureFilterField['kind'] }) {
  return (
    <span className="neo-literature-type-icon" aria-hidden="true">
      {FIELD_ICONS[kind]}
    </span>
  );
}

const SORT_DIRECTIONS = ['ascending', 'descending'] as const;

function SortForm({ model, dispatch, close }: ControlsProps & { close: () => void }) {
  const text = VIEW_TEXT[model.language];
  const [query, setQuery] = React.useState('');
  const [column, setColumn] = React.useState(model.sortColumn);
  const [direction, setDirection] = React.useState(model.sortDirection);
  const matches = model.columns.filter(({ id, label }) =>
    matchesSearch(`${label} ${id}`, query, model.language),
  );
  return (
    <>
      <Popover.Title>{text.sort}</Popover.Title>
      <input
        type="search"
        data-neo-ui-part="sort-search"
        aria-label={text.searchFields}
        placeholder={text.searchFields}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {matches.length === 0 && <p className="neo-muted">{text.noResults}</p>}
      <RadioGroup<LiteratureColumnID>
        className="neo-literature-options"
        aria-label={text.field}
        value={column}
        onValueChange={setColumn}
      >
        {matches.map(({ id, kind, label }) => (
          <label className="neo-literature-option" key={id}>
            <Radio.Root
              aria-label={label}
              data-neo-ui-part="sort-field"
              data-column-id={id}
              value={id}
            >
              <Radio.Indicator>•</Radio.Indicator>
            </Radio.Root>
            <FieldIcon kind={kind ?? (id === 'year' ? 'number' : 'text')} />
            {label}
          </label>
        ))}
      </RadioGroup>
      <RadioGroup<LiteratureSortDirection>
        className="neo-literature-popup-actions"
        aria-label={text.sort}
        value={direction}
        onValueChange={setDirection}
      >
        {SORT_DIRECTIONS.map((value) => (
          <label className="neo-literature-option neo-literature-sort-direction" key={value}>
            <Radio.Root aria-label={text[value]} data-neo-ui-part={`sort-${value}`} value={value}>
              <Radio.Indicator>•</Radio.Indicator>
            </Radio.Root>
            {text[value]}
          </label>
        ))}
      </RadioGroup>
      <div className="neo-literature-popup-actions">
        <Button
          data-neo-ui-part="sort-apply"
          disabled={!model.columns.some(({ id }) => id === column)}
          onClick={() => {
            dispatch({ type: 'sort', id: column, direction });
            close();
          }}
        >
          {text.sort}
        </Button>
        <Button onClick={close}>{text.cancel}</Button>
      </div>
    </>
  );
}

function ColumnChooser({ model, dispatch }: ControlsProps) {
  const text = VIEW_TEXT[model.language];
  const labels = LITERATURE_TABLE_TEXT[model.language];
  const [query, setQuery] = React.useState('');
  const matches = model.choices.filter(({ label, columnID }) =>
    matchesSearch(`${label} ${columnID}`, query, model.language),
  );
  const kinds = new Map(model.filterFields.map(({ id, kind }) => [id, kind]));
  const showPinned = matchesSearch(`${labels.title} title`, query, model.language);
  return (
    <>
      <Popover.Title>{labels.columns}</Popover.Title>
      <input
        type="search"
        data-neo-ui-part="column-search"
        aria-label={text.searchColumns}
        placeholder={text.searchColumns}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="neo-literature-options">
        {showPinned && (
          <div className="neo-literature-option neo-muted" data-neo-ui-part="column-pinned">
            <FieldIcon kind="text" />
            {labels.title} · {text.pinned}
          </div>
        )}
        {matches.map(({ id, columnID, label, shown }) => (
          <label key={id} className="neo-literature-option">
            <Checkbox.Root
              aria-label={label}
              data-neo-ui-part="column-toggle"
              data-column-id={columnID}
              checked={shown}
              onCheckedChange={() => dispatch({ type: 'column', id })}
            >
              <Checkbox.Indicator>✓</Checkbox.Indicator>
            </Checkbox.Root>
            <FieldIcon kind={kinds.get(columnID) ?? (columnID === 'year' ? 'number' : 'text')} />
            {label}
          </label>
        ))}
        {!model.choices.length ? (
          <p className="neo-muted">{labels.noColumns}</p>
        ) : !matches.length && !showPinned ? (
          <p className="neo-muted">{text.noResults}</p>
        ) : null}
      </div>
    </>
  );
}

function HeaderCell({
  column,
  portal,
  model,
  dispatch,
  setFilter,
  returnToColumns,
}: ControlsProps & {
  column: LiteratureTableModel['columns'][number];
  portal: PortalTarget;
  setFilter: (session: FilterSession) => void;
  returnToColumns: () => void;
}) {
  const text = VIEW_TEXT[model.language];
  const { id, label, kind } = column;
  const direction = id === model.sortColumn ? model.sortDirection : undefined;
  const field = model.filterFields.find((candidate) => candidate.id === id);
  const choice = id !== 'title' && model.choices.find(({ columnID }) => columnID === id);
  const transferFocus = React.useRef(false);
  return (
    <th scope="col" data-column-id={id} aria-sort={direction}>
      <Menu.Root
        modal={false}
        onOpenChange={(open) => {
          if (open) transferFocus.current = false;
        }}
      >
        <Menu.Trigger
          className="neo-literature-control"
          data-neo-ui-part="column-header"
          data-column-id={id}
        >
          <FieldIcon kind={kind ?? field?.kind ?? (id === 'year' ? 'number' : 'text')} />
          <span className="neo-literature-header-name">{label}</span>
          <span aria-hidden="true">
            {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '▾'}
          </span>
        </Menu.Trigger>
        {portal && (
          <Menu.Portal container={portal}>
            <Menu.Positioner {...placement} className="neo-literature-positioner">
              <Menu.Popup
                className="neo-literature-popup"
                aria-label={label}
                data-neo-ui-part="column-menu"
                data-column-id={id}
                finalFocus={() => !transferFocus.current}
              >
                {SORT_DIRECTIONS.map((value) => (
                  <Menu.Item
                    key={value}
                    className="neo-literature-option"
                    data-neo-ui-part={`header-sort-${value}`}
                    onClick={() => dispatch({ type: 'sort', id, direction: value })}
                  >
                    {text[value]}
                  </Menu.Item>
                ))}
                {field && (
                  <Menu.Item
                    className="neo-literature-option"
                    data-neo-ui-part="header-filter"
                    onClick={() => {
                      transferFocus.current = true;
                      setFilter({ draft: filterFor(field) });
                    }}
                  >
                    {text.filter}
                  </Menu.Item>
                )}
                {choice && (
                  <Menu.Item
                    className="neo-literature-option"
                    data-neo-ui-part="header-hide"
                    onClick={() => {
                      transferFocus.current = true;
                      dispatch({ type: 'column', id: choice.id });
                      returnToColumns();
                    }}
                  >
                    {text.hide}
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        )}
      </Menu.Root>
    </th>
  );
}

function FilterChips({
  model,
  dispatch,
  setFilter,
}: ControlsProps & { setFilter: (session: FilterSession | null) => void }) {
  const text = VIEW_TEXT[model.language];
  return model.filters.map((filter, index) => {
    const field = model.filterFields.find(({ id }) => id === filter.field);
    const valid = field && validLiteratureFilter(filter, field.kind, field.options);
    const fieldLabel = field?.label ?? `${text.missingField}: ${filter.field}`;
    const value =
      field?.options && filter.value
        ? (field.options.find(({ id }) => id === filter.value)?.label ??
          `${text.missingOption}: ${filter.value}`)
        : filter.value;
    const summary = `${fieldLabel} ${text.operators[filter.operator] ?? filter.operator}${value ? `: ${value}` : ''}`;
    return (
      <span
        key={index}
        className="neo-literature-chip"
        data-neo-ui-part="filter-chip"
        data-invalid={!valid || undefined}
      >
        <button
          type="button"
          className="neo-literature-control"
          data-neo-ui-part="filter-edit"
          data-column-id={filter.field}
          aria-haspopup="dialog"
          aria-label={`${text.edit}: ${summary}${!valid ? ` — ${text.filterUnavailable}` : ''}`}
          title={summary}
          onClick={() =>
            setFilter({
              editing: { index, original: filter },
              draft: { ...filter, value: field?.kind === 'pdf' ? '' : filter.value },
            })
          }
        >
          {summary}
        </button>
        <button
          type="button"
          className="neo-literature-control"
          data-neo-ui-part="filter-remove"
          data-column-id={filter.field}
          aria-label={`${text.remove}: ${summary}`}
          onClick={() => {
            dispatch({ type: 'filter-remove', index });
            setFilter(null);
          }}
        >
          ×
        </button>
      </span>
    );
  });
}

function ChoiceTag({ id, label }: { id: string; label: string }) {
  // Color follows the immutable option ID, not the label or definition order.
  let hash = 2166136261;
  for (let i = 0; i < id.length; ++i) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (
    <span
      className="neo-literature-tag"
      data-neo-ui-part="choice-tag"
      data-option-id={id}
      data-tone={(hash >>> 0) % 6}
    >
      {label}
    </span>
  );
}

function CellValue({
  cell,
  text,
}: {
  cell: LiteratureTableModel['rows'][number]['cells'][number];
  text: (typeof LITERATURE_TABLE_TEXT)[LiteratureLanguage];
}) {
  if (cell.choices?.length) {
    return (
      <span className="neo-literature-cell-values">
        {cell.choices.map(({ id, label }) => (
          <ChoiceTag key={id} id={id} label={label} />
        ))}
      </span>
    );
  }
  if ('values' in cell) {
    return (
      <ul className="neo-literature-cell-values neo-literature-native-tags" role="list">
        {cell.values.map((value, index) => (
          <li key={index} className="neo-literature-tag">
            {value}
          </li>
        ))}
      </ul>
    );
  }
  if ('value' in cell) {
    const warning =
      cell.state === 'invalid'
        ? text.invalid
        : cell.state === 'invalid-date'
          ? text.invalidDate
          : cell.state === 'invalid-choice'
            ? text.invalidChoice
            : undefined;
    return <span title={warning}>{cell.value}</span>;
  }
  return cell.state === 'ambiguous' ? text.ambiguous : '—';
}

function CellEditForm({
  edit,
  item,
  language,
  blocked,
  submit,
  cancel,
}: {
  edit: NonNullable<LiteratureTableModel['edit']>;
  item: string | number;
  language: LiteratureLanguage;
  blocked: boolean;
  submit: (value: string | null) => void;
  cancel: () => void;
}) {
  const text = VIEW_TEXT[language];
  const { definition } = edit;
  // Snapshot local input only on open. Host refreshes update the rows, not the draft.
  const [draft, setDraft] = React.useState(edit.value);
  const [itemLabel] = React.useState(item);
  const [query, setQuery] = React.useState('');
  const saving = edit.status === 'saving';
  const choice = isChoiceAttribute(definition.type);
  const options = definition.options ?? [];
  const matchingOptions = query
    ? options.filter(({ label }) => matchesSearch(label, query, language))
    : options;
  const ids = choice ? readAttributeChoices(definition, draft) : null;
  const availableIDs = ids?.filter((id) => options.some((option) => option.id === id)) ?? [];
  let normalized: string | null = null;
  let invalid = false;
  try {
    normalized = normalizeAttributeValue(definition, draft);
  } catch {
    invalid = true;
  }

  return (
    <>
      <Popover.Title>{text.editCell(edit.label, itemLabel)}</Popover.Title>
      <form
        className="neo-literature-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && !blocked && !invalid && normalized !== null) submit(normalized);
        }}
      >
        {choice ? (
          <>
            <input
              type="search"
              aria-label={text.searchOptions}
              placeholder={text.searchOptions}
              data-neo-ui-part="cell-search"
              value={query}
              readOnly={saving}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
              }}
            />
            {definition.type === 'multi-select' ? (
              <div className="neo-literature-options" role="group" aria-label={edit.label}>
                {matchingOptions.map(({ id, label }) => (
                  <label className="neo-literature-option" key={id}>
                    <Checkbox.Root
                      aria-label={label}
                      data-neo-ui-part="cell-option"
                      data-option-id={id}
                      checked={ids?.includes(id) ?? false}
                      disabled={saving}
                      onCheckedChange={(checked) => {
                        setDraft(
                          encodeAttributeChoices(
                            checked
                              ? [...availableIDs, id]
                              : availableIDs.filter((value) => value !== id),
                          ),
                        );
                      }}
                    >
                      <Checkbox.Indicator>✓</Checkbox.Indicator>
                    </Checkbox.Root>
                    <ChoiceTag id={id} label={label} />
                  </label>
                ))}
              </div>
            ) : (
              <RadioGroup<string>
                className="neo-literature-options"
                aria-label={edit.label}
                value={availableIDs[0] ?? ''}
                disabled={saving}
                onValueChange={(id) => setDraft(encodeAttributeChoices([id]))}
              >
                {matchingOptions.map(({ id, label }) => (
                  <label className="neo-literature-option" key={id}>
                    <Radio.Root
                      aria-label={label}
                      data-neo-ui-part="cell-option"
                      data-option-id={id}
                      value={id}
                    >
                      <Radio.Indicator>•</Radio.Indicator>
                    </Radio.Root>
                    <ChoiceTag id={id} label={label} />
                  </label>
                ))}
              </RadioGroup>
            )}
            {matchingOptions.length === 0 && (
              <p className="neo-muted" data-neo-ui-part="cell-search-empty" role="status">
                {options.length === 0 ? text.noChoices : text.noMatchingOptions}
              </p>
            )}
            {invalid && (
              <>
                <p data-neo-ui-part="cell-choice-invalid" className="neo-muted">
                  {text.repairChoice}
                </p>
                {availableIDs.length > 0 && (
                  <Button
                    data-neo-ui-part="cell-repair"
                    disabled={saving}
                    onClick={() => setDraft(encodeAttributeChoices(availableIDs))}
                  >
                    {text.keepChoices}
                  </Button>
                )}
              </>
            )}
          </>
        ) : (
          <label className="neo-literature-field">
            {text.value}
            <input
              type="text"
              data-neo-ui-part="cell-value"
              value={draft ?? ''}
              aria-invalid={invalid}
              readOnly={saving}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
        )}
        {!choice && invalid && <p className="neo-muted">{text.invalidCell}</p>}
        {edit.status === 'error' && (
          <p role="alert" data-neo-ui-part="cell-editor-error">
            {edit.message ?? text.saveFailed}
          </p>
        )}
        <div className="neo-literature-popup-actions">
          <Button
            type="submit"
            primary
            data-neo-ui-part="cell-save"
            aria-disabled={saving}
            disabled={blocked || invalid || normalized === null}
          >
            {text.save}
          </Button>
          <Button
            data-neo-ui-part="cell-clear"
            disabled={saving || blocked || edit.value === null}
            onClick={() => submit(null)}
          >
            {text.clear}
          </Button>
          <Button data-neo-ui-part="cell-cancel" disabled={saving} onClick={cancel}>
            {text.cancel}
          </Button>
        </div>
        {saving && (
          <p role="status" data-neo-ui-part="cell-saving">
            {text.savingCell}
          </p>
        )}
      </form>
    </>
  );
}

function LiteratureWorkbench({ model, dispatch }: ControlsProps) {
  const text = LITERATURE_TABLE_TEXT[model.language];
  const workbench = VIEW_TEXT[model.language];
  const { scope, scopes, status, edit } = model;
  const [portal, setPortal] = React.useState<PortalTarget>(null);
  const [filter, setFilter] = React.useState<FilterSession | null>(null);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [cellAnchor, setCellAnchor] = React.useState<HTMLButtonElement | null>(null);
  const [savedNotice, setSavedNotice] = React.useState(false);
  const section = React.useRef<HTMLElement>(null);
  const filterTrigger = React.useRef<HTMLButtonElement>(null);
  const filterPopup = React.useRef<HTMLDivElement>(null);
  const editorPopup = React.useRef<HTMLDivElement>(null);
  const columnsTrigger = React.useRef<HTMLButtonElement>(null);
  const nextRequest = React.useRef(0);
  const editorID = React.useId();
  const openEdit = edit !== undefined && edit.status !== 'saved';
  const editColumn = edit?.column;
  const editItem = edit?.id;
  const editStatus = edit?.status;
  const editRequest = edit?.requestId;
  const editIsFiltered = model.filters.some(({ field }) => field === editColumn);
  const titleColumn = model.columns.findIndex(({ id }) => id === 'title');
  const editTitleCell = openEdit
    ? model.rows.find(({ id }) => id === editItem)?.cells[titleColumn]
    : undefined;
  const editTitle = editTitleCell && 'value' in editTitleCell ? editTitleCell.value : editItem;

  const restoreEditFocus = React.useCallback(() => {
    if (editItem === undefined || editColumn === undefined) return;
    const column = `[data-column-id="${CSS.escape(editColumn)}"]`;
    const cell = section.current?.querySelector<HTMLButtonElement>(
      `[data-neo-ui-part="cell-edit"][data-item-id="${editItem}"]${column}`,
    );
    if (cell) {
      cell.focus();
      return;
    }
    const header = !editIsFiltered
      ? section.current?.querySelector<HTMLButtonElement>(
          `[data-neo-ui-part="column-header"]${column}`,
        )
      : null;
    (header || filterTrigger.current)?.focus();
  }, [editItem, editColumn, editIsFiltered]);

  React.useLayoutEffect(() => {
    if (editStatus !== 'saved') return;
    restoreEditFocus();
    // The bridge may call flushSync when acknowledging. Let this commit finish first.
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setSavedNotice(true);
      dispatch({ type: 'cell-cancel' });
    });
    return () => {
      current = false;
    };
  }, [editStatus, editRequest, dispatch, restoreEditFocus]);

  const cancelEdit = () => {
    if (editStatus === 'saving') return;
    dispatch({ type: 'cell-cancel' });
    restoreEditFocus();
  };

  const unavailableScope = scope && !scopes.some(({ id }) => id === scope.id);
  const retryable = status === 'unavailable' || status === 'error';
  const statusText =
    status === 'loading'
      ? text.loading
      : status === 'unavailable'
        ? text.unavailable
        : status === 'error'
          ? text.error
          : model.filterUnavailable || model.total !== 0
            ? null
            : model.scopeTotal === 0
              ? text.empty
              : workbench.noMatch;
  const sortLabel = model.columns.find(({ id }) => id === model.sortColumn)?.label ?? text.title;

  return (
    <section
      ref={section}
      className="neo-ui neo-literature-table"
      data-neo-ui-part="literature-table"
    >
      <h1>{text.heading}</h1>
      <SavedViewControls model={model} dispatch={dispatch} portal={portal}>
        <select
          data-neo-ui-part="scope"
          aria-label={text.scope}
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
        <Popover.Root
          open={!!filter}
          onOpenChange={(open) => setFilter(open ? { draft: null } : null)}
        >
          <Popover.Trigger
            ref={filterTrigger}
            className="neo-literature-control"
            data-neo-ui-part="filters"
          >
            {workbench.filter}
            {model.filters.length > 0 ? ` · ${model.filters.length}` : ''}
          </Popover.Trigger>
          {portal && (
            <Popover.Portal container={portal}>
              <Popover.Positioner {...placement} className="neo-literature-positioner">
                <Popover.Popup
                  ref={filterPopup}
                  className="neo-literature-popup"
                  data-neo-ui-part="filter-panel"
                  initialFocus={() =>
                    filterPopup.current?.querySelector<HTMLElement>(
                      '[data-neo-ui-part="filter-value"]',
                    ) ??
                    filterPopup.current?.querySelector<HTMLElement>(
                      '[data-neo-ui-part="filter-operator"]',
                    ) ??
                    true
                  }
                >
                  {filter && (
                    <FilterForm
                      model={model}
                      dispatch={dispatch}
                      session={filter}
                      setSession={setFilter}
                    />
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          )}
        </Popover.Root>
        <Popover.Root open={sortOpen} onOpenChange={setSortOpen}>
          <Popover.Trigger className="neo-literature-control" data-neo-ui-part="sort">
            {workbench.sort}
          </Popover.Trigger>
          {portal && (
            <Popover.Portal container={portal}>
              <Popover.Positioner {...placement} className="neo-literature-positioner">
                <Popover.Popup className="neo-literature-popup" data-neo-ui-part="sort-panel">
                  <SortForm model={model} dispatch={dispatch} close={() => setSortOpen(false)} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          )}
        </Popover.Root>
        <Popover.Root>
          <Popover.Trigger
            ref={columnsTrigger}
            className="neo-literature-control"
            data-neo-ui-part="columns"
          >
            {text.columns}
          </Popover.Trigger>
          {portal && (
            <Popover.Portal container={portal}>
              <Popover.Positioner {...placement} className="neo-literature-positioner">
                <Popover.Popup className="neo-literature-popup" data-neo-ui-part="columns-panel">
                  <ColumnChooser model={model} dispatch={dispatch} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          )}
        </Popover.Root>
      </SavedViewControls>

      <div className="neo-literature-chips">
        <span className="neo-literature-chip">
          <button
            type="button"
            className="neo-literature-control"
            data-neo-ui-part="sort-chip"
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen(true)}
          >
            {sortLabel} · {workbench[model.sortDirection]}
          </button>
        </span>
        <FilterChips model={model} dispatch={dispatch} setFilter={setFilter} />
        <p className="neo-muted" data-neo-ui-part="filter-count" role="status">
          {workbench.count(model.total, model.scopeTotal)}
        </p>
      </div>
      {model.filterUnavailable && (
        <p data-neo-ui-part="filter-unavailable" role="alert">
          {workbench.filterUnavailable}
        </p>
      )}
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
      {savedNotice && (
        <p role="status" data-neo-ui-part="cell-saved">
          {workbench.savedCell}
        </p>
      )}
      {status === 'ready' && !model.filterUnavailable && (
        <div className="neo-literature-grid" role="region" aria-label={text.heading} tabIndex={0}>
          <table data-neo-ui-part="table" aria-label={scope?.label ?? text.heading}>
            <thead>
              <tr>
                {model.columns.map((column) => (
                  <HeaderCell
                    key={column.id}
                    column={column}
                    portal={portal}
                    model={model}
                    dispatch={dispatch}
                    setFilter={setFilter}
                    returnToColumns={() => columnsTrigger.current?.focus()}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map(({ id, cells }) => {
                const title = cells[titleColumn];
                const name = title && 'value' in title ? title.value : id;
                return (
                  <tr key={id} data-neo-ui-part="row" data-item-id={id}>
                    {model.columns.map(({ id: column, label }, index) => {
                      const cell = cells[index]!;
                      const active = editItem === id && editColumn === column;
                      return (
                        <td key={column} data-column-id={column} data-cell-state={cell.state}>
                          {column === 'title' ? (
                            <div className="neo-literature-title-cell">
                              <span
                                className="neo-literature-title-name"
                                title={typeof name === 'string' ? name : undefined}
                              >
                                <CellValue cell={cell} text={text} />
                              </span>
                              <Button
                                className="neo-literature-control"
                                data-neo-ui-part="locate"
                                data-item-id={id}
                                aria-label={`${text.locate}: ${name}`}
                                title={text.locate}
                                disabled={model.locating}
                                onClick={() => dispatch({ type: 'locate', id })}
                              >
                                {workbench.locate}
                              </Button>
                            </div>
                          ) : cell.editable ? (
                            <button
                              type="button"
                              ref={active ? setCellAnchor : null}
                              className="neo-literature-cell-trigger"
                              data-neo-ui-part="cell-edit"
                              data-item-id={id}
                              data-column-id={column}
                              aria-label={workbench.editCell(label, name)}
                              aria-haspopup="dialog"
                              aria-expanded={active && openEdit}
                              aria-controls={active && openEdit ? editorID : undefined}
                              aria-disabled={editStatus === 'saving' && active}
                              disabled={openEdit && !active}
                              onClick={() => {
                                if (active && openEdit) {
                                  cancelEdit();
                                } else {
                                  setSavedNotice(false);
                                  dispatch({ type: 'cell-open', id, column });
                                }
                              }}
                            >
                              <CellValue cell={cell} text={text} />
                            </button>
                          ) : (
                            <CellValue cell={cell} text={text} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
      <div ref={setPortal} data-neo-ui-part="workbench-overlays" />
      <Popover.Root
        modal={false}
        open={openEdit}
        onOpenChange={(open, details) => {
          if (open) return;
          // Unrelated workbench operations can move focus or unload the anchor.
          if (details.reason !== 'escape-key') {
            details.cancel();
            return;
          }
          const target = details.event.target as Node | null;
          if (!editorPopup.current?.contains(target) && !cellAnchor?.contains(target)) {
            details.cancel();
            details.allowPropagation();
          } else if (editStatus === 'saving') {
            details.cancel();
          } else {
            cancelEdit();
          }
        }}
      >
        {portal && (
          <Popover.Portal container={portal}>
            <Popover.Positioner
              {...placement}
              anchor={cellAnchor ?? filterTrigger}
              sticky
              className="neo-literature-positioner neo-literature-editor-positioner"
            >
              <Popover.Popup
                ref={editorPopup}
                id={editorID}
                className="neo-literature-popup"
                data-neo-ui-part="cell-editor"
                data-edit-anchor={cellAnchor ? 'cell' : 'toolbar'}
                data-item-id={editItem}
                data-column-id={editColumn}
                aria-busy={editStatus === 'saving'}
                finalFocus={false}
                initialFocus={() =>
                  editorPopup.current?.querySelector<HTMLElement>(
                    '[data-neo-ui-part="cell-search"], [data-neo-ui-part="cell-value"]',
                  ) ?? true
                }
              >
                {openEdit && edit && (
                  <CellEditForm
                    key={`${edit.id}:${edit.column}`}
                    edit={edit}
                    item={editTitle ?? edit.id}
                    language={model.language}
                    blocked={status !== 'ready'}
                    submit={(value) => {
                      if (editStatus === 'saving' || status !== 'ready') return;
                      dispatch({ type: 'cell-save', requestId: ++nextRequest.current, value });
                    }}
                    cancel={cancelEdit}
                  />
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        )}
      </Popover.Root>
    </section>
  );
}

export function mountLiteratureTableView(
  root: HTMLElement,
  initialModel: LiteratureTableModel,
  dispatch: (command: LiteratureTableCommand) => void,
): ReactView<LiteratureTableModel> {
  return createReactView(
    root,
    (model) => <LiteratureWorkbench model={model} dispatch={dispatch} />,
    initialModel,
  );
}
