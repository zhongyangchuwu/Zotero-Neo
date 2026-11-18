import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import { displayAttributeValue, readAttributeChoices } from '../../../item-attributes/extra';
import type {
  ItemAttributesCommand,
  ItemAttributesModel,
} from '../../../item-attributes/react-model';
import {
  isChoiceAttribute,
  MAX_ITEM_ATTRIBUTE_OPTIONS,
  type ItemAttributeType,
} from '../../../item-attributes/types';

export const ITEM_ATTRIBUTES_CSS = `
.neo-item-attributes .neo-attribute-toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0; }
.neo-item-attributes label { display:block;margin:10px 0; }
.neo-item-attributes input,.neo-item-attributes select { color:inherit;background:var(--zotero-neo-surface);border:1px solid var(--zotero-neo-border);padding:6px;font:inherit;max-width:100%;box-sizing:border-box; }
.neo-item-attributes input[type=text] { width:100%; }
.neo-item-attributes .neo-attribute-option { display:flex;align-items:end;gap:8px;margin:10px 0; }
.neo-item-attributes .neo-attribute-option label { flex:1;min-width:0;margin:0; }
.neo-item-attributes fieldset { border:1px solid var(--zotero-neo-border);padding:12px;margin:12px 0;min-width:0; }
.neo-item-attributes table { border-collapse:collapse;width:100%;table-layout:fixed; }
.neo-item-attributes th,.neo-item-attributes td { padding:8px;border-bottom:1px solid var(--zotero-neo-border);text-align:start;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap; }
.neo-item-attributes .neo-attribute-review { border:2px solid var(--zotero-neo-border);padding:12px;margin:12px 0;overflow-wrap:anywhere; }
.neo-item-attributes code { overflow-wrap:anywhere;white-space:pre-wrap; }
.neo-item-attributes summary { cursor:pointer; }
.neo-item-attributes .neo-status:empty { padding:0; }
`;

