export interface ActionsTagsAction {
  readonly id: string;
  readonly label: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    Array.isArray(value)
  ) {
    return undefined;
  }
  return value as UnknownRecord;
}

function actionManager(): UnknownRecord | undefined {
  const zotero = record(Reflect.get(globalThis, 'Zotero'));
  const actionsTags = record(zotero?.ActionsTags);
  if (record(actionsTags?.data)?.alive === false) return undefined;
  const api = record(actionsTags?.api);
  return record(api?.actionManager);
}

function nonemptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Projects enabled actions without transferring ownership of their configuration. */
export function listActionsTagsActions(): readonly ActionsTagsAction[] {
  try {
    const manager = actionManager();
    const getActions = manager?.getActions;
    if (
      !manager ||
      typeof getActions !== 'function' ||
      typeof manager.dispatchActionByKey !== 'function'
    )
      return [];
    const actions = record(getActions.call(manager));
    if (!actions) return [];
    const result: ActionsTagsAction[] = [];
    for (const [id, value] of Object.entries(actions)) {
      const action = record(value);
      if (!action || action.enabled !== true) continue;
      const label = nonemptyString(action.name) ?? nonemptyString(action.menu);
      if (id && label !== undefined) result.push({ id, label });
    }
    return result;
  } catch {
    // A missing or incompatible optional plugin must not prevent the Neo palette opening.
    return [];
  }
}

export async function runActionsTagsAction(
  id: string,
  itemIDs: readonly number[],
): Promise<boolean> {
  const manager = actionManager();
  const getActions = manager?.getActions;
  const dispatchActionByKey = manager?.dispatchActionByKey;
  if (!manager || typeof getActions !== 'function' || typeof dispatchActionByKey !== 'function') {
    return false;
  }

  const action = record(getActions.call(manager, id));
  if (!action || action.enabled !== true) return false;

  const selectedItemIDs = [...itemIDs];
  await dispatchActionByKey.call(manager, id, {
    itemIDs: [...selectedItemIDs],
    triggerType: 'menu',
  });
  for (const itemID of selectedItemIDs) {
    await dispatchActionByKey.call(manager, id, { itemID, triggerType: 'menu' });
  }
  return true;
}
