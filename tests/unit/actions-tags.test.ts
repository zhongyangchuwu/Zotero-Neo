import { afterEach, describe, expect, it, vi } from 'vitest';

import { listActionsTagsActions, runActionsTagsAction } from '../../src/platform/actions-tags';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

type DispatchArgs = {
  itemIDs?: number[];
  itemID?: number;
  triggerType: 'menu';
};

function installActionsTags(actions: Record<string, unknown>) {
  const getActions = vi.fn((id?: string) => (id === undefined ? actions : actions[id]));
  const dispatchActionByKey = vi.fn(async (_id: string, _args: DispatchArgs) => {});
  vi.stubGlobal('Zotero', {
    ActionsTags: {
      api: {
        actionManager: { getActions, dispatchActionByKey },
      },
    },
  });
  return { getActions, dispatchActionByKey };
}

describe('Actions & Tags runtime adapter', () => {
  it('recognizes Zotero when the host global is a callable object', async () => {
    const manager = {
      getActions: (id?: string) =>
        id
          ? { enabled: true, name: 'Reader tag' }
          : { test: { enabled: true, name: 'Reader tag' } },
      dispatchActionByKey: vi.fn(async () => {}),
    };
    vi.stubGlobal(
      'Zotero',
      Object.assign(function Zotero() {}, {
        ActionsTags: { data: { alive: true }, api: { actionManager: manager } },
      }),
    );
    expect(listActionsTagsActions()).toEqual([{ id: 'test', label: 'Reader tag' }]);
    await expect(runActionsTagsAction('test', [8])).resolves.toBe(true);
    expect(manager.dispatchActionByKey).toHaveBeenCalledTimes(2);
  });

  it('lists enabled named actions and uses menu only when a name is absent', () => {
    installActionsTags({
      named: { enabled: true, name: 'Named action', menu: 'Menu label' },
      menuOnly: { enabled: true, menu: 'Menu-only action' },
      disabled: { enabled: false, name: 'Disabled action' },
      blank: { enabled: true, name: '  ', menu: '\t' },
      malformed: null,
    });

    expect(listActionsTagsActions()).toEqual([
      { id: 'named', label: 'Named action' },
      { id: 'menuOnly', label: 'Menu-only action' },
    ]);
  });

  it('returns no actions and does not dispatch when the plugin is absent or incompatible', async () => {
    vi.stubGlobal('Zotero', {});
    expect(listActionsTagsActions()).toEqual([]);
    await expect(runActionsTagsAction('action', [1])).resolves.toBe(false);

    vi.stubGlobal('Zotero', {
      ActionsTags: { api: { actionManager: { getActions: vi.fn(() => null) } } },
    });
    expect(listActionsTagsActions()).toEqual([]);
    await expect(runActionsTagsAction('action', [1])).resolves.toBe(false);
  });

  it('does not dispatch an action that is disabled or has been removed', async () => {
    const actions: Record<string, unknown> = {
      disabled: { enabled: false },
      removed: { enabled: true },
    };
    const { dispatchActionByKey } = installActionsTags(actions);

    await expect(runActionsTagsAction('disabled', [1])).resolves.toBe(false);
    delete actions.removed;
    await expect(runActionsTagsAction('removed', [1])).resolves.toBe(false);
    expect(dispatchActionByKey).not.toHaveBeenCalled();
  });

  it('dispatches the copied selection as a batch, then each item in order', async () => {
    const { dispatchActionByKey, getActions } = installActionsTags({
      action: { enabled: true },
    });
    const itemIDs = [8, 3, 21];

    await expect(runActionsTagsAction('action', itemIDs)).resolves.toBe(true);

    expect(getActions).toHaveBeenCalledWith('action');
    expect(dispatchActionByKey).toHaveBeenNthCalledWith(1, 'action', {
      itemIDs: [8, 3, 21],
      triggerType: 'menu',
    });
    expect(dispatchActionByKey.mock.calls[0]?.[1].itemIDs).not.toBe(itemIDs);
    expect(dispatchActionByKey).toHaveBeenNthCalledWith(2, 'action', {
      itemID: 8,
      triggerType: 'menu',
    });
    expect(dispatchActionByKey).toHaveBeenNthCalledWith(3, 'action', {
      itemID: 3,
      triggerType: 'menu',
    });
    expect(dispatchActionByKey).toHaveBeenNthCalledWith(4, 'action', {
      itemID: 21,
      triggerType: 'menu',
    });
  });

  it('still dispatches an empty batch for zero targets', async () => {
    const { dispatchActionByKey } = installActionsTags({
      action: { enabled: true },
    });

    await expect(runActionsTagsAction('action', [])).resolves.toBe(true);

    expect(dispatchActionByKey).toHaveBeenCalledOnce();
    expect(dispatchActionByKey).toHaveBeenCalledWith('action', {
      itemIDs: [],
      triggerType: 'menu',
    });
  });

  it('rejects when an upstream dispatch rejects and stops before item dispatch', async () => {
    const { dispatchActionByKey } = installActionsTags({
      action: { enabled: true },
    });
    dispatchActionByKey.mockRejectedValueOnce(new Error('dispatch failed'));

    await expect(runActionsTagsAction('action', [8, 3])).rejects.toThrow('dispatch failed');
    expect(dispatchActionByKey).toHaveBeenCalledOnce();
  });
});
