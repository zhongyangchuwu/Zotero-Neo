export interface ItemExtraRecovery {
  saved(): void;
  restore(extra: string): void;
}

// Native Zotero 10.0.8/10.0.9: Item.setField() cannot set clientVersion.
// DataObject._finalizeSave() assigns it directly; Item._finalizeSave() reloads
// primaryData (including group attribution) and itemData, clearing their logs.
// Keep this version-sensitive seam here, never in the domain operation.
const PRIMARY_FIELDS = ['dateModified', 'synced', 'clientVersion', 'lastModifiedByUserID'] as const;
type PrimaryField = (typeof PRIMARY_FIELDS)[number];
type NativeRecord = Record<string, unknown>;
type NativeState = {
  readonly item: NativeRecord;
  readonly itemData: NativeRecord;
  readonly changed: NativeRecord;
  readonly previous: NativeRecord;
  readonly extraID: string;
};

function unsupported(): never {
  throw new Error('Native item Extra recovery is unavailable; attribute editing is unsupported');
}

function writableRecord(value: unknown): NativeRecord {
  if (
    !value ||
    Object.prototype.toString.call(value) !== '[object Object]' ||
    !Object.isExtensible(value)
  )
    return unsupported();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor) || !descriptor.writable || !descriptor.configurable)
      return unsupported();
  }
  return value as NativeRecord;
}

function ownValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !('value' in descriptor) || !descriptor.writable) return unsupported();
  return descriptor.value;
}

function changeGroup(state: NativeState, type: string): NativeRecord | undefined {
  const group = state.changed[type];
  if (group === undefined) return undefined;
  const record = writableRecord(group);
  if (Object.values(record).some((value) => value !== true)) return unsupported();
  return record;
}

function nativeState(item: Zotero.Item): NativeState {
  const native = item as unknown as NativeRecord;
  const id = Number(Zotero.ItemFields?.getID('extra'));
  if (!Number.isSafeInteger(id) || id <= 0 || Zotero.ItemFields.getName(id) !== 'extra')
    return unsupported();
  const loaded = ownValue(native, '_loaded') as NativeRecord | null;
  if (!loaded || loaded.primaryData !== true || loaded.itemData !== true) return unsupported();
  const state: NativeState = {
    item: native,
    itemData: writableRecord(ownValue(native, '_itemData')),
    changed: writableRecord(ownValue(native, '_changed')),
    previous: writableRecord(ownValue(native, '_previousData')),
    extraID: String(id),
  };
  const changedData = writableRecord(ownValue(native, '_changedData'));
  const raw = ownValue(state.itemData, state.extraID);
  if ((typeof raw !== 'string' && raw !== false) || item.getField('extra') !== (raw || ''))
    return unsupported();
  changeGroup(state, 'itemData');
  changeGroup(state, 'primaryData');
  for (const field of PRIMARY_FIELDS) {
    const value = ownValue(native, `_${field}`);
    if (
      (field === 'dateModified' && typeof value !== 'string') ||
      (field === 'synced' && typeof value !== 'boolean') ||
      (field === 'clientVersion' && (!Number.isSafeInteger(value) || Number(value) < 0)) ||
      (field === 'lastModifiedByUserID' && value !== null && !Number.isSafeInteger(value)) ||
      Object.hasOwn(changedData, field)
    )
      return unsupported();
    if (item.getField(field) !== value) return unsupported();
  }
  if (Object.hasOwn(changedData, 'extra')) return unsupported();
  return state;
}

function clearChange(state: NativeState, type: string, field: string, name: string): void {
  const group = changeGroup(state, type);
  if (group) {
    delete group[field];
    // An empty group still makes native hasChanged() return true.
    if (!Object.keys(group).length) delete state.changed[type];
  }
  delete state.previous[name];
}

/** Capture a clean native item before any owned mutation, or refuse admission. */
export function captureItemExtraRecovery(item: Zotero.Item): ItemExtraRecovery {
  const before = nativeState(item);
  if (item.hasChanged()) throw new Error('Native item has pending changes');
  const extra = before.itemData[before.extraID];
  const primary = new Map(PRIMARY_FIELDS.map((field) => [field, before.item[`_${field}`]]));
  const initialPrimary = { ...changeGroup(before, 'primaryData') };
  const initialPrevious = new Map(
    PRIMARY_FIELDS.filter((field) => Object.hasOwn(before.previous, field)).map((field) => [
      field,
      before.previous[field],
    ]),
  );
  let savedPrimary: ReadonlyMap<PrimaryField, unknown> | undefined;

  return {
    saved() {
      const state = nativeState(item);
      savedPrimary = new Map(PRIMARY_FIELDS.map((field) => [field, state.item[`_${field}`]]));
    },
    restore(desiredExtra) {
      const state = nativeState(item);
      // The caller merges by owned key. Bypass normalization only to restore the
      // exact cache bytes, including unrelated edits made while save was pending.
      state.itemData[state.extraID] = desiredExtra || false;
      if (desiredExtra === (extra || '')) {
        clearChange(state, 'itemData', state.extraID, 'extra');
      } else {
        const changed = changeGroup(state, 'itemData') ?? (state.changed.itemData = {});
        (changed as NativeRecord)[state.extraID] = true;
        state.previous.extra = extra;
      }

      for (const field of PRIMARY_FIELDS) {
        const group = changeGroup(state, 'primaryData');
        const current = state.item[`_${field}`];
        const original = primary.get(field);
        // A subsequent public setter owns its marker even if the value happens
        // to equal the post-save value. Rebase its old value onto rolled-back SQL.
        if (group?.[field] && !(initialPrimary[field] && current === original)) {
          state.previous[field] = original;
          continue;
        }
        if (savedPrimary && current === savedPrimary.get(field)) {
          state.item[`_${field}`] = original;
          clearChange(state, 'primaryData', field, field);
          if (initialPrimary[field]) {
            const changed = changeGroup(state, 'primaryData') ?? (state.changed.primaryData = {});
            (changed as NativeRecord)[field] = true;
          }
          if (initialPrevious.has(field)) state.previous[field] = initialPrevious.get(field);
        }
      }
    },
  };
}
