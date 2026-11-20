// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ManagedSnapshotTarget } from '../../src/settings-snapshots/ports';
import type {
  SettingsSnapshotExtensionRow,
  SettingsSnapshotModel,
} from '../../src/settings-snapshots/react-model';
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
  expect(root.textContent).toContain('Neo 备份包含快捷键和偏好设置');
  expect(root.textContent).not.toContain('自定义属性定义');
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
  expect(button('备份当前设置…').disabled).toBe(false);
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

it('shows a single backup inventory summary only when its count is known', () => {
  const { root, view } = setup({ chinese: false });
  expect(root.textContent).not.toContain('Third-party extensions included');
  view.update({ ...model, chinese: false, extensionCount: 3 });
  expect(root.textContent?.match(/Third-party extensions included: 3/g)).toHaveLength(1);
  view.update({ ...model, chinese: false, extensionCount: 0 });
  expect(root.textContent).toContain('Third-party extensions included: 0');
});

it('previews extension-only changes with one restore action and one restart notice', () => {
  const preview: Partial<SettingsSnapshotModel> = {
    chinese: false,
    mode: 'import',
    hasPreview: true,
    canApply: true,
    selectedCount: 2,
    extensionRestart: true,
    extensionDiff: {
      sameCount: 3,
      rows: [
        {
          id: 'direct',
          name: 'Direct add-on',
          version: '1.2',
          status: 'install',
          toEnabled: true,
          source: 'https://example.org/direct.xpi',
          checked: true,
          canReplace: true,
          message: 'Previous download failed.',
        },
        {
          id: 'local',
          name: 'Local add-on',
          version: '2.0',
          status: 'state',
          fromEnabled: true,
          toEnabled: false,
          checked: true,
        },
        {
          id: 'missing',
          name: 'Manual add-on',
          version: '3.1',
          status: 'missing',
          toEnabled: true,
          checked: false,
        },
        {
          id: 'blocked',
          name: 'Blocked add-on',
          version: '4.0',
          status: 'blocked',
          toEnabled: true,
          checked: false,
          message: 'Zotero does not allow this change.',
        },
      ],
    },
  };
  const { root, dispatch, button, view } = setup(preview);
  expect(root.textContent).toContain('Extensions contain executable code');
  expect(root.textContent).toContain('Source: https://example.org/direct.xpi');
  expect(root.textContent).toContain('Previous download failed.');
  expect(root.textContent).toContain('Enabled → Disabled');
  expect(root.textContent).toContain('Zotero does not allow this change.');
  expect(root.textContent?.match(/Extensions already matching: 3/g)).toHaveLength(1);
  expect(
    root.textContent?.match(/Restart Zotero to finish applying extension changes/g),
  ).toHaveLength(1);
  const checkboxes = Array.from(
    root.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
  expect(
    checkboxes.map(({ labels, checked, disabled }) => [
      labels?.[0]?.textContent?.trim(),
      checked,
      disabled,
    ]),
  ).toEqual([
    ['Direct add-on 1.2', true, false],
    ['Local add-on 2.0', true, false],
    ['Manual add-on 3.1', false, true],
    ['Blocked add-on 4.0', false, true],
  ]);
  checkboxes[1]!.click();
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'extension-toggle',
    id: 'local',
    checked: false,
  });
  button('Replace source…').click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'extension-source-open', id: 'direct' });
  expect(button('Back up current settings…')).toBeUndefined();
  expect(
    (Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]).filter(({ textContent }) =>
      textContent?.startsWith('Restore 2'),
    ),
  ).toHaveLength(1);
  button('Restore 2 selected changes').click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'apply' });

  view.update({
    ...model,
    ...preview,
    groups: [
      {
        id: 'direct-preferences',
        label: 'Direct add-on',
        selected: true,
        fields: [
          {
            id: 'mode',
            label: 'Mode',
            before: 'Read during restore',
            after: 'Backup value (verified against the local add-on)',
            selected: true,
            secret: false,
            requiresRestart: false,
            canMap: false,
          },
        ],
      },
    ],
    selectedCount: 3,
    canBackUpCurrent: false,
  });
  expect(root.textContent).toContain('Read during restore');
  expect(button('Back up current settings…')).toBeUndefined();
  expect(button('Restore 3 selected changes').disabled).toBe(false);
});