export function mountItemAttributesView(
  root: HTMLElement,
  initial: ItemAttributesModel,
  dispatch: (command: ItemAttributesCommand) => void,
): ReactView<ItemAttributesModel> {
  return createReactView(
    root,
    (model) => {
      const text = (cn: string, en: string) => (model.chinese ? cn : en);
      const selected = model.definitions.find((definition) => definition.id === model.selectedID);
      const choice = selected && isChoiceAttribute(selected.type) ? selected : null;
      const choices = choice ? readAttributeChoices(choice, model.input || null) : null;
      const options = choice?.options ?? [];
      const hasUnknown = choices?.some((id) => !options.some((option) => option.id === id));
      const canSave = model.canWrite && (!choice || (!!choices?.length && !hasUnknown));
      const draft = model.draft;
      const attributeTypes: Record<ItemAttributeType, string> = {
        text: text('文本', 'Text'),
        number: text('数字', 'Number'),
        'single-select': text('单选', 'Single select'),
        'multi-select': text('多选', 'Multi select'),
      };
      const renderValue = (value: string | null) => {
        if (value === null) return text('未设置', 'Not set');
        if (!choice) return value;
        const display = displayAttributeValue(choice, value);
        if (display.valid) return display.text || text('未设置', 'Not set');
        if (readAttributeChoices(choice, value) === null)
          return <strong>{text('无法读取的选项值', 'Unreadable selection')}</strong>;
        return (
          <>
            <strong>{text('含不可用选项：', 'Contains unavailable options: ')}</strong>
            {display.text}
          </>
        );
      };
      const labelCounts = new Map<string, number>();
      for (const { label } of model.definitions) {
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      }
      const hasDuplicateLabel = (label: string) => (labelCounts.get(label) ?? 0) > 1;
      const count = model.targets.length;
      const itemCount = text(`${count} 个条目`, `${count} ${count === 1 ? 'item' : 'items'}`);
      const editor = (
        <div className="neo-item-attributes" hidden={model.discard !== null}>
          <h2>
            {model.mode === 'definitions'
              ? text('管理自定义属性', 'Manage custom attributes')
              : text('编辑自定义属性', 'Edit custom attributes')}
          </h2>
          <div className="neo-attribute-toolbar">
            <Button
              data-neo-ui-part="mode-definitions"
              disabled={model.busy || model.mode === 'definitions'}
              onClick={() => dispatch({ type: 'mode', value: 'definitions' })}
            >
              {text('管理定义', 'Manage attributes')}
            </Button>
            <Button
              data-neo-ui-part="mode-values"
              disabled={model.busy || !model.targets.length || model.mode === 'values'}
              onClick={() => dispatch({ type: 'mode', value: 'values' })}
            >
              {text('编辑条目值', 'Edit item values')}
            </Button>
            <Button
              data-neo-ui-part="close"
              disabled={model.busy}
              onClick={() => dispatch({ type: 'close' })}
            >
              {text('关闭', 'Close')}
            </Button>
          </div>
          <Status error={model.error}>{model.status}</Status>
          {model.mode === 'definitions' ? (
            <>
              {!model.draft && (
                <>
                  {model.available && !model.definitions.length && (
                    <p>
                      {text(
                        '还没有自定义属性。新建一个属性来记录阅读阶段、评分等信息。',
                        'No custom attributes yet. Add one to track a reading stage, a rating, or other information.',
                      )}
                    </p>
                  )}
                  <Button
                    data-neo-ui-part="new-definition"
                    primary
                    disabled={!model.available || model.busy}
                    onClick={() => dispatch({ type: 'new-definition' })}
                  >
                    {text('新建属性', 'New attribute')}
                  </Button>
                  {model.definitions.length > 0 && (
                    <table data-neo-ui-part="definitions">
                      <thead>
                        <tr>
                          <th scope="col">{text('名称', 'Name')}</th>
                          <th scope="col">{text('类型', 'Type')}</th>
                          <th scope="col">{text('操作', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.definitions.map((definition) => (
                          <tr key={definition.id}>
                            <td>
                              {definition.label}
                              {hasDuplicateLabel(definition.label) && (
                                <>
                                  <br />
                                  <code>{definition.key}</code>
                                </>
                              )}
                            </td>
                            <td>{attributeTypes[definition.type]}</td>
                            <td>
                              <Button
                                disabled={!model.available || model.busy}
                                onClick={() =>
                                  dispatch({ type: 'edit-definition', id: definition.id })
                                }
                              >
                                {text('编辑', 'Edit')}
                              </Button>{' '}
                              <Button
                                disabled={!model.available || model.busy}
                                onClick={() =>
                                  dispatch({ type: 'remove-definition', id: definition.id })
                                }
                              >
                                {text('删除定义', 'Remove definition')}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
              {draft && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: 'save-definition' });
                  }}
                >
                  <fieldset disabled={!model.available || model.busy}>
                    <legend>
                      {draft.id
                        ? text('编辑属性', 'Edit attribute')
                        : text('新建属性', 'New attribute')}
                    </legend>
                    <label>
                      {text('名称', 'Name')}
                      <input
                        data-neo-ui-part="definition-label"
                        required
                        type="text"
                        value={draft.label}
                        onChange={(event) =>
                          dispatch({ type: 'draft-label', value: event.currentTarget.value })
                        }
                      />
                    </label>
                    <label>
                      {text('类型', 'Type')}
                      <select
                        data-neo-ui-part="definition-type"
                        value={draft.type}
                        disabled={!!draft.id && isChoiceAttribute(draft.type)}
                        onChange={(event) =>
                          dispatch({
                            type: 'draft-type',
                            value: event.currentTarget.value as ItemAttributeType,
                          })
                        }
                      >
                        {Object.entries(attributeTypes).map(([type, label]) => (
                          <option
                            key={type}
                            value={type}
                            disabled={
                              !!draft.id &&
                              type !== draft.type &&
                              isChoiceAttribute(type as ItemAttributeType)
                            }
                          >
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.id ? (
                      <>
                        <label>
                          {text('Extra 存储键（只读）', 'Extra storage key (read only)')}
                          <input
                            data-neo-ui-part="storage-key"
                            type="text"
                            readOnly
                            value={draft.key}
                          />
                        </label>
                        <p className="neo-muted">
                          {isChoiceAttribute(draft.type)
                            ? text(
                                '现有单选和多选属性不能更改类型。改名不会改写已有值。',
                                'Existing choice attributes cannot change type. Renaming does not rewrite existing values.',
                              )
                            : text(
                                '改名或在文本与数字之间更改类型不会改写已有值。',
                                'Renaming or switching between text and number does not rewrite existing values.',
                              )}
                        </p>
                      </>
                    ) : (
                      <details>
                        <summary data-neo-ui-part="advanced-key">
                          {text('高级选项', 'Advanced options')}
                        </summary>
                        <label>
                          {text('Extra 存储键（可选）', 'Extra storage key (optional)')}
                          <input
                            data-neo-ui-part="storage-key"
                            type="text"
                            value={draft.key}
                            onChange={(event) =>
                              dispatch({ type: 'draft-key', value: event.currentTarget.value })
                            }
                          />
                        </label>
                        <p className="neo-muted">
                          {text(
                            '留空时自动生成。要接管已有值，请填写原来的存储键。',
                            'Leave blank to generate a key. To reuse existing values, enter their original storage key.',
                          )}
                        </p>
                      </details>
                    )}
                    {isChoiceAttribute(draft.type) && (
                      <fieldset>
                        <legend>{text('选项', 'Options')}</legend>
                        <p className="neo-muted">
                          {text(
                            '重命名选项不会改写已有值。删除选项也会保留已有值，但使用该选项的条目将显示不可用的选项，直到手动修复。',
                            'Renaming an option does not rewrite existing values. Removing an option leaves stored values intact; items using it will show an unavailable choice until you edit them.',
                          )}
                        </p>
                        {draft.options.map((option, index) => (
                          <div className="neo-attribute-option" key={option.id}>
                            <label>
                              {text(`选项 ${index + 1} 的名称`, `Option ${index + 1} label`)}
                              <input
                                data-neo-ui-part={`definition-option-${option.id}`}
                                type="text"
                                required
                                value={option.label}
                                onChange={(event) =>
                                  dispatch({
                                    type: 'draft-rename-option',
                                    id: option.id,
                                    value: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                            <Button
                              aria-label={text(
                                `删除选项 ${index + 1}`,
                                `Remove option ${index + 1}`,
                              )}
                              onClick={() =>
                                dispatch({ type: 'draft-remove-option', id: option.id })
                              }
                            >
                              {text('删除选项', 'Remove option')}
                            </Button>
                          </div>
                        ))}
                        <Button
                          data-neo-ui-part="definition-add-option"
                          disabled={draft.options.length >= MAX_ITEM_ATTRIBUTE_OPTIONS}
                          onClick={() => dispatch({ type: 'draft-add-option' })}
                        >
                          {text('添加选项', 'Add option')}
                        </Button>
                      </fieldset>
                    )}
                    <Button data-neo-ui-part="save-definition" type="submit" primary>
                      {text('保存属性', 'Save attribute')}
                    </Button>{' '}
                    <Button onClick={() => dispatch({ type: 'cancel-definition' })}>
                      {text('取消编辑', 'Cancel editing')}
                    </Button>
                  </fieldset>
                </form>
              )}
              {model.removing && (
                <section
                  className="neo-attribute-review"
                  aria-label={text('确认删除定义', 'Confirm definition removal')}
                >
                  <p>
                    {text('删除定义', 'Remove definition')}: <strong>{model.removing.label}</strong>{' '}
                    (<code>{model.removing.key}</code>)
                  </p>
                  <p>
                    {isChoiceAttribute(model.removing.type)
                      ? text(
                          '已有值会保留。要恢复原选项的显示名称，必须恢复相同的存储键和选项 ID。',
                          'Existing values will be kept. Restoring their labels requires the original storage key and option IDs.',
                        )
                      : text(
                          '已有值会保留。用同一个存储键重建属性即可恢复显示。',
                          'Existing values will be kept. Recreate the attribute with the same storage key to show them again.',
                        )}
                  </p>
                  <Button
                    disabled={!model.available || model.busy}
                    onClick={() => dispatch({ type: 'confirm-remove' })}
                  >
                    {text('确认仅删除定义，保留值', 'Remove definition only; keep values')}
                  </Button>{' '}
                  <Button onClick={() => dispatch({ type: 'cancel-remove' })}>
                    {text('取消', 'Cancel')}
                  </Button>
                </section>
              )}
            </>
          ) : (
            <>
              <h3>{text(`本次编辑：${itemCount}`, `Editing ${itemCount}`)}</h3>
              <p>
                {text(
                  '这里只会修改下方列出的条目。列表中的值是编辑前的原值。',
                  'Only the items listed below can change. The list shows their original values.',
                )}
              </p>
              {model.available && !model.definitions.length && (
                <p>
                  {text(
                    '还没有自定义属性。请先在「管理定义」中新建属性。',
                    'No custom attributes yet. Add one in Manage attributes first.',
                  )}
                </p>
              )}
              <fieldset
                hidden={!model.definitions.length}
                disabled={model.busy || !model.available}
              >
                <label>
                  {text('属性', 'Attribute')}
                  <select
                    data-neo-ui-part="select-attribute"
                    value={model.selectedID}
                    onChange={(event) =>
                      dispatch({ type: 'select', id: event.currentTarget.value })
                    }
                  >
                    <option value="" disabled>
                      {text('选择属性', 'Choose an attribute')}
                    </option>
                    {model.definitions.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.label}
                        {hasDuplicateLabel(definition.label) ? ` (${definition.key})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => dispatch({ type: 'refresh-values' })}>
                  {text('重新读取值并重新编辑', 'Reload values and restart editing')}
                </Button>
                {model.mixed && (
                  <p>
                    <strong>
                      {text(
                        '混合值：设置操作将替换所有目标的当前属性值。',
                        'Values differ. Saving replaces this attribute on every listed item.',
                      )}
                    </strong>
                  </p>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: 'set-value' });
                  }}
                >
                  {choice?.type === 'single-select' ? (
                    <label>
                      {text('新选项', 'New choice')}
                      <select
                        data-neo-ui-part="value-input"
                        value={choices && !hasUnknown ? (choices[0] ?? '') : ''}
                        disabled={!model.canWrite || !options.length}
                        onChange={(event) =>
                          dispatch({ type: 'select-choice', id: event.currentTarget.value })
                        }
                      >
                        <option value="" disabled>
                          {text('选择一个选项', 'Choose an option')}
                        </option>
                        {options.map(({ id, label }) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : choice?.type === 'multi-select' ? (
                    <fieldset disabled={!model.canWrite || choices === null}>
                      <legend>{text('新选项（可多选）', 'New choices (select any)')}</legend>
                      {options.map(({ id, label }, index) => (
                        <label key={id}>
                          <input
                            data-neo-ui-part={index === 0 ? 'value-input' : undefined}
                            type="checkbox"
                            checked={choices?.includes(id) ?? false}
                            onChange={() => dispatch({ type: 'toggle-choice', id })}
                          />{' '}
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <>
                      <label>
                        {text('新值（仅一行）', 'New value (one line)')}
                        <input
                          data-neo-ui-part="value-input"
                          type="text"
                          inputMode={selected?.type === 'number' ? 'decimal' : 'text'}
                          value={model.input}
                          placeholder={
                            model.mixed
                              ? text('混合值 — 输入替换值', 'Mixed — enter replacement')
                              : ''
                          }
                          disabled={!model.canWrite}
                          onChange={(event) =>
                            dispatch({ type: 'input', value: event.currentTarget.value })
                          }
                        />
                      </label>
                      <p className="neo-muted">
                        {text(
                          '留空保存会清除此属性值。',
                          'Saving a blank value clears this attribute.',
                        )}
                      </p>
                    </>
                  )}
                  {choice && !options.length && (
                    <p>{text('请先为该属性添加选项。', 'Add options to this attribute first.')}</p>
                  )}
                  {choice && (choices === null || hasUnknown) && (
                    <>
                      <p>{renderValue(model.input)}</p>
                      <Button
                        disabled={!model.canWrite}
                        onClick={() => dispatch({ type: 'repair-choices' })}
                      >
                        {choices === null
                          ? text('在本次编辑中重置选项', 'Reset selection in this edit')
                          : text(
                              '从本次编辑中移除不可用的选项',
                              'Remove unavailable choices from this edit',
                            )}
                      </Button>
                      <p className="neo-muted">
                        {text(
                          '只有保存或清除时才会改写条目值。',
                          'Items change only when you save or clear the value.',
                        )}
                      </p>
                    </>
                  )}
                  {selected?.type === 'number' && (
                    <p className="neo-muted">
                      {text(
                        '请输入有限数字，例如 0 或 3.5。',
                        'Enter a finite number, such as 0 or 3.5.',
                      )}
                    </p>
                  )}
                  <Button data-neo-ui-part="save-value" type="submit" primary disabled={!canSave}>
                    {count > 1
                      ? text(`复核对 ${itemCount} 的修改`, `Review changes to ${itemCount}`)
                      : text(`保存到 ${itemCount}`, `Save to ${itemCount}`)}
                  </Button>{' '}
                  <Button
                    data-neo-ui-part="clear-value"
                    disabled={!model.canWrite}
                    onClick={() => dispatch({ type: 'clear-value' })}
                  >
                    {count > 1 ? text('清除值…', 'Clear value…') : text('清除值', 'Clear value')}
                  </Button>
                </form>
              </fieldset>
              <table data-neo-ui-part="target-items">
                <thead>
                  <tr>
                    <th scope="col">{text('条目标题 / ID', 'Item title / ID')}</th>
                    <th scope="col">{text('原值', 'Original value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.targets.map((target) => (
                    <tr key={target.id}>
                      <td>
                        {target.title}
                        <br />
                        <small>#{target.id}</small>
                      </td>
                      <td>
                        {target.ambiguous
                          ? text(
                              '冲突：Extra 中有重复或歧义行；请先手动修复。',
                              'Conflict: duplicate or ambiguous Extra lines; repair them manually first.',
                            )
                          : renderValue(target.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {model.review && (
                <section
                  className="neo-attribute-review"
                  data-neo-ui-part="value-review"
                  aria-label={text('复核批量修改', 'Review batch change')}
                  tabIndex={-1}
                >
                  <h3>{text(`复核对 ${itemCount} 的修改`, `Review changes to ${itemCount}`)}</h3>
                  <p>
                    {selected?.label}
                    {selected && hasDuplicateLabel(selected.label) ? ` (${selected.key})` : ''}
                  </p>
                  <p>
                    {model.review.value === null
                      ? text(
                          '将清除以上所有条目的此属性值。',
                          'This attribute will be cleared on every item above.',
                        )
                      : text(
                          '将把以上所有条目的此属性值替换为：',
                          'This attribute will be replaced on every item above with:',
                        )}
                  </p>
                  {model.review.value !== null && <p>{renderValue(model.review.value)}</p>}
                  <Button
                    data-neo-ui-part="confirm-values"
                    primary
                    disabled={!model.canWrite || model.busy}
                    onClick={() => dispatch({ type: 'confirm-values' })}
                  >
                    {model.review.value === null
                      ? text(`清除 ${itemCount} 的值`, `Clear values on ${itemCount}`)
                      : text(`保存到 ${itemCount}`, `Save to ${itemCount}`)}
                  </Button>{' '}
                  <Button disabled={model.busy} onClick={() => dispatch({ type: 'cancel-review' })}>
                    {text('返回编辑', 'Back to editing')}
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      );
      return (
        <>
          {editor}
          {model.discard && (
            <div className="neo-item-attributes">
              <section
                className="neo-attribute-review"
                data-neo-ui-part="discard-review"
                aria-label={text('放弃未保存的修改', 'Discard unsaved changes')}
              >
                <h2>{text('放弃未保存的修改？', 'Discard unsaved changes?')}</h2>
                <p>
                  {model.discard === 'close'
                    ? text('关闭前不会保存本次编辑。', 'Closing will not save your edits.')
                    : text(
                        '切换页面不会保存本次编辑。',
                        'Switching views will not save your edits.',
                      )}
                </p>
                <Button
                  data-neo-ui-part="keep-editing"
                  primary
                  onClick={() => dispatch({ type: 'keep-editing' })}
                >
                  {text('继续编辑', 'Keep editing')}
                </Button>{' '}
                <Button
                  data-neo-ui-part="confirm-discard"
                  onClick={() => dispatch({ type: 'confirm-discard' })}
                >
                  {model.discard === 'close'
                    ? text('放弃并关闭', 'Discard and close')
                    : text('放弃并切换', 'Discard and switch')}
                </Button>
              </section>
            </div>
          )}
        </>
      );
    },
    initial,
  );
}
