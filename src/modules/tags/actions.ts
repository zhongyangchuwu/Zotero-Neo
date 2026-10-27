import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import { tagSeparatorFromPreferences, type PreferenceReader } from '../../core/preferences';
import { setItemTag } from '../../operations/item-tags';
import type { PickerOpenOptions } from '../../main/picker/types';
import { createTagCandidateProvider, type TagRecord } from '../../main/picker/providers/tags';

function sameTag(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function targetLabel(targets: ItemTargetSet): string {
  const context =
    targets.source === 'reader' ? 'Reader' : targets.source === 'note' ? 'Note' : 'Main target';
  return `${context} · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
}

function targetLibraryID(targets: ItemTargetSet): number | null {
  const first = targets.items[0]?.libraryID;
  if (first === undefined) return null;
  for (let index = 1; index < targets.items.length; index += 1)
    if (targets.items[index]?.libraryID !== first) return null;
  return first;
}

function targetTags(targets: ItemTargetSet): TagRecord[] {
  const byName = new Map<string, TagRecord>();
  for (const item of targets.items) {
    for (const record of item.getTags()) {
      const existing = byName.get(record.tag);
      if (!existing || (existing.type === 1 && record.type !== 1)) byName.set(record.tag, record);
    }
  }
  return [...byName.values()];
}

function mergeTags(...sources: readonly (readonly TagRecord[])[]): TagRecord[] {
  const byName = new Map<string, TagRecord>();
  for (const source of sources) {
    for (const record of source) {
      const existing = byName.get(record.tag);
      if (!existing || (existing.type === 1 && record.type !== 1)) byName.set(record.tag, record);
    }
  }
  return [...byName.values()];
}

function candidateName(item: {
  readonly tagName?: string;
  readonly tagCandidate?: string;
}): string {
  return item.tagCandidate === 'namespace' ? '' : (item.tagName?.trim() ?? '');
}

function presenceLabel(targets: ItemTargetSet, tag: string): string | undefined {
  let count = 0;
  for (const item of targets.items) if (item.hasTag(tag)) count += 1;
  if (!count) return undefined;
  return count === targets.items.length
    ? `Assigned to all ${targets.items.length}`
    : `Assigned to ${count}/${targets.items.length}`;
}

export interface TagActionHost {
  readonly logger: Logger;
  readonly preferences: PreferenceReader;
  readonly choose: (options: PickerOpenOptions) => void;
  readonly status: (message: string) => void;
  readonly readFilter: () => readonly string[];
  readonly captureScopeTags: () => () => Promise<readonly TagRecord[]>;
  readonly applyFilter: (tags: readonly string[]) => Promise<number>;
}

/**
 * Hosts tag candidate choice and Main-only filtering. Each Surface supplies explicit item targets;
 * the shared item-tag Operation owns the Zotero transaction.
 */
export class TagActions {
  readonly #host: TagActionHost;

  constructor(host: TagActionHost) {
    this.#host = host;
  }

  add(input: ItemTargetSet): void {
    const targets = this.validatedTargets(input);
    if (!targets) return;
    const libraryID = targetLibraryID(targets);
    if (libraryID === null) {
      this.#host.status('✗ Add Tag requires one library at a time');
      return;
    }
    const separator = tagSeparatorFromPreferences(this.#host.preferences);
    const source = createTagCandidateProvider({
      title: `Add Tag · ${targetLabel(targets)}`,
      placeholder: '> Search or create a tag…',
      separator,
      allowCreate: true,
      loadTags: async () => mergeTags(await Zotero.Tags.getAll(libraryID), targetTags(targets)),
      describe: (tag) => presenceLabel(targets, tag),
    });
    this.#host.choose({
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const changed = await setItemTag(targets.items, name, true);
        this.#host.status(
          changed
            ? `✓ Added tag “${name}” to ${changed} item${changed === 1 ? '' : 's'}`
            : `✓ Tag “${name}” already assigned`,
        );
      },
    });
  }

  remove(input: ItemTargetSet): void {
    const targets = this.validatedTargets(input);
    if (!targets) return;
    if (targetLibraryID(targets) === null) {
      this.#host.status('✗ Remove Tag requires one library at a time');
      return;
    }
    const tags = targetTags(targets);
    if (!tags.length) {
      this.#host.status('→ No assigned tags to remove');
      return;
    }
    const source = createTagCandidateProvider({
      title: `Remove Tag · ${targetLabel(targets)}`,
      placeholder: '> Search assigned tags…',
      separator: tagSeparatorFromPreferences(this.#host.preferences),
      loadTags: async () => tags,
      describe: (tag) => presenceLabel(targets, tag),
    });
    this.#host.choose({
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const changed = await setItemTag(targets.items, name, false);
        this.#host.status(
          changed
            ? `✓ Removed tag “${name}” from ${changed} item${changed === 1 ? '' : 's'}`
            : `✓ Tag “${name}” is not assigned`,
        );
      },
    });
  }

  toggleFilter(): void {
    const active = this.#host.readFilter();
    const activeSet = new Set(active);
    const getTags = this.#host.captureScopeTags();
    const source = createTagCandidateProvider({
      title: 'Toggle Tag Filter',
      placeholder: '> Search tags to toggle…',
      separator: tagSeparatorFromPreferences(this.#host.preferences),
      loadTags: async () => {
        const scoped = await getTags();
        return mergeTags(
          scoped,
          active.map((tag) => ({ tag })),
        );
      },
      describe: (tag) => (activeSet.has(tag) ? 'Active filter' : undefined),
    });
    this.#host.choose({
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const wasActive = active.some((tag) => sameTag(tag, name));
        const next = wasActive ? active.filter((tag) => !sameTag(tag, name)) : [...active, name];
        const matches = await this.#host.applyFilter(next);
        this.#host.status(
          `✓ ${wasActive ? 'Removed' : 'Added'} tag filter “${name}” · ${matches} item${
            matches === 1 ? '' : 's'
          }`,
        );
      },
    });
  }

  clearFilters(): void {
    if (!this.#host.readFilter().length) {
      this.#host.status('→ No tag filters active');
      return;
    }
    void this.#host
      .applyFilter([])
      .then((matches) =>
        this.#host.status(`✓ Cleared tag filters · ${matches} item${matches === 1 ? '' : 's'}`),
      )
      .catch((error) => {
        this.#host.logger.debug(`clear tag filters failed: ${String(error)}`);
        this.#host.status('✗ Unable to clear tag filters');
      });
  }

  private validatedTargets(targets: ItemTargetSet): ItemTargetSet | null {
    if (targets.missing > 0) {
      this.#host.status(
        targets.source === 'main'
          ? '✗ Selection contains unavailable items; refresh before changing tags'
          : '✗ Context item is unavailable; refresh before changing tags',
      );
      return null;
    }
    if (targets.items.length) return targets;
    this.#host.status('✗ No taggable item target');
    return null;
  }
}
