export interface ItemRef {
  readonly libraryID: number;
  readonly itemID: number;
}

export function itemRef(item: Pick<Zotero.Item, 'id' | 'libraryID'>): ItemRef {
  return { libraryID: item.libraryID, itemID: item.id };
}

export function itemRefKey(ref: ItemRef): string {
  return `${ref.libraryID}:${ref.itemID}`;
}

/**
 * Session-scoped explicit workset for Main-library actions.
 *
 * Zotero remains authoritative for Item data. This store keeps only stable identities so the
 * workset can survive row reordering and members becoming hidden by the current View.
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
    return this.#items.has(itemRefKey(ref));
  }

  values(): readonly ItemRef[] {
    return [...this.#items.values()];
  }

  add(ref: ItemRef): boolean {
    const key = itemRefKey(ref);
    if (this.#items.has(key)) return false;
    this.#items.set(key, { ...ref });
    return true;
  }

  delete(ref: ItemRef): boolean {
    return this.#items.delete(itemRefKey(ref));
  }

  toggle(ref: ItemRef): boolean {
    if (this.delete(ref)) return false;
    this.add(ref);
    return true;
  }

  clear(): void {
    this.#items.clear();
  }

  replace(refs: Iterable<ItemRef>): void {
    this.clear();
    for (const ref of refs) this.add(ref);
  }

  countVisible(visible: Iterable<ItemRef>): number {
    let count = 0;
    const seen = new Set<string>();
    for (const ref of visible) {
      const key = itemRefKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.#items.has(key)) count += 1;
    }
    return count;
  }
}
