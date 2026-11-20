// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ManagedSnapshotTarget } from '../../src/settings-snapshots/ports';
import type { SettingsSnapshotModel } from '../../src/settings-snapshots/react-model';
import { mountSettingsSnapshotsView } from '../../src/ui/react/surfaces/settings-snapshots';
import type { ReactView } from '../../src/ui/react/types';

const model: SettingsSnapshotModel = {
  chinese: true,
  title: '工作区同步与备份',
  container: 'json',
  plugins: [],
  catalogAvailable: true,
  managedAvailable: true,
  targets: [],
  locations: [{ libraryID: 1, label: '个人文库', personal: true, writable: true, collections: [] }],
  sources: [],
  sourceLibraryID: 1,
  targetForm: {
    adapterIDs: ['zotero-neo', 'zotero'],
    libraryID: 1,
    collectionID: null,
    title: '[Zotero-Neo] 工作区同步',
    container: 'json',
    autoUpdate: true,
    includeSecrets: false,
    includeLibrarySettings: false,
    editingID: null,
  },
  mode: 'export',
  exportFromReview: false,
  needsDiffRefresh: false,
  awaitingUnlock: false,
  reviewingConflict: false,
  canAdoptUnchanged: false,
  adapters: [
    { id: 'zotero-neo', label: 'Zotero Neo', selected: true },
    { id: 'zotero', label: 'Zotero', selected: true },
  ],
  includeSecrets: false,
  includeLibrarySettings: false,
  busy: false,
  status: '',
  error: false,
  sourceLabel: '',
  hasPreview: false,
  groups: [],
  issues: [],
  receipts: [],
  canApply: false,
  selectedCount: 0,
};

let current: ReactView<SettingsSnapshotModel> | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  document.body.replaceChildren();
});

function setup(overrides: Partial<SettingsSnapshotModel> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const dispatch = vi.fn();
  const view = mountSettingsSnapshotsView(root, { ...model, ...overrides }, dispatch);
  current = view;
  const button = (label: string, parent: ParentNode = root) =>
    Array.from<HTMLButtonElement>(parent.querySelectorAll<HTMLButtonElement>('button')).find(
      ({ textContent }) => textContent === label,
    )!;
  return { root, dispatch, view, button };
}

it('offers ordinary backup without a password, then reveals one uncontrolled password only on demand', async () => {
  const { root, view, dispatch, button } = setup();
  expect(root.querySelector('h2')?.textContent).toBe('工作区同步与备份');
  expect(root.querySelector('[data-neo-ui-part$="password"]')).toBeNull();
  const secrets = Array.from<HTMLLabelElement>(
    root.querySelectorAll<HTMLLabelElement>('label'),
  ).find((label) => label.textContent?.includes('包含 API 密钥等敏感凭据'))!;
  secrets.querySelector<HTMLInputElement>('input')!.click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'include-secrets', checked: true });
  view.update({ ...model, container: 'age', includeSecrets: true });
  expect(root.querySelectorAll('input[type="password"]')).toHaveLength(1);
  const input = root.querySelector<HTMLInputElement>('input[type="password"]')!;
  input.value = 'ephemeral-not-in-command';
  button('显示密码').click();
  await vi.waitFor(() => expect(input.type).toBe('text'));
  expect(input.value).toBe('ephemeral-not-in-command');
  button('隐藏密码').click();
  await vi.waitFor(() => expect(input.type).toBe('password'));
  expect(dispatch).toHaveBeenCalledOnce();
  expect(JSON.stringify(dispatch.mock.calls)).not.toContain(input.value);
});

it('restores directly and offers inline refresh without a separate confirmation control', () => {
  const preview: Partial<SettingsSnapshotModel> = {
    mode: 'import',
    sourceLabel: 'My backup',
    hasPreview: true,
    canApply: true,
    selectedCount: 1,
    groups: [
      {
        id: 'appearance',
        label: 'Appearance',
        selected: true,
        fields: [
          {
            id: 'theme',
            label: 'Theme',
            before: 'Light',
            after: 'Dark',
            selected: true,
            secret: false,
            requiresRestart: false,
            canMap: false,
          },
        ],
      },
    ],
  };
  const { view, dispatch, button } = setup(preview);
  expect(button('确认恢复')).toBeUndefined();
  button('恢复所选 1 项').click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'apply' });
  view.update({
    ...model,
    ...preview,
    needsDiffRefresh: true,
    hasPreview: false,
    groups: [],
    canApply: false,
  });
  button('刷新差异').click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'refresh-diff' });
});

it('keeps setup details collapsed and labels the immediate personal-library action', () => {
  const { root, dispatch, button } = setup({ mode: 'managed' });
  const custom = Array.from<HTMLElement>(root.querySelectorAll<HTMLElement>('summary')).find(
    ({ textContent }) => textContent === '更改存放位置与名称',
  )!;
  expect(custom.parentElement?.hasAttribute('open')).toBe(false);
  expect(root.querySelector('[data-neo-ui-part$="password"]')).toBeNull();
  expect(root.textContent).toContain('“我的文库”');
  button('开启文库同步').click();
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'target-create' });
});

it('places both guarded conflict actions at the target and identifies legacy single-plugin backups', () => {
  const oldTarget: ManagedSnapshotTarget = {
    id: 'legacy',
    title: 'Older backup',
    source: { libraryID: 1, itemKey: 'OLD12345', title: 'Older backup' },
    kind: 'legacy',
    adapterIDs: ['zotero'],
    collectionID: null,
    container: 'json',
    autoUpdate: false,
    includeSecrets: false,
    includeLibrarySettings: false,
    status: 'ready',
    message: '',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const target: ManagedSnapshotTarget = {
    ...oldTarget,
    id: 'workspace',
    title: 'Workspace',
    source: { libraryID: 1, itemKey: 'WORK1234', title: 'Workspace' },
    kind: 'workspace',
    adapterIDs: ['zotero', 'zotero-neo'],
    status: 'conflict',
    conflictRevision: 'observed-version',
  };
  const { root, dispatch, button } = setup({ mode: 'managed', targets: [target, oldTarget] });
  const row = Array.from<HTMLElement>(root.querySelectorAll<HTMLElement>('h4')).find(
    ({ textContent }) => textContent === 'Workspace',
  )!.parentElement!;
  expect(root.textContent).toContain('旧版单插件备份');
  expect(button('立即更新', row)).toBeUndefined();
  button('查看并应用云端改动', row).click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'target-preview', id: 'workspace' });
  button('以本机为准覆盖云端', row).click();
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'target-overwrite',
    id: 'workspace',
    revision: 'observed-version',
  });
});
