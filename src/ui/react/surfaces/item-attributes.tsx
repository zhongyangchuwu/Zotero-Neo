import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import type {
  ItemAttributesCommand,
  ItemAttributesModel,
} from '../../../item-attributes/react-model';

export const ITEM_ATTRIBUTES_CSS = `
.neo-item-attributes .neo-attribute-toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0; }
.neo-item-attributes label { display:block;margin:10px 0; }
.neo-item-attributes input,.neo-item-attributes select { color:inherit;background:var(--zotero-neo-surface);border:1px solid var(--zotero-neo-border);padding:6px;font:inherit;max-width:100%;box-sizing:border-box; }
.neo-item-attributes input[type=text] { width:100%; }
.neo-item-attributes fieldset { border:1px solid var(--zotero-neo-border);padding:12px;margin:12px 0;min-width:0; }
.neo-item-attributes table { border-collapse:collapse;width:100%;table-layout:fixed; }
.neo-item-attributes th,.neo-item-attributes td { padding:8px;border-bottom:1px solid var(--zotero-neo-border);text-align:start;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap; }
.neo-item-attributes .neo-attribute-review { border:2px solid var(--zotero-neo-border);padding:12px;margin:12px 0;overflow-wrap:anywhere; }
.neo-item-attributes code { overflow-wrap:anywhere;white-space:pre-wrap; }
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
      return (
        <div className="neo-item-attributes">
          <h2>{text('条目自定义属性', 'Item attributes')}</h2>
          <p className="neo-muted">
            {text(
              '值存于条目的 Extra，可能影响引文或导出；Zotero 同步把整个 Extra 当作一个字段，可能发生冲突。定义仅保存在本机，不随文库同步；请另行迁移定义。仅支持普通文献条目。',
              'Values live in item Extra and may affect citations or exports. Zotero sync treats the whole Extra as one field, so conflicts are possible. Definitions are local, not library-synced; transfer them separately. Only ordinary bibliographic items are supported.',
            )}
          </p>
          <div className="neo-attribute-toolbar">
            <Button
              disabled={model.busy || model.mode === 'definitions'}
              onClick={() => dispatch({ type: 'mode', value: 'definitions' })}
            >
              {text('管理定义', 'Manage definitions')}
            </Button>
            <Button
              disabled={model.busy || !model.targets.length || model.mode === 'values'}
              onClick={() => dispatch({ type: 'mode', value: 'values' })}
            >
              {text('编辑捕获的条目', 'Edit captured items')}
            </Button>
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          {model.mode === 'definitions' ? (
            <>
              <p>
                {text(
                  '改名或改变类型不会改写已有值。存储键创建后不可更改；改变类型后，已有不兼容的值需手动修正。',
                  'Renaming or changing type does not rewrite existing values. Storage keys are immutable; incompatible values after a type change must be corrected manually.',
                )}
              </p>
              <Button
                disabled={!model.available || model.busy}
                onClick={() => dispatch({ type: 'new-definition' })}
              >
                {text('新建属性', 'New attribute')}
              </Button>
              <table>
                <thead>
                  <tr>
                    <th>{text('名称 / 存储键', 'Label / storage key')}</th>
                    <th>{text('类型', 'Type')}</th>
                    <th>{text('操作', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.definitions.map((definition) => (
                    <tr key={definition.id}>
                      <td>
                        {definition.label}
                        <br />
                        <code>{definition.key}</code>
                      </td>
                      <td>
                        {definition.type === 'number'
                          ? text('数字', 'Number')
                          : text('文本', 'Text')}
                      </td>
                      <td>
                        <Button
                          disabled={!model.available || model.busy}
                          onClick={() => dispatch({ type: 'edit-definition', id: definition.id })}
                        >
                          {text('编辑', 'Edit')}
                        </Button>{' '}
                        <Button
                          disabled={!model.available || model.busy}
                          onClick={() => dispatch({ type: 'remove-definition', id: definition.id })}
                        >
                          {text('删除定义', 'Remove definition')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!model.definitions.length && (
                <p>{text('尚无属性定义。', 'No attribute definitions yet.')}</p>
              )}
              {model.draft && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: 'save-definition' });
                  }}
                >
                  <fieldset disabled={!model.available || model.busy}>
                    <legend>
                      {model.draft.id
                        ? text('编辑定义', 'Edit definition')
                        : text('新建定义', 'New definition')}
                    </legend>
                    <label>
                      {text('显示名称', 'Display label')}
                      <input
                        required
                        type="text"
                        value={model.draft.label}
                        onChange={(event) =>
                          dispatch({ type: 'draft-label', value: event.currentTarget.value })
                        }
                      />
                    </label>
                    <label>
                      {text('Extra 存储键（不可变）', 'Extra storage key (immutable)')}
                      <input
                        required
                        type="text"
                        disabled={!!model.draft.id}
                        value={model.draft.key}
                        onChange={(event) =>
                          dispatch({ type: 'draft-key', value: event.currentTarget.value })
                        }
                      />
                    </label>
                    <p className="neo-muted">
                      {text(
                        '使用独特的单行键；原生 / CSL 字段、作者字段及 zV-marks 保留键不可用。',
                        'Use a distinctive one-line key; native / CSL fields, creator fields and reserved zV-marks keys are unavailable.',
                      )}
                    </p>
                    <label>
                      {text('类型', 'Type')}
                      <select
                        value={model.draft.type}
                        onChange={(event) =>
                          dispatch({
                            type: 'draft-type',
                            value: event.currentTarget.value === 'number' ? 'number' : 'text',
                          })
                        }
                      >
                        <option value="text">{text('文本', 'Text')}</option>
                        <option value="number">{text('数字', 'Number')}</option>
                      </select>
                    </label>
                    <Button type="submit" primary>
                      {text('保存定义', 'Save definition')}
                    </Button>{' '}
                    <Button onClick={() => dispatch({ type: 'cancel-definition' })}>
                      {text('取消', 'Cancel')}
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
                    {text(
                      '所有条目的 Extra 值都会保留。列与编辑器会被移除；使用同一存储键重新建立定义即可再次读取值。',
                      'All item Extra values will be kept. The column and editor are removed; recreate a definition with the same storage key to read the values again.',
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
              <h3>
                {text('捕获的目标条目', 'Captured target items')} ({model.targets.length})
              </h3>
              <p>
                {text(
                  '目标固定为打开此界面时的条目；后续选择变化不会改变目标。表格显示编辑开始时的值。',
                  'Targets are fixed to the items captured when this dialog opened; later selection changes do not retarget this operation. The table shows values captured when editing began.',
                )}
              </p>
              <p className="neo-muted">
                {text(
                  '请先完成并保存原生条目编辑。如果写入因待保存的编辑而被拒绝，请保存后重新打开或重新选择此属性；已保存的其他 Extra 修改会保留。',
                  'Finish and save native item editing first. If pending edits block a write, save them, then reopen or reselect this attribute; other Extra changes already saved are preserved.',
                )}
              </p>
              <fieldset disabled={model.busy || !model.available}>
                <label>
                  {text('属性', 'Attribute')}
                  <select
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
                        {definition.label} ({definition.key})
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => dispatch({ type: 'refresh-values' })}>
                  {text('重新读取并开始新编辑', 'Reload values and start a new edit')}
                </Button>
                {model.mixed && (
                  <p>
                    <strong>
                      {text(
                        '混合值：设置操作将替换所有目标的当前属性值。',
                        'Mixed values: setting replaces this attribute on every target.',
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
                  <label>
                    {text('新值（仅一行）', 'New value (one line)')}
                    <input
                      type="text"
                      inputMode={selected?.type === 'number' ? 'decimal' : 'text'}
                      value={model.input}
                      placeholder={
                        model.mixed ? text('混合值 — 输入替换值', 'Mixed — enter replacement') : ''
                      }
                      disabled={!model.canWrite}
                      onChange={(event) =>
                        dispatch({ type: 'input', value: event.currentTarget.value })
                      }
                    />
                  </label>
                  <p className="neo-muted">
                    {text(
                      '空白输入会移除此属性；其他 Extra 行不会被修改。',
                      'Blank input removes this attribute; other Extra lines are not changed.',
                    )}
                  </p>
                  {selected?.type === 'number' && (
                    <p className="neo-muted">
                      {text(
                        '必须为有限数字；0 是有效值。不兼容或会丢失精度的输入会被拒绝。',
                        'Must be a finite number; 0 is valid. Incompatible or precision-losing input is rejected.',
                      )}
                    </p>
                  )}
                  <Button type="submit" primary disabled={!model.canWrite}>
                    {text('设置值', 'Set value')}
                  </Button>{' '}
                  <Button
                    disabled={!model.canWrite}
                    onClick={() => dispatch({ type: 'clear-value' })}
                  >
                    {text('清除此属性值', 'Clear this attribute')}
                  </Button>
                </form>
              </fieldset>
              <table>
                <thead>
                  <tr>
                    <th>{text('条目标题 / ID', 'Item title / ID')}</th>
                    <th>{text('编辑开始时的值', 'Value when editing began')}</th>
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
                          : target.value === null
                            ? text('未设置', 'Not set')
                            : target.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {model.review && (
                <section
                  className="neo-attribute-review"
                  aria-label={text('复核批量修改', 'Review batch change')}
                >
                  <h3>{text('请复核以上所有目标', 'Review every target above')}</h3>
                  <p>
                    {selected?.label} (<code>{selected?.key}</code>) · {model.targets.length}{' '}
                    {text('个条目', 'items')}
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
                  {model.review.value !== null && (
                    <p>
                      <code>{model.review.value}</code>
                    </p>
                  )}
                  <Button
                    primary
                    disabled={!model.canWrite || model.busy}
                    onClick={() => dispatch({ type: 'confirm-values' })}
                  >
                    {text('确认修改这些条目', 'Confirm change to these items')}
                  </Button>{' '}
                  <Button disabled={model.busy} onClick={() => dispatch({ type: 'cancel-review' })}>
                    {text('取消', 'Cancel')}
                  </Button>
                </section>
              )}
            </>
          )}
          <Status error={model.error}>{model.status}</Status>
        </div>
      );
    },
    initial,
  );
}
