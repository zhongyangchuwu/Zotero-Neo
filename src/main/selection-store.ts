export interface ItemRef {
  readonly libraryID: number;
  readonly itemID: number;
}

function keyOf(ref: ItemRef): string {
  return `${ref.libraryID}:${ref.itemID}`;
}

function validRef(ref: ItemRef): boolean {
  return (
    Number.isInteger(ref.libraryID) &&
    ref.libraryID > 0 &&
    Number.isInteger(ref.itemID) &&
    ref.itemID > 0
  );
}

/**
 * Session-scoped explicit Library workset.
 *
 * Zotero remains authoritative for Item data. This store owns only stable
 * identities so a workset can survive row reordering and temporary invisibility
 * in the current item tree.
 */
export class SelectionStore {
  readonly #items = new Map<string, ItemRef>();

  get size(): number {
    return this.#items.size;
  }

  get empty(): boolean {
    return this.#items.size === 0;
  }

  has(ref: ItemRef): boolean {
    return this.#items.has(keyOf(ref));
  }

  values(): readonly ItemRef[] {
    return [...this.#items.values()];
  }

  add(ref: ItemRef): boolean {
    if (!validRef(ref)) return false;
    const key = keyOf(ref);
    if (this.#items.has(key)) return false;
    this.#items.set(key, { libraryID: ref.libraryID, itemID: ref.itemID });
    return true;
  }

  remove(ref: ItemRef): boolean {
    return this.#items.delete(keyOf(ref));
  }

  clear(): boolean {
    if (!this.#items.size) return false;
    this.#items.clear();
    return true;
  }

  toggle(ref: ItemRef): boolean {
    if (this.has(ref)) {
      this.remove(ref);
      return false;
    }
    this.add(ref);
    return this.has(ref);
  }

  /**
   * Toggle one logical target using the v0.2 all-or-none rule:
   * remove the target only when every valid member is already selected;
   * otherwise add every valid member.
   */
  toggleTarget(refs: readonly ItemRef[]): 'added' | 'removed' | 'unchanged' {
    const target = new Map<string, ItemRef>();
    for (const ref of refs) {
      if (validRef(ref)) target.set(keyOf(ref), ref);
    }
    if (!target.size) return 'unchanged';

    const allSelected = [...target.values()].every((ref) => this.has(ref));
    if (allSelected) {
      for (const ref of target.values()) this.remove(ref);
      return 'removed';
    }

    for (const ref of target.values()) this.add(ref);
    return 'added';
  }
}
