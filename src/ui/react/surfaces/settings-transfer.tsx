import { React } from '../runtime';
import { createReactView } from '../view';
import { Button, Status } from '../components';
import type { ReactView } from '../types';
import type {
  SettingsTransferCommand,
  SettingsTransferModel,
} from '../../../settings-transfer/react-model';

export const SETTINGS_TRANSFER_CSS = `
.neo-settings-transfer .neo-transfer-toolbar { display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0; }
.neo-settings-transfer input[type=password] { color:inherit;background:var(--zotero-neo-surface);border:1px solid var(--zotero-neo-border);padding:6px;font:inherit;max-width:100%; }
.neo-settings-transfer fieldset { border:1px solid var(--zotero-neo-border);margin:12px 0;padding:10px; }
.neo-settings-transfer fieldset label { margin-inline-end:14px; }
.neo-settings-transfer table { border-collapse:collapse;width:100%;table-layout:fixed; }
.neo-settings-transfer th,.neo-settings-transfer td { padding:8px;border-bottom:1px solid var(--zotero-neo-border);text-align:start;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere; }
.neo-settings-transfer .neo-transfer-path { overflow-wrap:anywhere; }
.neo-settings-transfer details { margin:12px 0; }
`;
export function mountSettingsTransferView(
  root: HTMLElement,
  initial: SettingsTransferModel,
  dispatch: (command: SettingsTransferCommand) => void,
): ReactView<SettingsTransferModel> {
  return createReactView(
    root,
    (model) => {
      const text = (cn: string, en: string) => (model.chinese ? cn : en);
      return (
        <div className="neo-settings-transfer">
          <h2>{text('配置导出与恢复', 'Export and restore settings')}</h2>
          <p className="neo-muted">
            {text(
              '独立本地文件，不经 Zotero 同步。只迁移已支持的配置，不包含插件安装包、文库、文献或账号会话。文件与密码由你保管。',
              'Independent local files, not Zotero Sync. Only supported settings are transferred, not plugin packages, libraries, documents or account sessions. Keep the file and password yourself.',
            )}
          </p>
          <div className="neo-transfer-toolbar">
            <Button
              disabled={model.busy || model.mode === 'export'}
              onClick={() => dispatch({ type: 'mode', value: 'export' })}
            >
              {text('导出', 'Export')}
            </Button>
            <Button
              disabled={model.busy || model.mode === 'import'}
              onClick={() => dispatch({ type: 'mode', value: 'import' })}
            >
              {text('导入与恢复', 'Import and restore')}
            </Button>
            <Button disabled={!model.busy} onClick={() => dispatch({ type: 'stop' })}>
              {text('停止', 'Stop')}
            </Button>
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          {model.mode === 'export' ? (
            <>
              <fieldset disabled={model.busy}>
                <legend>{text('配置 adapters', 'Settings adapters')}</legend>
                {model.adapters.map((adapter) => (
                  <label key={adapter.id}>
                    <input
                      type="checkbox"
                      checked={adapter.selected}
                      onChange={(event) =>
                        dispatch({
                          type: 'adapter',
                          id: adapter.id,
                          checked: event.currentTarget.checked,
                        })
                      }
                    />
                    {adapter.label}
                  </label>
                ))}
              </fieldset>
              <fieldset disabled={model.busy}>
                <legend>
                  {text('额外授权范围（默认不选）', 'Additional scope (off by default)')}
                </legend>
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={model.includeSecrets}
                      onChange={(event) =>
                        dispatch({ type: 'include-secrets', checked: event.currentTarget.checked })
                      }
                    />
                    {text(
                      '包含受支持的密码与 API 凭据；只写入加密文件',
                      'Include supported passwords and API credentials, only inside the encrypted file',
                    )}
                  </label>
                </p>
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={model.includeLibrarySettings}
                      onChange={(event) =>
                        dispatch({ type: 'include-library', checked: event.currentTarget.checked })
                      }
                    />
                    {text(
                      '包含已由 Zotero 同步的库级设置；恢复时必须匹配原生库身份',
                      'Include library settings already synced by Zotero; restore requires matching native library identity',
                    )}
                  </label>
                </p>
              </fieldset>
              <div className="neo-transfer-toolbar">
                <label>
                  {text('文件密码', 'File password')}{' '}
                  <input
                    data-neo-ui-part="export-password"
                    type="password"
                    autoComplete="new-password"
                    disabled={model.busy}
                  />
                </label>
                <label>
                  {text('确认密码', 'Confirm password')}{' '}
                  <input
                    data-neo-ui-part="export-confirm"
                    type="password"
                    autoComplete="new-password"
                    disabled={model.busy}
                  />
                </label>
                <Button
                  primary
                  disabled={model.busy || !model.adapters.some((adapter) => adapter.selected)}
                  onClick={() => dispatch({ type: 'export' })}
                >
                  {text('加密并另存为…', 'Encrypt and save as…')}
                </Button>
              </div>
              <p className="neo-muted">
                {text(
                  '使用标准 age 密码加密；忘记密码无法恢复。派生在后台 worker 执行，约需 256 MiB 内存；可停止。',
                  'Standard age passphrase encryption. A forgotten password cannot be recovered. Derivation runs in a background worker, needs about 256 MiB memory, and can be stopped.',
                )}
              </p>
            </>
          ) : (
            <>
              <div className="neo-transfer-toolbar">
                <Button disabled={model.busy} onClick={() => dispatch({ type: 'choose-file' })}>
                  {text('选择加密文件…', 'Choose encrypted file…')}
                </Button>
                <label>
                  {text('文件密码', 'File password')}{' '}
                  <input
                    data-neo-ui-part="import-password"
                    type="password"
                    autoComplete="off"
                    disabled={model.busy}
                  />
                </label>
                <Button
                  disabled={model.busy || !model.sourcePath}
                  onClick={() => dispatch({ type: 'inspect' })}
                >
                  {text('解密并预览', 'Decrypt and preview')}
                </Button>
              </div>
              <p className="neo-transfer-path">{model.sourcePath}</p>
              <p className="neo-muted">
                {text(
                  '完整认证后才显示预览；预览不写入配置。密码仅在当前操作内存中保留，用于加密恢复前备份，关闭或恢复结束后释放。',
                  'Preview appears only after full authentication and never writes settings. The password remains only in current-operation memory to encrypt the recovery backup, then is released on close or completed restore.',
                )}
              </p>
              {!!model.groups.length && (
                <>
                  <div className="neo-transfer-toolbar">
                    <Button
                      disabled={model.busy}
                      onClick={() => dispatch({ type: 'choose-backup' })}
                    >
                      {text('选择加密备份位置…', 'Choose encrypted backup destination…')}
                    </Button>
                  </div>
                  <p className="neo-transfer-path">
                    {text('恢复前备份：', 'Pre-restore backup: ')}
                    {model.backupPath}
                  </p>
                  <p className="neo-muted">
                    {text(
                      '使用导入文件的相同密码。保存并读回备份后才逐项写入；不是跨 adapter 原子事务。停止或部分失败不会撤销已接纳的修改。',
                      'Uses the import password. Writes start only after the backup is saved and read back. This is not an atomic transaction across adapters. Stop or partial failure does not undo admitted changes.',
                    )}
                  </p>
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
                        {text(
                          '选择此类别全部可恢复项（含秘密项）',
                          'Select all restorable fields in this category (including secrets)',
                        )}
                      </label>
                      <table>
                        <thead>
                          <tr>
                            <th>{text('恢复项', 'Restore setting')}</th>
                            <th>{text('当前值', 'Current value')}</th>
                            <th>{text('文件值／目标值', 'File / mapped value')}</th>
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
                                {field.secret && <span> {text('（秘密）', '(secret)')}</span>}
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
                              <td>{field.before === '' ? '⟨empty / 空⟩' : field.before}</td>
                              <td>{field.after === '' ? '⟨empty / 空⟩' : field.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ))}
                  <Button
                    primary
                    disabled={model.busy || !model.canApply}
                    onClick={() => dispatch({ type: 'apply' })}
                  >
                    {text(
                      `保存加密备份并恢复 ${model.selectedCount} 项`,
                      `Save encrypted backup and restore ${model.selectedCount} fields`,
                    )}
                  </Button>
                </>
              )}
            </>
          )}
          <Status error={model.error}>{model.status}</Status>
          {!!model.issues.length && (
            <details open>
              <summary>{text('范围与注意事项', 'Scope and attention required')}</summary>
              <ul>
                {model.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {!!model.receipts.length && (
            <section>
              <h3>{text('逐项恢复回执', 'Per-setting restore receipts')}</h3>
              <p className="neo-transfer-path">{model.backupPath}</p>
              <ul>
                {model.receipts.map((receipt, index) => (
                  <li key={index}>{receipt}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    },
    initial,
  );
}
