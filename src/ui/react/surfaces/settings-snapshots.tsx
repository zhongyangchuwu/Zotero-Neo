import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import type {
  SettingsSnapshotCommand,
  SettingsSnapshotExtensionRow,
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
          {model.extensionRestart && (
            <Status>
              {text(
                '请重启 Zotero 以完成扩展更改。',
                'Restart Zotero to finish applying extension changes.',
              )}
            </Status>
          )}
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
      {model.extensionCount !== undefined && (
        <p>
          {text(
            `包含 ${model.extensionCount} 个第三方扩展`,
            `Third-party extensions included: ${model.extensionCount}`,
          )}
        </p>
      )}
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
  const preferred = model.preferredLibrarySource;
  const sources = model.sources.filter(
    ({ libraryID, itemKey }) =>
      !preferred || libraryID !== preferred.libraryID || itemKey !== preferred.itemKey,
  );
  return (
    <details>
      <summary>{text('文库来源', 'Restore an existing library backup')}</summary>
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
      {sources.length ? (
        <ul>
          {sources.map(({ libraryID, itemKey, title }) => (
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
        <p>
          {model.sources.length
            ? text('此文库暂无其他可用备份。', 'No other backups available in this library.')
            : text('此文库暂无可用备份。', 'No backups available in this library.')}
        </p>
      )}
    </details>
  );
}

function ExtensionSourceEditor({
  row,
  busy,
  text,
  dispatch,
}: Pick<SurfaceProps, 'text' | 'dispatch'> & {
  readonly row: SettingsSnapshotExtensionRow;
  readonly busy: boolean;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const selection = React.useRef<HTMLSelectElement>(null);
  const composing = React.useRef(false);
  return (
    <>
      <form
        className="neo-snapshot-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const value = input.current?.value;
          if (busy || composing.current || !value) return;
          dispatch({ type: 'extension-source-lookup', id: row.id, value });
        }}
      >
        <label>
          {text(
            '扩展来源（GitHub 仓库或 .xpi 链接）',
            'Extension source (GitHub repository or .xpi link)',
          )}{' '}
          <input
            type="text"
            ref={input}
            autoFocus
            required
            disabled={busy}
            autoComplete="off"
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
          />
        </label>
        <Button type="submit" disabled={busy}>
          {text('查找扩展', 'Find extension')}
        </Button>
        <Button
          disabled={busy}
          onClick={() => dispatch({ type: 'extension-source-close', id: row.id })}
        >
          {text('取消', 'Cancel')}
        </Button>
      </form>
      {!!row.candidates?.length && (
        <form
          className="neo-snapshot-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            const value = selection.current?.value;
            if (!busy && value) {
              dispatch({ type: 'extension-source-choose', id: row.id, index: Number(value) });
            }
          }}
        >
          <label>
            {text('选择 .xpi 安装包', 'Choose an .xpi package')}{' '}
            <select ref={selection} required disabled={busy} defaultValue="">
              <option value="" disabled>
                {text('选择安装包', 'Select a package')}
              </option>
              {row.candidates.map(({ name, version, source }, index) => (
                <option key={index} value={index}>
                  {version ? `${name} (${version}) — ${source}` : `${name} — ${source}`}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {text('使用此安装包', 'Use this package')}
          </Button>
        </form>
      )}
    </>
  );
}

function ExtensionDiff({ model, text, dispatch }: SurfaceProps) {
  const diff = model.extensionDiff;
  if (!diff || (!diff.rows.length && !diff.sameCount)) return null;
  const enabled = (value: boolean | undefined) => {
    if (value === undefined) return text('未知', 'Unknown');
    return value ? text('已启用', 'Enabled') : text('已禁用', 'Disabled');
  };
  const statuses = {
    install: text('缺失，可安装', 'Install'),
    missing: text('无安装来源', 'Installation source needed'),
    state: text('更改启用状态', 'Change enabled state'),
    blocked: text('无法恢复', 'Cannot restore'),
  };
  return (
    <details open>
      <summary>{text('扩展', 'Third-party extensions')}</summary>
      {diff.sameCount > 0 && (
        <p className="neo-muted">
          <small>
            {text(
              `已有 ${diff.sameCount} 个扩展与备份一致`,
              `Extensions already matching: ${diff.sameCount}`,
            )}
          </small>
        </p>
      )}
      {diff.rows.some(({ status }) => status === 'install' || status === 'missing') && (
        <p>
          {text(
            '恢复时会从下方显示的来源安装所选扩展。扩展包含可执行代码，请只选择您信任的来源。',
            'Restore installs the selected extensions from the sources shown below. Extensions contain executable code; select only sources you trust.',
          )}
        </p>
      )}
      {diff.rows.map((row) => (
        <div key={row.id} className="neo-snapshot-target">
          <label>
            <input
              type="checkbox"
              checked={row.checked}
              disabled={
                model.busy ||
                row.status === 'missing' ||
                row.status === 'blocked' ||
                row.addingSource
              }
              onChange={(event) =>
                dispatch({
                  type: 'extension-toggle',
                  id: row.id,
                  checked: event.currentTarget.checked,
                })
              }
            />{' '}
            {row.name} {row.version}
          </label>
          {' — '}
          {statuses[row.status]}
          {row.status === 'state' && `: ${enabled(row.fromEnabled)} → ${enabled(row.toEnabled)}`}
          {row.status === 'install' && ` → ${enabled(row.toEnabled)}`}
          {row.source && (
            <p className="neo-snapshot-path">
              {text('来源：', 'Source: ')}
              {row.source}
            </p>
          )}
          {row.message && <p className="neo-snapshot-path">{row.message}</p>}
          {row.addingSource ? (
            <ExtensionSourceEditor row={row} busy={model.busy} text={text} dispatch={dispatch} />
          ) : (
            (row.status === 'missing' || row.canReplace) && (
              <Button
                disabled={model.busy}
                aria-label={
                  row.source
                    ? text(`更换 ${row.name} 的来源`, `Replace source for ${row.name}`)
                    : text(`添加 ${row.name} 的来源`, `Add source for ${row.name}`)
                }
                onClick={() => dispatch({ type: 'extension-source-open', id: row.id })}
              >
                {row.source
                  ? text('更换来源…', 'Replace source…')
                  : text('补充来源…', 'Add source…')}
              </Button>
            )
          )}
        </div>
      ))}
    </details>
  );
}

function Restore({ model, text, dispatch }: SurfaceProps) {
  const preferred = model.reviewingConflict ? undefined : model.preferredLibrarySource;
  const hasExtensionChanges = !!model.extensionDiff?.rows.length;
  const hasChanges = !!model.groups.length || hasExtensionChanges;
  const canBackUp = model.canBackUpCurrent ?? !!model.groups.length;
  return (
    <>
      <div className="neo-snapshot-toolbar">
        {preferred && (
          <Button
            primary
            disabled={model.busy}
            onClick={() =>
              dispatch({
                type: 'source',
                libraryID: preferred.libraryID,
                itemKey: preferred.itemKey,
              })
            }
          >
            {text(`预览文库备份：${preferred.title}`, `Preview library backup: ${preferred.title}`)}
          </Button>
        )}
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
                '仅恢复所选改动。只有完整应用云端改动后才会恢复同步；部分恢复不会覆盖云端备份。',
                'Only selected changes are restored. Sync resumes only after all cloud changes are applied; a partial restore never overwrites the cloud backup.',
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
          <ExtensionDiff model={model} text={text} dispatch={dispatch} />
          <div className="neo-snapshot-toolbar">
            {canBackUp && (
              <Button
                disabled={model.busy || !model.canApply}
                onClick={() => dispatch({ type: 'export-current' })}
              >
                {text('备份当前设置…', 'Back up current settings…')}
              </Button>
            )}
            {model.canAdoptUnchanged && !model.canApply ? (
              <Button primary disabled={model.busy} onClick={() => dispatch({ type: 'apply' })}>
                {text('本机已一致，采用云端版本', 'Settings already match; adopt cloud version')}
              </Button>
            ) : (
              (hasChanges || model.canApply) && (
                <Button
                  primary
                  disabled={model.busy || !model.canApply}
                  onClick={() => dispatch({ type: 'apply' })}
                >
                  {text(
                    `恢复所选 ${model.selectedCount} 项`,
                    hasExtensionChanges
                      ? `Restore ${model.selectedCount} selected changes`
                      : `Restore ${model.selectedCount} selected settings`,
                  )}
                </Button>
              )
            )}
          </div>
          {!hasChanges && !model.canApply && !model.canAdoptUnchanged && (
            <p>
              {model.extensionDiff && !model.issues.length
                ? text('没有可恢复的改动。', 'No changes to restore.')
                : text(
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
