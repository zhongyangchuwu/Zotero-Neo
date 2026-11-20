import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import type {
  SettingsSnapshotCommand,
  SettingsSnapshotModel,
} from '../../../settings-snapshots/react-model';

export const SETTINGS_SNAPSHOTS_CSS = `
.neo-settings-snapshots .neo-snapshot-toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0; }
.neo-settings-snapshots input,.neo-settings-snapshots select { color:inherit;background:var(--zotero-neo-surface);border:1px solid var(--zotero-neo-border);padding:6px;font:inherit;max-width:100%; }
.neo-settings-snapshots fieldset { border:1px solid var(--zotero-neo-border);margin:12px 0;padding:10px; }
.neo-settings-snapshots fieldset label { margin-inline-end:14px; }
.neo-settings-snapshots table { border-collapse:collapse;width:100%;table-layout:fixed; }
.neo-settings-snapshots th,.neo-settings-snapshots td { padding:8px;border-bottom:1px solid var(--zotero-neo-border);text-align:start;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere; }
.neo-settings-snapshots .neo-snapshot-path { overflow-wrap:anywhere; }
.neo-settings-snapshots details { margin:12px 0; }
.neo-settings-snapshots .neo-snapshot-target { border-top:1px solid var(--zotero-neo-border);padding:8px 0; }
.neo-settings-snapshots [role=status],.neo-settings-snapshots [role=alert] { overflow-wrap:anywhere; }
`;
export function mountSettingsSnapshotsView(
  root: HTMLElement,
  initial: SettingsSnapshotModel,
  dispatch: (command: SettingsSnapshotCommand) => void,
): ReactView<SettingsSnapshotModel> {
  return createReactView(
    root,
    (model) => {
      const text: Text = (cn, en) => (model.chinese ? cn : en);
      const props = { model, text, dispatch };
      return (
        <div className="neo-settings-snapshots">
          <h2>{model.title}</h2>
          <div className="neo-snapshot-toolbar">
            {model.exportFromReview ? (
              <Button disabled={model.busy} onClick={() => dispatch({ type: 'return-to-preview' })}>
                {text('返回差异预览', 'Back to preview')}
              </Button>
            ) : (
              (
                [
                  ['export', text('备份', 'Backup')],
                  ['import', text('恢复', 'Restore')],
                  ...(model.managedAvailable
                    ? [['managed', text('文库同步', 'Library Sync')] as const]
                    : []),
                ] as const
              ).map(([mode, label]) => (
                <Button
                  key={mode}
                  aria-pressed={model.mode === mode}
                  disabled={model.busy || model.mode === mode}
                  onClick={() => dispatch({ type: 'mode', value: mode })}
                >
                  {label}
                </Button>
              ))
            )}
            <Button onClick={() => dispatch({ type: 'help' })}>
              {text('使用指南', 'User guide')}
            </Button>
            {model.busy && (
              <Button onClick={() => dispatch({ type: 'stop' })}>{text('停止', 'Stop')}</Button>
            )}
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          <Status error={model.error}>{model.status}</Status>
          {(model.mode === 'export' || model.mode === 'managed') && (
            <p>
              {text(
                'Neo 备份包含快捷键、偏好设置和自定义属性定义，不包含条目中的属性值或其他文库数据。',
                'Neo backups include shortcuts, preferences, and custom attribute definitions, not item attribute values or other library data.',
              )}
            </p>
          )}
          {model.mode === 'export' && <Backup {...props} />}
          {model.mode === 'import' && <Restore {...props} />}
          {model.mode === 'managed' && <LibrarySync {...props} />}
          {!!model.issues.length && (
            <details>
              <summary>
                {text('跳过项与注意事项', 'Skipped items and notes')} ({model.issues.length})
              </summary>
              <ul>
                {model.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {!!model.receipts.length && (
            <details>
              <summary>
                {text('逐项恢复结果', 'Individual restore results')} ({model.receipts.length})
              </summary>
              <ul>
                {model.receipts.map((receipt, index) => (
                  <li key={index}>{receipt}</li>
                ))}
              </ul>
            </details>
          )}
          {model.catalogAvailable && !model.exportFromReview && <PluginTemplates {...props} />}
          <details>
            <summary>{text('关于备份格式与同步', 'About backup formats and sync')}</summary>
            <p>
              {text(
                '普通备份是可直接读取的 JSON 文件，不含已知敏感凭据。加密备份是 age 文件，恢复和手动同步时需要密码。密码不会保存。',
                'Ordinary backups are readable JSON files and exclude known sensitive credentials. Encrypted backups use age and require a password for restore and manual sync. Passwords are not saved.',
              )}
            </p>
            <p>
              {text(
                '同步备份以 Zotero 附件存放。收到其他设备的更新不会自动修改本机设置。',
                'Synced backups are stored as Zotero attachments. Updates from another device never change local settings automatically.',
              )}
            </p>
          </details>
        </div>
      );
    },
    initial,
  );
}

type Text = (cn: string, en: string) => string;
interface SurfaceProps {
  readonly model: SettingsSnapshotModel;
  readonly text: Text;
  readonly dispatch: (command: SettingsSnapshotCommand) => void;
}

function Password({
  text,
  label,
  part,
  disabled,
}: {
  readonly text: Text;
  readonly label: string;
  readonly part: string;
  readonly disabled: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="neo-snapshot-toolbar">
      <label>
        {label}{' '}
        <input
          data-neo-ui-part={part}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
      </label>
      <Button disabled={disabled} onClick={() => setVisible(!visible)}>
        {visible ? text('隐藏密码', 'Hide password') : text('显示密码', 'Show password')}
      </Button>
    </div>
  );
}

function Encryption({
  text,
  encrypted,
  includeSecrets,
  changeEncryption,
  changeSecrets,
}: {
  readonly text: Text;
  readonly encrypted: boolean;
  readonly includeSecrets: boolean;
  readonly changeEncryption: (checked: boolean) => void;
  readonly changeSecrets: (checked: boolean) => void;
}) {
  return (
    <>
      <p>
        <label>
          <input
            type="checkbox"
            checked={encrypted}
            onChange={(event) => changeEncryption(event.currentTarget.checked)}
          />
          {text('使用密码加密备份', 'Encrypt backup with a password')}
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(event) => changeSecrets(event.currentTarget.checked)}
          />
          {text(
            '包含 API 密钥等敏感凭据（启用密码加密）',
            'Include sensitive credentials such as API keys (turns on encryption)',
          )}
        </label>
      </p>
    </>
  );
}

function Scope({ model, text, dispatch }: SurfaceProps) {
  const form = model.targetForm;
  const editing = model.mode === 'managed' && !!form.editingID;
  const target = editing ? model.targets.find(({ id }) => id === form.editingID) : undefined;
  if (editing && target?.kind !== 'workspace') return null;
  const choices = model.adapters.map(({ id, label, selected }) => ({
    id,
    label,
    selected: editing ? form.adapterIDs.includes(id) : selected,
    available: true,
  }));
  if (editing)
    for (const id of form.adapterIDs)
      if (!choices.some((choice) => choice.id === id))
        choices.push({
          id,
          label:
            model.plugins.find((plugin) => plugin.adapterID === id)?.label ??
            text('不可用的插件', 'Unavailable plugin'),
          selected: true,
          available: false,
        });
  return (
    <fieldset disabled={model.busy}>
      <legend>{text('包含的设置', 'Settings to include')}</legend>
      {choices.map(({ id, label, selected, available }) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) =>
              dispatch({
                type: editing ? 'target-adapter' : 'adapter',
                id,
                checked: event.currentTarget.checked,
              })
            }
          />
          {label}
          {!available && text('（不可用，可移除）', ' (unavailable; can be removed)')}
        </label>
      ))}
    </fieldset>
  );
}

