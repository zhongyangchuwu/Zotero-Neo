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
.neo-settings-snapshots .neo-snapshot-confirm { border:1px solid var(--zotero-neo-border);padding:8px 12px;margin-top:12px; }
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
      const text = (cn: string, en: string) => (model.chinese ? cn : en);
      const form = model.targetForm;
      const location = model.locations.find((entry) => entry.libraryID === form.libraryID);
      const statuses: Readonly<Record<string, string>> = {
        builtin: text('内置验证／支持', 'Built-in verified / supported'),
        reviewed: text('用户审核／支持', 'User reviewed / supported'),
        draft: text('草稿（不可恢复）', 'Draft (not restorable)'),
        'needs-review': text('需要重新审核', 'Review needed'),
        unavailable: text('插件缺失／不支持，跳过', 'Plugin missing / unsupported; skipped'),
      };
      return (
        <div className="neo-settings-snapshots">
          <h2>{text('设置快照', 'Settings snapshots')}</h2>
          <div className="neo-snapshot-toolbar">
            {model.exportFromReview ? (
              <Button disabled={model.busy} onClick={() => dispatch({ type: 'return-to-preview' })}>
                {text('返回差异预览', 'Back to preview')}
              </Button>
            ) : (
              <>
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
                  {text('恢复', 'Restore')}
                </Button>
                {model.managedAvailable && (
                  <Button
                    disabled={model.busy || model.mode === 'managed'}
                    onClick={() => dispatch({ type: 'mode', value: 'managed' })}
                  >
                    {text('文库中的快照', 'Snapshots in library')}
                  </Button>
                )}
              </>
            )}
            {!model.exportFromReview && (model.catalogAvailable || model.managedAvailable) && (
              <Button disabled={model.busy} onClick={() => dispatch({ type: 'refresh' })}>
                {text('刷新', 'Refresh')}
              </Button>
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
          {model.mode === 'export' ? (
            !model.exportFromReview && (
              <p>
                {text(
                  '把选中的插件设置保存到一个文件。',
                  'Save the selected plugins’ settings to a file.',
                )}
              </p>
            )
          ) : model.mode === 'import' ? (
            <p>
              {text(
                '选择快照，预览差异后再恢复设置。',
                'Choose a snapshot and review changes before restoring settings.',
              )}
            </p>
          ) : (
            <p>
              {text(
                '将插件设置存入文库。跨设备使用需要开启 Zotero 的数据和文件同步。',
                'Save plugin settings in your library. Enable Zotero data and file sync to use them on another device.',
              )}
            </p>
          )}
          {model.mode === 'export' ? (
            <>
              {model.exportFromReview && (
                <>
                  <h3>{text('导出当前配置', 'Export current settings')}</h3>
                  <p>
                    {text(
                      '已选中这次恢复涉及的插件。导出后会回到差异预览。',
                      'The plugins affected by this restore are selected. After saving, you’ll return to the preview.',
                    )}
                  </p>
                </>
              )}
              <fieldset disabled={model.busy}>
                <legend>{text('选择插件', 'Choose plugins')}</legend>
                {model.adapters.map((adapter) => (
                  <div className="neo-snapshot-toolbar" key={adapter.id}>
                    <label>
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
                  </div>
                ))}
              </fieldset>
              <fieldset disabled={model.busy}>
                <legend>{text('文件格式', 'File format')}</legend>
                <select
                  aria-label={text('文件格式', 'File format')}
                  value={model.container}
                  onChange={(event) =>
                    dispatch({
                      type: 'container',
                      value: event.currentTarget.value === 'json' ? 'json' : 'age',
                    })
                  }
                >
                  <option value="age">{text('加密文件（.age）', 'Encrypted file (.age)')}</option>
                  <option value="json">
                    {text('明文文件（.json）', 'Unencrypted file (.json)')}
                  </option>
                </select>
                <p className="neo-muted">
                  {model.container === 'age'
                    ? text(
                        '恢复时需要文件密码，请妥善保管。',
                        'Keep the file password. You’ll need it to restore these settings.',
                      )
                    : text(
                        '无需密码。文件可直接读取，不包含已知的密码和密钥。',
                        'No password needed. The file is readable and excludes known passwords and keys.',
                      )}
                </p>
              </fieldset>
              {model.container === 'age' && (
                <div className="neo-snapshot-toolbar">
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
                </div>
              )}
              <details>
                <summary>
                  {text('更多导出选项', 'More export options')}
                  {(model.includeSecrets || model.includeLibrarySettings) &&
                    text('（已选择）', ' (selected)')}
                </summary>
                <fieldset disabled={model.busy}>
                  <legend>{text('额外包含', 'Also include')}</legend>
                  <p>
                    <label>
                      <input
                        type="checkbox"
                        disabled={model.container !== 'age'}
                        checked={model.includeSecrets}
                        onChange={(event) =>
                          dispatch({
                            type: 'include-secrets',
                            checked: event.currentTarget.checked,
                          })
                        }
                      />
                      {text(
                        '保存支持的密码和 API 密钥（需要加密）',
                        'Include supported passwords and API keys (encryption required)',
                      )}
                    </label>
                  </p>
                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={model.includeLibrarySettings}
                        onChange={(event) =>
                          dispatch({
                            type: 'include-library',
                            checked: event.currentTarget.checked,
                          })
                        }
                      />
                      {text(
                        '保存文库级设置（只能恢复到原文库）',
                        'Include library settings (restore to the original library only)',
                      )}
                    </label>
                  </p>
                </fieldset>
              </details>
              <div className="neo-snapshot-toolbar">
                <Button
                  primary
                  disabled={model.busy || !model.adapters.some((adapter) => adapter.selected)}
                  onClick={() => dispatch({ type: 'export' })}
                >
                  {text('导出所选插件…', 'Export selected plugins…')}
                </Button>
              </div>
              <details>
                <summary>{text('单独导出插件', 'Export one plugin')}</summary>
                {model.adapters.map((adapter) => (
                  <Button
                    key={adapter.id}
                    disabled={model.busy}
                    onClick={() => dispatch({ type: 'plugin-export', id: adapter.id })}
                  >
                    {text(`仅导出 ${adapter.label}…`, `Export ${adapter.label} only…`)}
                  </Button>
                ))}
              </details>
            </>
          ) : model.mode === 'import' ? (
            <>
              <div className="neo-snapshot-toolbar">
                <Button disabled={model.busy} onClick={() => dispatch({ type: 'choose-file' })}>
                  {text('选择快照文件…', 'Choose snapshot file…')}
                </Button>
                {model.sourceLabel &&
                  !model.hasPreview &&
                  model.sourceContainer === 'age' &&
                  (!model.receipts.length || model.error) && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        dispatch({ type: 'inspect' });
                      }}
                    >
                      <label>
                        {text('来源密码', 'Source password')}{' '}
                        <input
                          data-neo-ui-part="import-password"
                          type="password"
                          autoComplete="off"
                          disabled={model.busy}
                        />
                      </label>{' '}
                      <Button type="submit" disabled={model.busy}>
                        {text('解锁并预览', 'Unlock and preview')}
                      </Button>
                    </form>
                  )}
                {model.sourceLabel &&
                  !model.hasPreview &&
                  model.sourceContainer !== 'age' &&
                  model.error && (
                    <Button disabled={model.busy} onClick={() => dispatch({ type: 'inspect' })}>
                      {text('重新预览', 'Preview again')}
                    </Button>
                  )}
              </div>
              {model.managedAvailable && (
                <details>
                  <summary>{text('从 Zotero 附件选择', 'Choose a Zotero attachment')}</summary>
                  <label>
                    {text('来源文库', 'Source library')}{' '}
                    <select
                      disabled={model.busy}
                      value={model.sourceLibraryID}
                      onChange={(event) =>
                        dispatch({
                          type: 'source-library',
                          libraryID: Number(event.currentTarget.value),
                        })
                      }
                    >
                      {model.locations.map((entry) => (
                        <option key={entry.libraryID} value={entry.libraryID}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {model.sources.length ? (
                    <ul>
                      {model.sources.map((source) => (
                        <li key={`${source.libraryID}:${source.itemKey}`}>
                          <Button
                            disabled={model.busy}
                            onClick={() =>
                              dispatch({
                                type: 'source',
                                libraryID: source.libraryID,
                                itemKey: source.itemKey,
                              })
                            }
                          >
                            {source.title} · {source.itemKey}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {text('此文库暂无可用快照附件。', 'No snapshot attachments in this library.')}
                    </p>
                  )}
                </details>
              )}
              {model.sourceLabel && (
                <p className="neo-snapshot-path">
                  {text('来源：', 'Source: ')}
                  {model.sourceLabel}
                  {model.sourceContainer &&
                    ` · ${model.sourceContainer === 'age' ? 'age' : 'JSON'}`}
                </p>
              )}
              {model.hasPreview && !model.groups.length && (
                <p>
                  {text(
                    '没有可预览的设置。请检查下方的跳过原因。',
                    'No settings to preview. Review any skipped items below.',
                  )}
                </p>
              )}
              {model.hasPreview && !!model.groups.length && (
                <>
                  <h3>{text('差异预览', 'Preview changes')}</h3>
                  <p className="neo-muted">
                    {text(
                      '勾选要恢复的设置。预览不会修改本机配置。',
                      'Select the settings to restore. Preview does not change current settings.',
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
                        {group.fields.some((field) => field.secret && !field.blocked)
                          ? text(
                              '全选（包括敏感设置）',
                              'Select all (including sensitive settings)',
                            )
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
                              <td>{field.before}</td>
                              <td>{field.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ))}
                  {model.confirmingRestore ? (
                    <section
                      className="neo-snapshot-confirm"
                      aria-label={text('确认恢复', 'Confirm restore')}
                    >
                      <p>
                        {text(
                          `将覆盖所选 ${model.selectedCount} 项设置，不会自动保留旧值。`,
                          `This overwrites ${model.selectedCount} selected settings. Previous values are not saved automatically.`,
                        )}
                      </p>
                      <div className="neo-snapshot-toolbar">
                        <Button onClick={() => dispatch({ type: 'cancel-restore' })}>
                          {text('取消', 'Cancel')}
                        </Button>
                        <Button primary onClick={() => dispatch({ type: 'apply' })}>
                          {text('确认恢复', 'Confirm restore')}
                        </Button>
                      </div>
                    </section>
                  ) : (
                    <div className="neo-snapshot-toolbar">
                      <Button
                        disabled={model.busy || !model.canApply}
                        onClick={() => dispatch({ type: 'export-current' })}
                      >
                        {text('导出当前配置…', 'Export current settings…')}
                      </Button>
                      <Button
                        primary
                        disabled={model.busy || !model.canApply}
                        onClick={() => dispatch({ type: 'review-restore' })}
                      >
                        {text(
                          `恢复所选 ${model.selectedCount} 项…`,
                          `Restore ${model.selectedCount} selected settings…`,
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}
          {model.mode === 'managed' && model.managedAvailable && (
            <section>
              <fieldset disabled={model.busy}>
                <legend>
                  {form.editingID
                    ? text('编辑附件设置', 'Edit attachment settings')
                    : text('存为 Zotero 附件', 'Save as a Zotero attachment')}
                </legend>
                <div className="neo-snapshot-toolbar">
                  <label>
                    {text('插件', 'Plugin')}{' '}
                    <select
                      disabled={!!form.editingID}
                      value={form.adapterID}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: { ...form, adapterID: event.currentTarget.value },
                        })
                      }
                    >
                      {model.adapters.map((adapter) => (
                        <option key={adapter.id} value={adapter.id}>
                          {adapter.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {text('标题', 'Title')}{' '}
                    <input
                      value={form.title}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: { ...form, title: event.currentTarget.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    {text('文库', 'Library')}{' '}
                    <select
                      disabled={!!form.editingID}
                      value={form.libraryID}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: {
                            ...form,
                            libraryID: Number(event.currentTarget.value),
                            collectionID: null,
                          },
                        })
                      }
                    >
                      {model.locations.map((entry) => (
                        <option
                          key={entry.libraryID}
                          value={entry.libraryID}
                          disabled={!entry.writable}
                        >
                          {entry.label}
                          {!entry.writable ? text('（只读）', ' (read-only)') : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {text('分类', 'Collection')}{' '}
                    <select
                      value={form.collectionID ?? ''}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: {
                            ...form,
                            collectionID: event.currentTarget.value
                              ? Number(event.currentTarget.value)
                              : null,
                          },
                        })
                      }
                    >
                      <option value="">{text('无分类', 'No collection')}</option>
                      {location?.collections.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {text('文件格式', 'File format')}{' '}
                    <select
                      disabled={!!form.editingID}
                      value={form.container}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: {
                            ...form,
                            container: event.currentTarget.value === 'json' ? 'json' : 'age',
                            autoUpdate: false,
                          },
                        })
                      }
                    >
                      <option value="age">
                        {text('加密文件（.age）', 'Encrypted file (.age)')}
                      </option>
                      <option value="json">
                        {text('明文文件（.json）', 'Unencrypted file (.json)')}
                      </option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      disabled={form.container === 'age'}
                      checked={form.autoUpdate}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: { ...form, autoUpdate: event.currentTarget.checked },
                        })
                      }
                    />
                    {text(
                      '定期检查，发现变化时更新附件',
                      'Check periodically and update the attachment if settings changed',
                    )}
                  </label>
                </div>
                <p className="neo-muted">
                  {form.container === 'age'
                    ? text(
                        '加密快照只能手动更新，每次都需要输入密码。',
                        'Update encrypted snapshots manually with a password each time.',
                      )
                    : text(
                        '明文文件不含已知密码和密钥。自动更新只写附件，不会把下载的设置应用到本机。',
                        'Unencrypted files exclude known passwords and keys. Auto-update writes to the attachment without applying downloaded settings.',
                      )}
                </p>
                <p>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!!form.editingID || form.container !== 'age'}
                      checked={form.includeSecrets}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: { ...form, includeSecrets: event.currentTarget.checked },
                        })
                      }
                    />
                    {text(
                      '保存支持的密码和 API 密钥（需要加密）',
                      'Include supported passwords and API keys (encryption required)',
                    )}
                  </label>
                </p>
                <p>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!!form.editingID}
                      checked={form.includeLibrarySettings}
                      onChange={(event) =>
                        dispatch({
                          type: 'target-form',
                          value: { ...form, includeLibrarySettings: event.currentTarget.checked },
                        })
                      }
                    />
                    {text(
                      '保存文库级设置（只能恢复到原文库）',
                      'Include library settings (restore to the original library only)',
                    )}
                  </label>
                </p>
                {!form.editingID && (
                  <p>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.consent}
                        onChange={(event) =>
                          dispatch({
                            type: 'target-form',
                            value: { ...form, consent: event.currentTarget.checked },
                          })
                        }
                      />
                      {text(
                        '在所选文库创建一个可见的附件',
                        'Create a visible attachment in the selected library',
                      )}
                    </label>
                  </p>
                )}
                {((!form.editingID && form.container === 'age') ||
                  model.targets.some(
                    (target) => target.container === 'age' && target.status === 'ready',
                  )) && (
                  <label>
                    {text('加密文件密码（仅本次使用）', 'File password (used once)')}{' '}
                    <input
                      data-neo-ui-part="managed-password"
                      type="password"
                      autoComplete="off"
                      disabled={model.busy}
                    />
                  </label>
                )}
                <Button
                  primary
                  disabled={
                    !form.editingID && (!form.consent || !form.adapterID || !location?.writable)
                  }
                  onClick={() =>
                    dispatch({ type: form.editingID ? 'target-save' : 'target-create' })
                  }
                >
                  {form.editingID
                    ? text('保存设置', 'Save settings')
                    : text('存为 Zotero 附件', 'Save as a Zotero attachment')}
                </Button>
                {form.editingID && (
                  <Button onClick={() => dispatch({ type: 'target-cancel' })}>
                    {text('取消编辑', 'Cancel editing')}
                  </Button>
                )}
              </fieldset>
              {model.targets.map((target) => (
                <section key={target.id}>
                  <h4>
                    {target.title} ·{' '}
                    {model.plugins.find((plugin) => plugin.adapterID === target.adapterID)?.label ??
                      target.adapterID}{' '}
                    · {target.container === 'age' ? 'age' : 'JSON'}
                  </h4>
                  <p>
                    {target.status === 'ready'
                      ? text('可用', 'Ready')
                      : target.status === 'paused'
                        ? text('已暂停', 'Paused')
                        : text('出错', 'Error')}
                    {' · '}
                    {text('上次写入：', 'Last written: ')}
                    <time dateTime={target.updatedAt}>
                      {new Date(target.updatedAt).toLocaleString(
                        model.chinese ? 'zh-CN' : undefined,
                      )}
                    </time>
                    {' · '}
                    {target.autoUpdate
                      ? text('自动更新', 'Auto-update')
                      : text('仅手动', 'Manual only')}
                  </p>
                  {target.message && <p className="neo-muted">{target.message}</p>}
                  <div className="neo-snapshot-toolbar">
                    <Button
                      disabled={model.busy}
                      onClick={() => dispatch({ type: 'target-update', id: target.id })}
                    >
                      {text('手动更新', 'Update manually')}
                    </Button>
                    <Button
                      disabled={model.busy}
                      onClick={() => dispatch({ type: 'target-edit', id: target.id })}
                    >
                      {text('配置', 'Configure')}
                    </Button>
                    <Button
                      disabled={model.busy}
                      onClick={() => dispatch({ type: 'target-forget', id: target.id })}
                    >
                      {text('取消本机关联（保留附件）', 'Remove local link (keep attachment)')}
                    </Button>
                  </div>
                </section>
              ))}
            </section>
          )}
          {!!model.issues.length && (
            <details open>
              <summary>
                {text('范围、跳过与注意事项', 'Scope, skips and attention required')}
              </summary>
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
              <ul>
                {model.receipts.map((receipt, index) => (
                  <li key={index}>{receipt}</li>
                ))}
              </ul>
            </section>
          )}
          {model.catalogAvailable && !model.exportFromReview && (
            <details>
              <summary>{text('插件模板与支持范围', 'Plugin templates and coverage')}</summary>
              <p>
                {text(
                  '先扫描，再确认要纳入的设置。必要时，Neo 会打开所选插件的 Zotero 设置页，读取偏好绑定，不读取字段值。',
                  'Scan, then choose what to include. If needed, Neo opens the selected plugin’s Zotero settings to read bindings, not field values.',
                )}
              </p>
              <Button disabled={model.busy} onClick={() => dispatch({ type: 'template-import' })}>
                {text('导入模板 JSON…', 'Import template JSON…')}
              </Button>
              {model.plugins.map((plugin) => (
                <details key={plugin.pluginID}>
                  <summary>
                    {plugin.label} · {plugin.version} · {statuses[plugin.status]}
                  </summary>
                  <p className="neo-snapshot-path">{plugin.pluginID}</p>
                  <div className="neo-snapshot-toolbar">
                    <Button
                      disabled={
                        model.busy || plugin.status === 'builtin' || plugin.status === 'unavailable'
                      }
                      onClick={() => dispatch({ type: 'scan', id: plugin.pluginID })}
                    >
                      {text('扫描／重新扫描', 'Scan / rescan')}
                    </Button>
                    <Button
                      disabled={
                        model.busy ||
                        plugin.status === 'builtin' ||
                        plugin.status === 'unavailable' ||
                        !plugin.fields.some((field) => field.supported)
                      }
                      onClick={() => dispatch({ type: 'review', id: plugin.pluginID })}
                    >
                      {text('确认本机审核', 'Confirm local review')}
                    </Button>
                    <Button
                      disabled={
                        model.busy ||
                        plugin.status === 'builtin' ||
                        plugin.status === 'unavailable' ||
                        !plugin.fields.length
                      }
                      onClick={() => dispatch({ type: 'template-export', id: plugin.pluginID })}
                    >
                      {text('导出模板 JSON…', 'Export template JSON…')}
                    </Button>
                  </div>
                  <ul>
                    {plugin.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                  <table>
                    <thead>
                      <tr>
                        <th>{text('字段／来源', 'Field / source')}</th>
                        <th>{text('支持范围', 'Support')}</th>
                        <th>{text('本机明确审核', 'Explicit local review')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plugin.fields.map((field) => {
                        const review = plugin.review.find((entry) => entry.key === field.key)!;
                        const disabled =
                          model.busy ||
                          !field.supported ||
                          plugin.status === 'builtin' ||
                          plugin.status === 'unavailable';
                        return (
                          <tr key={field.key}>
                            <td>
                              {field.label}
                              <br />
                              <code>{field.key}</code>
                              <br />
                              {field.source}
                              {field.requiresRestart && (
                                <p>{text('需要重启', 'Restart required')}</p>
                              )}
                            </td>
                            <td>
                              {field.supported
                                ? text('可审核', 'Reviewable')
                                : text('不支持（阻止）', 'Unsupported (blocked)')}
                              {field.reason && <p>{field.reason}</p>}
                            </td>
                            <td>
                              <label>
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={review.portable}
                                  onChange={(event) =>
                                    dispatch({
                                      type: 'review-field',
                                      pluginID: plugin.pluginID,
                                      key: field.key,
                                      portable: event.currentTarget.checked,
                                      secret: review.secret,
                                    })
                                  }
                                />
                                {text('纳入快照', 'Include in snapshots')}
                              </label>
                              <br />
                              <label>
                                <input
                                  type="checkbox"
                                  disabled={disabled || field.secret}
                                  checked={review.secret}
                                  onChange={(event) =>
                                    dispatch({
                                      type: 'review-field',
                                      pluginID: plugin.pluginID,
                                      key: field.key,
                                      portable: review.portable,
                                      secret: event.currentTarget.checked,
                                    })
                                  }
                                />
                                {text('敏感（仅允许加密）', 'Sensitive (encrypted only)')}
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              ))}
            </details>
          )}
        </div>
      );
    },
    initial,
  );
}
