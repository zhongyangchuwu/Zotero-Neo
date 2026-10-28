import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { ItemTargetSet } from '../../src/core/item-target';
import { ModuleHost } from '../../src/core/module-host';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import type { NavigationResult } from '../../src/navigation/types';
import { createWorkspaceModule, type WorkspaceModuleHost } from '../../src/modules/workspace';

function harness() {
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  const choosers: { open: boolean; options: PickerOpenOptions }[] = [];
  const status = vi.fn();
  const selectTab = vi.fn(() => true);
  const selectInLibrary = vi.fn<WorkspaceModuleHost['selectInLibrary']>(() => null);
  let onAcquire: (() => void) | undefined;
  const ports: WorkspaceModuleHost = {
    window: {
      Zotero_Tabs: {
        selectedID: 'b',
        _tabs: [
          { id: 'a', title: 'First' },
          { id: 'b', title: 'Second' },
        ],
      },
    } as unknown as MainWindow,
    logger,
    language: () => 'en',
    status,
    choose: (options) => {
      const chooser = { open: true, options };
      choosers.push(chooser);
      const acquire = onAcquire;
      onAcquire = undefined;
      acquire?.();
      return () => {
        chooser.open = false;
        options.onClose?.('retire');
      };
    },
    selectTab,
    cycleTab: () => true,
    closeTab: () => {},
    navigate: (_cause, _surface, move, isCurrent) => {
      if (isCurrent()) move();
    },
    selectInLibrary,
  };
  const workspace = createWorkspaceModule(host, ports);
  return {
    host,
    ports,
    workspace,
    choosers,
    status,
    selectTab,
    selectInLibrary,
    onAcquire(callback: () => void) {
      onAcquire = callback;
    },
  };
}

const candidate = { id: 'a', title: 'First', search: 'first' };
const targets = <S extends 'reader' | 'note'>(source: S, id: number): ItemTargetSet<S> => ({
  source,
  items: [{ id } as ItemTargetSet<S>['items'][number]],
  total: 1,
  missing: 0,
});

describe('Workspace module lifetimes', () => {
  it('uses an explicit tab source and rejects retired confirmation', async () => {
    const h = harness();
    h.workspace.switchTab('reader');
    const chooser = h.choosers[0]!;
    const rows = await chooser.options.source!.load();
    expect(rows.map(({ id, selected }) => ({ id, selected }))).toEqual([
      { id: 'a', selected: false },
      { id: 'b', selected: true },
    ]);
    h.host.dispose();
    await chooser.options.confirm!(candidate, false);
    expect(chooser.open).toBe(false);
    expect(h.selectTab).not.toHaveBeenCalled();
  });

  it('releases a late acquisition without closing its successor or admitting its confirmation', async () => {
    const h = harness();
    h.onAcquire(() => h.workspace.switchTab('note'));
    h.workspace.switchTab('main');
    const [old, successor] = h.choosers;
    expect(old!.open).toBe(false);
    expect(successor!.open).toBe(true);
    await old!.options.confirm!(candidate, false);
    await successor!.options.confirm!(candidate, false);
    expect(h.selectTab).toHaveBeenCalledTimes(1);
    h.host.dispose();
    expect(successor!.open).toBe(false);
  });

  it('keeps the admitted chooser usable when another open request is rejected', async () => {
    const h = harness();
    h.workspace.switchTab('reader');
    const chooser = h.choosers[0]!;
    vi.spyOn(h.ports, 'choose').mockReturnValueOnce(null);
    h.workspace.switchTab('main');
    await chooser.options.confirm!(candidate, false);
    expect(h.selectTab).toHaveBeenCalledOnce();
    h.host.dispose();
    expect(chooser.open).toBe(false);
  });

  it('releases an acquisition that arrives after retirement', async () => {
    const h = harness();
    h.onAcquire(() => h.host.dispose());
    h.workspace.switchTab('main');
    const chooser = h.choosers[0]!;
    await chooser.options.confirm!(candidate, false);
    expect(chooser.open).toBe(false);
    expect(h.selectTab).not.toHaveBeenCalled();
  });

  it('selects only supplied Reader and Note targets and rejects invalid cardinality', () => {
    const h = harness();
    h.workspace.showInLibrary(targets('reader', 11), 'reader');
    h.workspace.showInLibrary(targets('note', 22), 'note');
    expect(h.selectInLibrary.mock.calls.map(([id, surface]) => [id, surface])).toEqual([
      [11, 'reader'],
      [22, 'note'],
    ]);
    const valid = targets('reader', 33);
    for (const invalid of [
      { ...valid, missing: 1 },
      { ...valid, total: 2 },
      { ...valid, items: [] },
      { ...valid, items: [valid.items[0]!, valid.items[0]!] },
    ])
      h.workspace.showInLibrary(invalid, 'reader');
    expect(h.selectInLibrary).toHaveBeenCalledTimes(2);
  });

  it('does not present an old completion after a newer workflow or retirement', async () => {
    const h = harness();
    let finish!: (result: NavigationResult) => void;
    h.selectInLibrary.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    h.workspace.showInLibrary(targets('reader', 11), 'reader');
    h.workspace.showInLibrary(targets('note', 22), 'note');
    const statusCount = h.status.mock.calls.length;
    finish({ kind: 'completed', evidence: 'settled-change', recorded: true });
    await Promise.resolve();
    expect(h.status).toHaveBeenCalledTimes(statusCount);

    h.selectInLibrary.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    h.workspace.showInLibrary(targets('note', 23), 'note');
    h.host.dispose();
    finish({ kind: 'failed', error: new Error('late'), recorded: false });
    await Promise.resolve();
    expect(h.status).toHaveBeenCalledTimes(statusCount);
  });
});
