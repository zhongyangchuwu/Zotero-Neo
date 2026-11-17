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
          <p className="neo-muted">
            {text(
              '每个插件单独管理。只包含已支持和审核的设置，不含插件安装包、文库、文献或账号会话。模板仅含字段定义，绝不包含设置值。',
              'Manage each plugin separately. Only supported, reviewed settings are included, not plugin packages, libraries, documents or account sessions. Templates contain field definitions, never settings values.',
            )}
          </p>
          <div className="neo-snapshot-toolbar">
            <Button
              disabled={model.busy || model.mode === 'export'}
              onClick={() => dispatch({ type: 'mode', value: 'export' })}
            >
              {text('保存与导出', 'Save and export')}
            </Button>
            <Button
              disabled={model.busy || model.mode === 'import'}
              onClick={() => dispatch({ type: 'mode', value: 'import' })}
            >
              {text('导入与恢复', 'Import and restore')}
            </Button>
            {(model.catalogAvailable || model.managedAvailable) && (
              <Button disabled={model.busy} onClick={() => dispatch({ type: 'refresh' })}>
                {text('刷新', 'Refresh')}
              </Button>
            )}
            <Button disabled={!model.busy} onClick={() => dispatch({ type: 'stop' })}>
              {text('停止', 'Stop')}
            </Button>
            <Button data-neo-ui-part="close" onClick={() => dispatch({ type: 'close' })}>
              {text('关闭', 'Close')}
            </Button>
          </div>
          {model.catalogAvailable && (
            <details>
              <summary>{text('插件模板与支持范围', 'Plugin templates and coverage')}</summary>
              <p>
                {text(
                  '扫描只读取静态偏好界面标记，不运行插件代码。草稿不能证明全部支持；请逐字段审核便携性与敏感性。',
                  'Scanning reads inert preference markup without executing plugin code. A draft is not proof of complete support; review portability and sensitivity field by field.',
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
                                {text('便携，可纳入快照', 'Portable; include in snapshots')}
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
          {model.mode === 'export' ? (
            <>
              <fieldset disabled={model.busy}>
                <legend>{text('快照容器', 'Snapshot container')}</legend>
                <select
                  aria-label={text('快照容器', 'Snapshot container')}
                  value={model.container}
                  onChange={(event) =>
                    dispatch({
                      type: 'container',
                      value: event.currentTarget.value === 'json' ? 'json' : 'age',
                    })
                  }
                >
                  <option value="age">{text('age 加密（默认）', 'age encrypted (default)')}</option>
                  <option value="json">
                    {text(
                      'JSON 明文（排除所有已知秘密）',
                      'JSON plaintext (excludes all known secrets)',
                    )}
                  </option>
                </select>
                <p>
                  <label>
                    <input
                      type="checkbox"
                      disabled={model.container !== 'age'}
                      checked={model.includeSecrets}
                      onChange={(event) =>
                        dispatch({ type: 'include-secrets', checked: event.currentTarget.checked })
                      }
                    />
                    {text(
                      '额外授权：包含受支持的密码与 API 凭据（仅加密）',
                      'Additional consent: include supported passwords and API credentials (encrypted only)',
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
                      '额外授权：包含已由 Zotero 同步的库级设置；恢复必须匹配库身份',
                      'Additional consent: include library settings already synced by Zotero; restore must match library identity',
                    )}
                  </label>
                </p>
              </fieldset>
              <div className="neo-snapshot-toolbar">
                <label>
                  {text('文件密码', 'File password')}{' '}
                  <input
                    data-neo-ui-part="export-password"
                    type="password"
                    autoComplete="new-password"
                    disabled={model.busy || model.container !== 'age'}
                  />
                </label>
                <label>
                  {text('确认密码', 'Confirm password')}{' '}
                  <input
                    data-neo-ui-part="export-confirm"
                    type="password"
                    autoComplete="new-password"
                    disabled={model.busy || model.container !== 'age'}
                  />
                </label>
              </div>
              <fieldset disabled={model.busy}>
                <legend>
                  {text('每插件导出／选择合并', 'Per-plugin export / combined selection')}
                </legend>
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
                    <Button onClick={() => dispatch({ type: 'plugin-export', id: adapter.id })}>
                      {text('仅导出此插件…', 'Export this plugin only…')}
                    </Button>
                  </div>
                ))}
                <Button
                  primary
                  disabled={!model.adapters.some((adapter) => adapter.selected)}
                  onClick={() => dispatch({ type: 'export' })}
                >
                  {text('导出所选插件合并快照…', 'Export combined snapshot of selected plugins…')}
                </Button>
              </fieldset>
              <p className="neo-muted">
                {text(
                  'age 使用标准密码加密；密码遗失无法恢复，约需 256 MiB 内存。JSON 不加密且绝不包含本机已知秘密。密码不保存。',
                  'age uses standard passphrase encryption; a lost password cannot be recovered and derivation needs about 256 MiB memory. JSON is unencrypted and never includes locally known secrets. Passwords are not saved.',
                )}
              </p>
            </>
          ) : (
            <>
              <div className="neo-snapshot-toolbar">
                <Button disabled={model.busy} onClick={() => dispatch({ type: 'choose-file' })}>
                  {text('选择快照文件…', 'Choose snapshot file…')}
                </Button>
                <label>
                  {text('来源密码（仅 age）', 'Source password (age only)')}{' '}
                  <input
                    data-neo-ui-part="import-password"
                    type="password"
                    autoComplete="off"
                    disabled={model.busy}
                  />
                </label>
                <label>
                  {text(
                    '恢复前加密备份密码（始终必填）',
                    'Encrypted pre-restore backup password (always required)',
                  )}{' '}
                  <input
                    data-neo-ui-part="backup-password"
                    type="password"
                    autoComplete="new-password"
                    disabled={model.busy}
                  />
                </label>
                <Button
                  disabled={model.busy || !model.sourcePath}
                  onClick={() => dispatch({ type: 'inspect' })}
                >
                  {text('读取并预览', 'Read and preview')}
                </Button>
              </div>
              <p className="neo-snapshot-path">
                {model.sourcePath}
                {model.sourceContainer && ` · ${model.sourceContainer}`}
              </p>
              <p className="neo-muted">
                {text(
                  '根据内容识别 JSON 或 age，不根据扩展名。预览不会写配置。即使导入明文，也必须提供独立备份密码；密码只留在本次操作内存，结束或关闭后释放。',
                  'JSON or age is detected from contents, not the extension. Preview never writes settings. Even plaintext imports require an independent backup password, held only in operation memory and released on completion or close.',
                )}
              </p>
              {!!model.groups.length && (
                <>
                  <Button disabled={model.busy} onClick={() => dispatch({ type: 'choose-backup' })}>
                    {text('选择加密备份位置…', 'Choose encrypted backup destination…')}
                  </Button>
                  <p className="neo-snapshot-path">
                    {text('恢复前备份：', 'Pre-restore backup: ')}
                    {model.backupPath || text('请先选择位置', 'Choose a destination first')}
                  </p>
                  <p className="neo-muted">
                    {text(
                      '先保存并读回加密备份，再逐项写入；不是跨插件原子事务。停止或部分失败不会撤销已接纳的修改。恢复前会重新读取来源并检查配置是否已变更。',
                      'The encrypted backup is saved and read back before any setting is written. This is not atomic across plugins; stop or partial failure does not undo admitted writes. Source contents and current settings are rechecked before restore.',
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
                          '选择此类别所有可恢复项（含秘密）',
                          'Select all restorable fields in this category (including secrets)',
                        )}
                      </label>
                      <table>
                        <thead>
                          <tr>
                            <th>{text('恢复项', 'Restore setting')}</th>
                            <th>{text('当前值', 'Current value')}</th>
                            <th>{text('来源值／映射值', 'Source / mapped value')}</th>
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
          {model.managedAvailable && (
            <details>
              <summary>
                {text('Zotero 附件托管与同步来源', 'Managed Zotero attachments and sync sources')}
              </summary>
              <p>
                {text(
                  '明确选择后才创建可见附件。同步依赖 Zotero 原生数据同步和文件同步，本功能不配置同步。自动更新只发布本机设置，绝不自动应用下载配置。外部修改、删除或只读会暂停，不覆盖、不自动重建。加密快照永不自动更新。',
                  'Only explicit opt-in creates a visible attachment. Sync depends on native Zotero data and file sync, which this feature does not configure. Auto-update only publishes local settings; it never applies downloaded settings. External modification, deletion or read-only status pauses updates without overwrite or recreation. Encrypted snapshots never auto-update.',
                )}
              </p>
              <fieldset disabled={model.busy}>
                <legend>
                  {form.editingID
                    ? text('配置本机绑定', 'Configure local binding')
                    : text('创建单插件托管快照', 'Create a managed single-plugin snapshot')}
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
                    {text('容器', 'Container')}{' '}
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
                      <option value="age">{text('age 加密', 'age encrypted')}</option>
                      <option value="json">
                        {text('JSON 明文（无秘密）', 'JSON plaintext (no secrets)')}
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
                    {text('自动发布本机变更（仅 JSON）', 'Auto-publish local changes (JSON only)')}
                  </label>
                </div>
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
                      '额外授权：此目标包含已支持的秘密（仅加密）',
                      'Additional consent: include supported secrets in this target (encrypted only)',
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
                      '额外授权：此目标包含已同步的库级设置',
                      'Additional consent: include synced library settings in this target',
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
                        '我同意创建可见附件，并理解原生数据／文件同步依赖及所选导出范围。',
                        'I consent to a visible attachment and understand native data/file sync dependencies and the selected export scope.',
                      )}
                    </label>
                  </p>
                )}
                <p>
                  {text(
                    'JSON 始终排除秘密。已存在目标保留创建时的授权范围。',
                    'JSON always excludes secrets. Existing targets retain their creation scope.',
                  )}
                </p>
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
                    ? text('保存绑定配置', 'Save binding configuration')
                    : text('创建并保存此插件快照', 'Create and save this plugin snapshot')}
                </Button>
                {form.editingID && (
                  <Button onClick={() => dispatch({ type: 'target-cancel' })}>
                    {text('取消编辑', 'Cancel editing')}
                  </Button>
                )}
              </fieldset>
              <label>
                {text(
                  '本次创建／手动更新密码（仅 age，不保存）',
                  'Password for this create / manual update (age only, never saved)',
                )}{' '}
                <input
                  data-neo-ui-part="managed-password"
                  type="password"
                  autoComplete="off"
                  disabled={model.busy}
                />
              </label>
              {model.targets.map((target) => (
                <section key={target.id}>
                  <h4>
                    {target.title} · {target.adapterID} · {target.container}
                  </h4>
                  <p>
                    {target.status} · {target.message} · {target.updatedAt} ·{' '}
                    {target.autoUpdate
                      ? text('自动发布', 'Auto-publish')
                      : text('仅手动', 'Manual only')}
                  </p>
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
                      {text('忘记本机绑定（保留附件）', 'Forget local binding (keep attachment)')}
                    </Button>
                  </div>
                </section>
              ))}
              <h3>{text('选择恢复来源', 'Choose restore source')}</h3>
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
                      {source.title} · {source.itemKey} — {text('选择来源…', 'Select source…')}
                    </Button>
                  </li>
                ))}
              </ul>
              {!model.sources.length && (
                <p>
                  {text(
                    '此文库暂无可用快照附件。',
                    'No snapshot attachments available in this library.',
                  )}
                </p>
              )}
            </details>
          )}
          <Status error={model.error}>{model.status}</Status>
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
              <p className="neo-snapshot-path">{model.backupPath}</p>
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
