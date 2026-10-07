import type { ReaderJumpLocation } from '../core/contracts';
import type { NavigationLocation } from './types';

const MAX_NAVIGATION_LOCATIONS = 100;

/** Session-owned bounded history. Selection is deliberately not part of a location. */
export class NavigationHistoryState {
  readonly locations: NavigationLocation[] = [];
  index = -1;
  revision = 0;

  invalidate(): number {
    this.revision += 1;
    return this.revision;
  }

  append(source: NavigationLocation, destination: NavigationLocation, revision: number): boolean {
    if (this.revision !== revision || sameNavigationLocation(source, destination)) return false;
    const current = this.locations[this.index];
    // Loading a Reader refines its tab location; it is not another jump to that same tab.
    if (
      current?.kind === 'reader' &&
      source.kind === 'reader' &&
      current.tabID === source.tabID &&
      current.libraryID === source.libraryID &&
      current.itemID === source.itemID &&
      !current.position &&
      source.position
    )
      this.locations[this.index] = source;

    if (this.index >= 0 && sameNavigationLocation(this.locations[this.index]!, source)) {
      this.locations.splice(this.index + 1);
    } else {
      this.locations.splice(this.index + 1);
      this.locations.push(source);
      this.index = this.locations.length - 1;
    }

    this.locations.splice(this.index + 1);
    this.locations.push(destination);
    this.index = this.locations.length - 1;
    if (this.locations.length > MAX_NAVIGATION_LOCATIONS) {
      const removed = this.locations.length - MAX_NAVIGATION_LOCATIONS;
      this.locations.splice(0, removed);
      this.index -= removed;
    }
    return true;
  }

  move(index: number, revision: number): boolean {
    if (this.revision !== revision || index < 0 || index >= this.locations.length) return false;
    this.index = index;
    return true;
  }

  /** Ordinary motion is not a jump, but Forward must return to the actual departure point. */
  refresh(location: NavigationLocation | null): void {
    const current = this.locations[this.index];
    if (!location || !current || current.kind !== location.kind || current.tabID !== location.tabID)
      return;
    if (
      current.kind === 'reader' &&
      location.kind === 'reader' &&
      (current.libraryID !== location.libraryID || current.itemID !== location.itemID)
    )
      return;
    this.locations[this.index] = location;
  }

  remapReaderTab(location: ReaderJumpLocation, tabID: string): void {
    if (location.tabID === tabID) return;
    for (let index = 0; index < this.locations.length; index += 1) {
      const entry = this.locations[index]!;
      if (
        entry.kind === 'reader' &&
        entry.tabID === location.tabID &&
        entry.libraryID === location.libraryID &&
        entry.itemID === location.itemID
      )
        this.locations[index] = { ...entry, tabID };
    }
  }

  dispose(): void {
    this.invalidate();
    this.locations.length = 0;
    this.index = -1;
  }
}

export function sameNavigationLocation(
  left: NavigationLocation,
  right: NavigationLocation,
): boolean {
  if (left.kind !== right.kind || left.tabID !== right.tabID) return false;
  if (left.kind === 'tab' || right.kind === 'tab') return left.kind === right.kind;
  if (left.kind === 'reader' || right.kind === 'reader') {
    if (left.kind !== 'reader' || right.kind !== 'reader') return false;
    return (
      left.libraryID === right.libraryID &&
      left.itemID === right.itemID &&
      left.position?.primary === right.position?.primary &&
      left.position?.pageIndex === right.position?.pageIndex &&
      left.position?.top === right.position?.top &&
      left.position?.left === right.position?.left
    );
  }
  return (
    sameStrings(left.scopeIDs, right.scopeIDs) &&
    left.quickSearchText === right.quickSearchText &&
    sameStrings(left.tags, right.tags) &&
    left.advancedSearch === right.advancedSearch &&
    left.cursor?.libraryID === right.cursor?.libraryID &&
    left.cursor?.itemID === right.cursor?.itemID &&
    left.panel === right.panel
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
