type Progress = (done: number, total: number) => void;

interface NativeTags {
  getName(id: number): string | false;
  removeFromLibrary(
    libraryID: number,
    ids: number | number[],
    onProgress?: Progress,
    types?: number | number[],
  ): Promise<unknown>;
  rename(libraryID: number, oldName: string, newName: string): Promise<unknown>;
  setColor(
    libraryID: number,
    name: string,
    color?: string | false,
    position?: number,
  ): Promise<unknown>;
}

const EDIT_ERROR = 'NeoManagedTagEditError';

function editError(): Error {
  const error = new Error('Neo-managed metadata cannot be edited as a business tag');
  error.name = EDIT_ERROR;
  return error;
}

export function isManagedTagEditError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === EDIT_ERROR;
}

/** Protects only reserved names at native bulk-write seams; all SDK reads remain unmodified. */
export function protectNativeTagMutations(isManaged: (name: string) => boolean): () => void {
  const tags = Zotero.Tags as unknown as NativeTags;
  const remove = tags.removeFromLibrary;
  const rename = tags.rename;
  const setColor = tags.setColor;
  let active = true;
  const managedID = (id: number): boolean => {
    const name = tags.getName(id);
    return typeof name === 'string' && isManaged(name);
  };
  const guardedRemove: NativeTags['removeFromLibrary'] = function (
    this: NativeTags,
    libraryID,
    ids,
    progress,
    types,
  ) {
    if (!active) return remove.call(this, libraryID, ids, progress, types);
    if (Array.isArray(ids)) {
      if (ids.some(managedID)) {
        const visible = ids.filter((id) => !managedID(id));
        if (!visible.length) return Promise.resolve();
        return remove.call(this, libraryID, visible, progress, types);
      }
    } else if (managedID(ids)) {
      return Promise.resolve();
    }
    return remove.call(this, libraryID, ids, progress, types);
  };
  const guardedRename: NativeTags['rename'] = function (
    this: NativeTags,
    libraryID,
    oldName,
    newName,
  ) {
    if (active && (isManaged(oldName.trim()) || isManaged(newName.trim()))) {
      return Promise.reject(editError());
    }
    return rename.call(this, libraryID, oldName, newName);
  };
  const guardedSetColor: NativeTags['setColor'] = function (
    this: NativeTags,
    libraryID,
    name,
    color,
    position,
  ) {
    if (active && isManaged(name.trim())) return Promise.reject(editError());
    return setColor.call(this, libraryID, name, color, position);
  };
  tags.removeFromLibrary = guardedRemove;
  tags.rename = guardedRename;
  tags.setColor = guardedSetColor;
  return () => {
    if (!active) return;
    active = false;
    if (tags.removeFromLibrary === guardedRemove) tags.removeFromLibrary = remove;
    if (tags.rename === guardedRename) tags.rename = rename;
    if (tags.setColor === guardedSetColor) tags.setColor = setColor;
  };
}