function Backup({ model, text, dispatch }: SurfaceProps) {
  const encrypted = model.container === 'age';
  return (
    <>
      {model.exportFromReview && (
        <p>
          {text(
            '先备份这次恢复涉及的设置。保存后会回到差异预览。',
            'Back up the settings affected by this restore, then return to the preview.',
          )}
        </p>
      )}
      <Scope model={model} text={text} dispatch={dispatch} />
      <fieldset disabled={model.busy}>
        <legend>{text('备份保护', 'Backup protection')}</legend>
        <Encryption
          text={text}
          encrypted={encrypted}
          includeSecrets={model.includeSecrets}
          changeEncryption={(checked) =>
            dispatch({ type: 'container', value: checked ? 'age' : 'json' })
          }
          changeSecrets={(checked) => dispatch({ type: 'include-secrets', checked })}
        />
        {encrypted && (
          <Password
            text={text}
            label={text('备份密码', 'Backup password')}
            part="export-password"
            disabled={model.busy}
          />
        )}
      </fieldset>
      <Button
        primary
        disabled={model.busy || !model.adapters.some(({ selected }) => selected)}
        onClick={() => dispatch({ type: 'export' })}
      >
        {text('保存备份…', 'Save backup…')}
      </Button>
      <details>
        <summary>{text('更多备份选项', 'More backup options')}</summary>
        <p>
          <label>
            <input
              type="checkbox"
              disabled={model.busy}
              checked={model.includeLibrarySettings}
              onChange={(event) =>
                dispatch({ type: 'include-library', checked: event.currentTarget.checked })
              }
            />
            {text(
              '包含文库级设置（仅可恢复到原文库）',
              'Include library settings (restore to the original library only)',
            )}
          </label>
        </p>
        {model.adapters.map(({ id, label }) => (
          <Button
            key={id}
            disabled={model.busy}
            onClick={() => dispatch({ type: 'plugin-export', id })}
          >
            {text(`仅备份 ${label}…`, `Back up ${label} only…`)}
          </Button>
        ))}
      </details>
    </>
  );
}