it('repairs a missing source in its row, preserving input during IME and candidate selection', () => {
  const missing: SettingsSnapshotExtensionRow = {
    id: 'manual',
    name: 'Manual add-on',
    version: '2.0',
    status: 'missing',
    toEnabled: true,
    checked: false,
    canReplace: true,
  };
  const preview: Partial<SettingsSnapshotModel> = {
    chinese: false,
    mode: 'import',
    hasPreview: true,
    extensionDiff: { rows: [missing], sameCount: 0 },
  };
  const { root, view, dispatch, button } = setup(preview);
  const row = button('Add source…').parentElement!;
  button('Add source…').click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'extension-source-open', id: 'manual' });
  const editing = { ...missing, addingSource: true };
  view.update({ ...model, ...preview, extensionDiff: { rows: [editing], sameCount: 0 } });

  const input = row.querySelector<HTMLInputElement>('form input[type="text"]')!;
  expect(input.labels?.[0]?.textContent).toContain('GitHub repository or .xpi link');
  const source = 'https://github.com/example/manual';
  input.value = source;
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  input.form!.requestSubmit();
  expect(dispatch).toHaveBeenCalledTimes(1);
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  expect(input.value).toBe(source);
  button('Find extension', row).click();
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'extension-source-lookup',
    id: 'manual',
    value: source,
  });

  const candidates = [
    { name: 'Manual add-on', version: '2.0', source: 'https://example.org/manual.xpi' },
    { name: 'Manual add-on alternative', source: 'https://example.org/other.xpi' },
  ];
  view.update({
    ...model,
    ...preview,
    extensionDiff: { rows: [{ ...editing, candidates }], sameCount: 0 },
  });
  expect(input.value).toBe(source);
  const selection = row.querySelector<HTMLSelectElement>('select')!;
  expect(selection.labels?.[0]?.textContent).toContain('Choose an .xpi package');
  expect(
    (Array.from(selection.options) as HTMLOptionElement[]).map((option) => option.text),
  ).toEqual([
    'Select a package',
    'Manual add-on (2.0) — https://example.org/manual.xpi',
    'Manual add-on alternative — https://example.org/other.xpi',
  ]);
  selection.value = '1';
  button('Use this package', row).click();
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'extension-source-choose',
    id: 'manual',
    index: 1,
  });
  button('Cancel', row).click();
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'extension-source-close', id: 'manual' });

  view.update({
    ...model,
    ...preview,
    extensionDiff: {
      rows: [{ ...missing, status: 'install', source: candidates[1]!.source }],
      sameCount: 0,
    },
  });
  expect(root.querySelector('form')).toBeNull();
  expect(row.textContent).toContain('Source: https://example.org/other.xpi');
  const restored = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(restored.disabled).toBe(false);
  expect(restored.checked).toBe(false);
  restored.click();
  expect(dispatch).toHaveBeenLastCalledWith({
    type: 'extension-toggle',
    id: 'manual',
    checked: true,
  });
});

it('opens the preferred library attachment directly and leaves alternatives collapsed', () => {
  const preferred = { libraryID: 1, itemKey: 'WORK1234', title: 'Workspace backup' };
  const other = { libraryID: 1, itemKey: 'OLD12345', title: 'Earlier backup' };
  const { root, dispatch, button } = setup({
    chinese: false,
    mode: 'import',
    preferredLibrarySource: preferred,
    sources: [preferred, other],
  });
  const details = (Array.from(root.querySelectorAll('summary')) as HTMLElement[]).find(
    ({ textContent }) => textContent === 'Restore an existing library backup',
  )!.parentElement!;
  const direct = button('Preview library backup: Workspace backup');
  expect(details.contains(direct)).toBe(false);
  expect(details.hasAttribute('open')).toBe(false);
  expect(button(preferred.title, details)).toBeUndefined();
  expect(button(other.title, details)).toBeDefined();
  direct.click();
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({
    type: 'source',
    libraryID: preferred.libraryID,
    itemKey: preferred.itemKey,
  });
});
