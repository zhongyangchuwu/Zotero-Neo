/** Per-Main-window history for Neo's last trash operation. */
export class TrashHistory {
  #itemIDs: number[] = [];

  values(): readonly number[] {
    return [...this.#itemIDs];
  }

  record(itemIDs: readonly number[]): void {
    this.#itemIDs = [...itemIDs];
  }

  clear(): void {
    this.#itemIDs = [];
  }
}