function LibrarySources({ model, text, dispatch }: SurfaceProps) {
  return (
    <details>
      <summary>{text('从文库中的现有备份恢复', 'Restore an existing library backup')}</summary>
      <div className="neo-snapshot-toolbar">
        <label>
          {text('来源文库', 'Source library')}{' '}
          <select
            disabled={model.busy || !model.locations.length}
            value={model.sourceLibraryID}
            onChange={(event) =>
              dispatch({
                type: 'source-library',
                libraryID: Number(event.currentTarget.value),
              })
            }
          >
            {model.locations.map(({ libraryID, label }) => (
              <option key={libraryID} value={libraryID}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={model.busy} onClick={() => dispatch({ type: 'refresh' })}>
          {text('刷新文库列表', 'Refresh library list')}
        </Button>
      </div>
      {model.sources.length ? (
        <ul>
          {model.sources.map(({ libraryID, itemKey, title }) => (
            <li key={`${libraryID}:${itemKey}`}>
              <Button
                disabled={model.busy}
                onClick={() => dispatch({ type: 'source', libraryID, itemKey })}
              >
                {title}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{text('此文库暂无可用备份。', 'No backups available in this library.')}</p>
      )}
    </details>
  );
}

function Restore({ model, text, dispatch }: SurfaceProps) {
  return (
    <>
      <div className="neo-snapshot-toolbar">
        <Button disabled={model.busy} onClick={() => dispatch({ type: 'choose-file' })}>
          {text('选择备份文件…', 'Choose backup file…')}
        </Button>
        {model.reviewingConflict && (
          <Button
            disabled={model.busy}
            onClick={() => dispatch({ type: 'mode', value: 'managed' })}
          >
            {text('返回文库同步', 'Back to Library Sync')}
          </Button>
        )}
        {(model.needsDiffRefresh || (model.sourceLabel && model.error && !model.hasPreview)) &&
          !model.awaitingUnlock && (
            <Button
              disabled={model.busy}
              onClick={() =>
                dispatch({
                  type: model.needsDiffRefresh ? 'refresh-diff' : 'inspect',
                })
              }
            >
              {text('刷新差异', 'Refresh changes')}
            </Button>
          )}
      </div>
      {model.managedAvailable && !model.reviewingConflict && (
        <LibrarySources model={model} text={text} dispatch={dispatch} />
      )}
      {model.sourceLabel && (
        <p className="neo-snapshot-path">
          {text('来源：', 'Source: ')}
          {model.sourceLabel}
        </p>
      )}
      {model.awaitingUnlock && (
        <>
          <Password
            text={text}
            label={text('来源密码', 'Source password')}
            part="import-password"
            disabled={model.busy}
          />
          <Button disabled={model.busy} onClick={() => dispatch({ type: 'inspect' })}>
            {model.needsDiffRefresh
              ? text('解锁并刷新差异', 'Unlock and refresh changes')
              : text('解锁并查看差异', 'Unlock and view changes')}
          </Button>
        </>
      )}
      {model.hasPreview && (
        <>
          <h3>{text('差异预览', 'Preview changes')}</h3>
          {model.reviewingConflict && (
            <p>
              {text(
                '仅恢复所选设置。只有完整应用云端改动后才会恢复同步；部分恢复不会覆盖云端。',
                'Only selected settings are restored. Sync resumes only after all cloud changes are applied; a partial restore never overwrites cloud settings.',
              )}
            </p>
          )}
          {!!model.groups.length && (
            <p className="neo-muted">
              {text(
                '恢复会替换所选本机设置，不会自动备份。',
                'Restoring replaces the selected local settings without making an automatic backup.',
              )}
            </p>
          )}
          {model.groups.map((group) => (
            <details open key={group.id}>
              <summary>{group.label}</summary>
              <label>
                <input
                  type="checkbox"
                  disabled={model.busy}
                  checked={group.selected}
                  onChange={(event) =>
                    dispatch({
                      type: 'category',
                      id: group.id,
                      checked: event.currentTarget.checked,
                    })
                  }
                />
                {group.fields.some(({ secret, blocked }) => secret && !blocked)
                  ? text('全选（包括敏感设置）', 'Select all (including sensitive settings)')
                  : text('全选', 'Select all')}
              </label>
              <table>
                <thead>
                  <tr>
                    <th>{text('设置', 'Setting')}</th>
                    <th>{text('本机当前值', 'Current value')}</th>
                    <th>{text('恢复为', 'Restore to')}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map((field) => (
                    <tr key={field.id}>
                      <td>
                        <label>
                          <input
                            type="checkbox"
                            checked={field.selected}
                            disabled={model.busy || !!field.blocked}
                            onChange={(event) =>
                              dispatch({
                                type: 'field',
                                id: field.id,
                                checked: event.currentTarget.checked,
                              })
                            }
                          />
                          {field.label}
                        </label>
                        {field.secret && <span> {text('（敏感）', '(sensitive)')}</span>}
                        {field.requiresRestart && (
                          <span> {text('（需重启）', '(restart required)')}</span>
                        )}
                        {field.blocked && <p>{field.blocked}</p>}
                        {field.canMap && (
                          <Button
                            disabled={model.busy}
                            onClick={() => dispatch({ type: 'map', id: field.id })}
                          >
                            {text('映射本机路径…', 'Map local path…')}
                          </Button>
                        )}
                      </td>
                      <td>{field.before}</td>
                      <td>{field.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          <div className="neo-snapshot-toolbar">
            {!!model.groups.length && (
              <>
                <Button
                  disabled={model.busy || !model.canApply}
                  onClick={() => dispatch({ type: 'export-current' })}
                >
                  {text('备份当前设置…', 'Back up current settings…')}
                </Button>
                <Button
                  primary
                  disabled={model.busy || !model.canApply}
                  onClick={() => dispatch({ type: 'apply' })}
                >
                  {text(
                    `恢复所选 ${model.selectedCount} 项`,
                    `Restore ${model.selectedCount} selected settings`,
                  )}
                </Button>
              </>
            )}
            {model.canAdoptUnchanged && !model.canApply && (
              <Button primary disabled={model.busy} onClick={() => dispatch({ type: 'apply' })}>
                {text('本机已一致，采用云端版本', 'Settings already match; adopt cloud version')}
              </Button>
            )}
          </div>
          {!model.groups.length && !model.canAdoptUnchanged && (
            <p>
              {text(
                '没有可恢复的设置。请检查跳过项。',
                'No settings to restore. See skipped items.',
              )}
            </p>
          )}
        </>
      )}
    </>
  );
}

function LibrarySync({ model, text, dispatch }: SurfaceProps) {
  const form = model.targetForm;
  const location = model.locations.find(({ libraryID }) => libraryID === form.libraryID);
  const editing = !!form.editingID;
  const editTarget = model.targets.find(({ id }) => id === form.editingID);
  const encrypted = form.container === 'age';
  const update = (value: Partial<typeof form>) =>
    dispatch({ type: 'target-form', value: { ...form, ...value } });
  const statuses = {
    ready: text('可用', 'Ready'),
    conflict: text('云端有改动，已暂停', 'Cloud changes detected; sync paused'),
    paused: text('已暂停', 'Paused'),
    error: text('出错', 'Error'),
  } satisfies Record<(typeof model.targets)[number]['status'], string>;
  const setup = (
    <fieldset disabled={model.busy}>
      <legend>
        {editing
          ? text('编辑同步设置', 'Edit sync settings')
          : text('设置文库同步', 'Set up Library Sync')}
      </legend>
      <Scope model={model} text={text} dispatch={dispatch} />
      {!editing && (
        <Encryption
          text={text}
          encrypted={encrypted}
          includeSecrets={form.includeSecrets}
          changeEncryption={(checked) =>
            update({
              container: checked ? 'age' : 'json',
              autoUpdate: !checked,
              includeSecrets: checked && form.includeSecrets,
            })
          }
          changeSecrets={(checked) =>
            update({
              includeSecrets: checked,
              ...(checked ? { container: 'age', autoUpdate: false } : {}),
            })
          }
        />
      )}
      {encrypted ? (
        <p>
          {text(
            '加密备份只能手动更新，每次都需要密码。',
            'Encrypted backups can only be updated manually, with a password each time.',
          )}
        </p>
      ) : (
        <label>
          <input
            type="checkbox"
            checked={form.autoUpdate}
            onChange={(event) => update({ autoUpdate: event.currentTarget.checked })}
          />
          {text(
            '本机设置有变化时自动更新备份',
            'Automatically update the backup when local settings change',
          )}
        </label>
      )}
      <details key={form.editingID ?? 'new'} open={editing || undefined}>
        <summary>{text('更改存放位置与名称', 'Change location and name')}</summary>
        <div className="neo-snapshot-toolbar">
          <label>
            {text('标题', 'Title')}{' '}
            <input
              value={form.title}
              onChange={(event) => update({ title: event.currentTarget.value })}
            />
          </label>
          <label>
            {text('文库', 'Library')}{' '}
            <select
              disabled={editing}
              value={form.libraryID}
              onChange={(event) =>
                update({ libraryID: Number(event.currentTarget.value), collectionID: null })
              }
            >
              <option value={0}>{text('选择文库', 'Choose a library')}</option>
              {model.locations.map(({ libraryID, label, writable }) => (
                <option key={libraryID} value={libraryID} disabled={!writable}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('分类', 'Collection')}{' '}
            <select
              value={form.collectionID ?? ''}
              onChange={(event) =>
                update({
                  collectionID: event.currentTarget.value
                    ? Number(event.currentTarget.value)
                    : null,
                })
              }
            >
              <option value="">{text('无分类', 'No collection')}</option>
              {location?.collections.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!editing && (
          <label>
            <input
              type="checkbox"
              checked={form.includeLibrarySettings}
              onChange={(event) => update({ includeLibrarySettings: event.currentTarget.checked })}
            />
            {text(
              '包含文库级设置（仅可恢复到原文库）',
              'Include library settings (restore to the original library only)',
            )}
          </label>
        )}
      </details>
      {!editing && encrypted && !model.targetPasswordAction && (
        <Password
          text={text}
          label={text('备份密码', 'Backup password')}
          part="managed-password"
          disabled={model.busy}
        />
      )}
      {!editing && !location?.writable && (
        <p>
          {text(
            '未找到可写的个人文库，请在上方选择文库。',
            'No writable personal library was found. Choose a library above.',
          )}
        </p>
      )}
      <div className="neo-snapshot-toolbar">
        <Button
          primary
          disabled={
            !form.title.trim() ||
            !form.adapterIDs.length ||
            (editing
              ? !editTarget || editTarget.status === 'conflict'
              : !location?.writable || !!model.targetPasswordAction)
          }
          onClick={() => dispatch({ type: editing ? 'target-save' : 'target-create' })}
        >
          {editing
            ? text('保存同步设置', 'Save sync settings')
            : text('开启文库同步', 'Enable Library Sync')}
        </Button>
        {editing && (
          <Button onClick={() => dispatch({ type: 'target-cancel' })}>
            {text('取消编辑', 'Cancel editing')}
          </Button>
        )}
      </div>
      {!editing && (
        <p className="neo-muted">
          {location?.personal
            ? text(
                '备份会保存为“我的文库”中的 Zotero 附件。',
                'Backups are stored as Zotero attachments in My Library.',
              )
            : location
              ? text(
                  `备份会保存为“${location.label}”中的 Zotero 附件。`,
                  `Backups are stored as Zotero attachments in ${location.label}.`,
                )
              : text(
                  '备份会保存为 Zotero 附件。',
                  'Backups are stored as Zotero attachments.',
                )}{' '}
          {text(
            '跨设备使用需开启 Zotero 的数据同步和文件同步。',
            'Enable Zotero data sync and file sync to use them across devices.',
          )}
        </p>
      )}
    </fieldset>
  );
  const hasWorkspace = model.targets.some(({ kind }) => kind === 'workspace');
  return (
    <section>
      {(!hasWorkspace || editing) && setup}
      {!!model.targets.length && (
        <div className="neo-snapshot-toolbar">
          <h3>{text('此设备的同步', 'Sync on this device')}</h3>
          <Button disabled={model.busy} onClick={() => dispatch({ type: 'refresh' })}>
            {text('刷新同步状态', 'Refresh sync status')}
          </Button>
        </div>
      )}
      {model.targets.map((target) => {
        const conflict = target.status === 'conflict';
        const passwordAction =
          model.targetPasswordAction?.id === target.id ? model.targetPasswordAction : undefined;
        return (
          <section key={target.id} className="neo-snapshot-target">
            <h4>{target.title}</h4>
            <p>
              {statuses[target.status]}
              {target.kind === 'legacy' &&
                ` · ${text('旧版单插件备份', 'Legacy single-plugin backup')}`}
              {' · '}
              {target.autoUpdate ? text('自动更新', 'Auto-update') : text('仅手动', 'Manual only')}
              {' · '}
              {text('上次写入：', 'Last written: ')}
              <time dateTime={target.updatedAt}>
                {new Date(target.updatedAt).toLocaleString(model.chinese ? 'zh-CN' : undefined)}
              </time>
            </p>
            {!!target.message && <p className="neo-muted">{target.message}</p>}
            {conflict && (
              <p>
                {text(
                  '覆盖云端会用本机设置替换当前云端版本。',
                  'Overwriting replaces the current cloud version with local settings.',
                )}
              </p>
            )}
            {passwordAction && (
              <Password
                key={
                  passwordAction.type === 'target-overwrite' ? passwordAction.revision : 'update'
                }
                text={text}
                label={text('备份密码', 'Backup password')}
                part="managed-password"
                disabled={model.busy}
              />
            )}
            <div className="neo-snapshot-toolbar">
              <Button
                disabled={model.busy}
                onClick={() => dispatch({ type: 'target-preview', id: target.id })}
              >
                {conflict
                  ? text('查看并应用云端改动', 'Review and apply cloud changes')
                  : text('从此备份恢复', 'Restore this backup')}
              </Button>
              {conflict ? (
                <Button
                  disabled={model.busy || !target.conflictRevision}
                  onClick={() => {
                    if (target.conflictRevision)
                      dispatch({
                        type: 'target-overwrite',
                        id: target.id,
                        revision: target.conflictRevision,
                      });
                  }}
                >
                  {text('以本机为准覆盖云端', 'Overwrite cloud with local settings')}
                </Button>
              ) : (
                <>
                  <Button
                    primary={target.kind === 'workspace'}
                    disabled={model.busy}
                    onClick={() => dispatch({ type: 'target-update', id: target.id })}
                  >
                    {text('立即更新', 'Update now')}
                  </Button>
                  <Button
                    disabled={model.busy}
                    onClick={() => dispatch({ type: 'target-edit', id: target.id })}
                  >
                    {target.kind === 'workspace'
                      ? text('配置同步范围和位置', 'Configure sync scope and location')
                      : text('配置', 'Configure')}
                  </Button>
                </>
              )}
              {passwordAction && (
                <Button
                  disabled={model.busy}
                  onClick={() => dispatch({ type: 'target-password-cancel' })}
                >
                  {text('取消输入密码', 'Cancel password entry')}
                </Button>
              )}
              <Button
                disabled={model.busy}
                onClick={() => dispatch({ type: 'target-forget', id: target.id })}
              >
                {text('取消本机关联（保留附件）', 'Remove local link (keep attachment)')}
              </Button>
            </div>
          </section>
        );
      })}
      {hasWorkspace && !editing && (
        <details>
          <summary>{text('添加其他同步位置', 'Add another sync location')}</summary>
          {setup}
        </details>
      )}
      <LibrarySources model={model} text={text} dispatch={dispatch} />
    </section>
  );
}

function PluginTemplates({ model, text, dispatch }: SurfaceProps) {
  const statuses = {
    builtin: text('内置支持', 'Built-in support'),
    reviewed: text('本机已选字段', 'Fields selected locally'),
    draft: text('草稿，不可恢复', 'Draft; cannot restore'),
    'needs-review': text('请重新选择本机字段', 'Select local fields again'),
    unavailable: text('插件缺失或不支持', 'Plugin missing or unsupported'),
  } satisfies Record<(typeof model.plugins)[number]['status'], string>;
  return (
    <details>
      <summary>{text('插件设置与模板', 'Plugin settings and templates')}</summary>
      <p>
        {text(
          '扫描本机插件并勾选要纳入的设置。导入模板不会授予恢复权限。',
          'Scan an installed plugin and select the settings to include. Importing a template does not grant restore permission.',
        )}
      </p>
      <Button disabled={model.busy} onClick={() => dispatch({ type: 'template-import' })}>
        {text('导入模板…', 'Import template…')}
      </Button>
      {model.plugins.map((plugin) => {
        const editable = plugin.status !== 'builtin' && plugin.status !== 'unavailable';
        return (
          <details key={plugin.pluginID}>
            <summary>
              {plugin.label} · {statuses[plugin.status]}
            </summary>
            {editable && (
              <div className="neo-snapshot-toolbar">
                <Button
                  disabled={model.busy}
                  onClick={() => dispatch({ type: 'scan', id: plugin.pluginID })}
                >
                  {text('扫描本机字段', 'Scan local fields')}
                </Button>
                <Button
                  disabled={model.busy || !plugin.fields.length}
                  onClick={() => dispatch({ type: 'template-export', id: plugin.pluginID })}
                >
                  {text('导出模板…', 'Export template…')}
                </Button>
              </div>
            )}
            {plugin.fields.map((field, index) => {
              const choice = plugin.review[index]!;
              const disabled = !editable || !field.supported || model.busy;
              return (
                <div key={field.key}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={choice.portable}
                      onChange={(event) =>
                        dispatch({
                          type: 'review-field',
                          pluginID: plugin.pluginID,
                          key: field.key,
                          portable: event.currentTarget.checked,
                          secret: choice.secret,
                        })
                      }
                    />
                    {field.label}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      disabled={disabled || field.secret}
                      checked={choice.secret}
                      onChange={(event) =>
                        dispatch({
                          type: 'review-field',
                          pluginID: plugin.pluginID,
                          key: field.key,
                          portable: choice.portable,
                          secret: event.currentTarget.checked,
                        })
                      }
                    />
                    {text('敏感（仅加密备份）', 'Sensitive (encrypted backups only)')}
                  </label>
                  {!field.supported && text('不支持', 'Unsupported')}
                  {field.requiresRestart && text('（需重启）', ' (restart required)')}
                </div>
              );
            })}
            <details>
              <summary>{text('字段来源和技术信息', 'Field sources and technical details')}</summary>
              <p>
                {plugin.pluginID} · {plugin.version}
              </p>
              <ul>
                {plugin.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
                {plugin.fields.map(({ key, source, reason }) => (
                  <li key={key}>
                    <code>{key}</code> · {source}
                    {reason && ` · ${reason}`}
                  </li>
                ))}
              </ul>
            </details>
          </details>
        );
      })}
    </details>
  );
}
