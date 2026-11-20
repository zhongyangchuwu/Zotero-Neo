import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import {
  neoCommandLanguage,
  tagSeparatorFromPreferences,
  type PreferenceReader,
} from '../../core/preferences';
import { isWritableTagItem, setItemTag } from '../../operations/item-tags';
import type { PickerOpenOptions } from '../../main/picker/types';
import { createTagCandidateProvider, type TagRecord } from '../../main/picker/providers/tags';
import { isSourceNoteIdentity } from '../../platform/note-relations';
import { t } from '../../i18n';
import { batchStatus, type BatchOutcome } from '../../i18n/batch-result';

function sameTag(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function targetContext(targets: ItemTargetSet, language: string): string {
  if (targets.source === 'reader') return t('workflow.itemTarget.reader', language);
  if (targets.source === 'note') return t('workflow.itemTarget.note', language);
  const origin = targets.presentation.origin;
  const context = origin === 'native-selection' ? 'nativeSelection' : origin;
  return t(`workflow.itemTarget.main.${context}`, language);
}

function targetLabel(targets: ItemTargetSet, language: string): string {
  const count = String(targets.items.length);
  const context = targetContext(targets, language);
  if (targets.source === 'main') {
    const outside = String(
      Math.min(targets.items.length, Math.max(0, targets.presentation.outsideCurrentList)),
    );
    return t('workflow.itemTarget.main.summary', language)
      .replace('{context}', context)
      .replace('{count}', count)
      .replace('{outside}', outside);
  }
  return t('workflow.itemTarget.context.summary', language)
    .replace('{context}', context)
    .replace('{count}', count);
}

function countTags(counts: Map<string, number>, item: Zotero.Item): void {
  for (const { tag } of item.getTags()) {
    if (!isSourceNoteIdentity(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
}

function mergeTags(...sources: readonly (readonly TagRecord[])[]): TagRecord[] {
  const byName = new Map<string, TagRecord>();
  for (const source of sources) {
    for (const record of source) {
      if (!byName.has(record.tag)) byName.set(record.tag, record);
    }
  }
  return [...byName.values()];
}

function candidateName(item: {
  readonly tagName?: string;
  readonly tagCandidate?: string;
}): string {
  const name = item.tagCandidate === 'namespace' ? '' : (item.tagName?.trim() ?? '');
  return isSourceNoteIdentity(name) ? '' : name;
}

function presenceLabel(count: number | undefined, total: number): string | undefined {
  if (!count) return undefined;
  return count === total ? `Assigned to all ${total}` : `Assigned to ${count}/${total}`;
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
 * the shared item-tag operation owns individual Zotero writes.
 */
export class TagActions {
  readonly #host: TagActionHost;
  readonly #isCurrent: () => boolean;

  constructor(host: TagActionHost, isCurrent: () => boolean) {
    this.#host = host;
    this.#isCurrent = isCurrent;
  }

  add(input: ItemTargetSet): void {
    this.edit(input, true);
  }

  remove(input: ItemTargetSet): void {
    this.edit(input, false);
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

  private edit(targets: ItemTargetSet, present: boolean): void {
    const language = neoCommandLanguage(this.#host.preferences, Zotero.locale ?? 'en');
    const action = present ? 'tagAdd' : 'tagRemove';
    // The chooser's focus can change the surface selection. Never resolve it again.
    const items: Zotero.Item[] = [];
    const assigned = new Map<string, number>();
    let unavailable = targets.missing;
    let failed = 0;
    for (const item of targets.items) {
      try {
        if (!isWritableTagItem(item)) {
          unavailable++;
          continue;
        }
        countTags(assigned, item);
        items.push(item);
      } catch (error) {
        failed++;
        this.#host.logger.debug(`tag lookup failed for item ${item.id}: ${String(error)}`);
      }
    }
    const report = (result: BatchOutcome): void => {
      if (unavailable) result.unavailable = (result.unavailable ?? 0) + unavailable;
      if (failed) result.failed = (result.failed ?? 0) + failed;
      this.#host.status(batchStatus(action, result, language));
    };
    if (!items.length) {
      report({ done: 0 });
      return;
    }
    if (!present && !assigned.size) {
      report({ done: 0, unchanged: items.length });
      return;
    }
    const tags = [...assigned.keys()].map((tag) => ({ tag }));

    const source = createTagCandidateProvider({
      title: t(present ? 'workflow.tags.addTitle' : 'workflow.tags.removeTitle', language).replace(
        '{target}',
        targetLabel(targets, language),
      ),
      placeholder: present ? '> Search or create a tag…' : '> Search assigned tags…',
      separator: tagSeparatorFromPreferences(this.#host.preferences),
      allowCreate: present,
      loadTags: present
        ? async () => {
            const ids = new Set(items.map((item) => item.libraryID));
            const libraries = await Promise.all(
              [...ids].map(async (id) => {
                try {
                  return await Zotero.Tags.getAll(id);
                } catch (error) {
                  this.#host.logger.debug(
                    `tag candidates unavailable for library ${id}: ${String(error)}`,
                  );
                  return [];
                }
              }),
            );
            return mergeTags(...libraries, tags);
          }
        : async () => tags,
      describe: present ? (tag) => presenceLabel(assigned.get(tag), items.length) : undefined,
    });
    this.#host.choose({
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name || !this.#isCurrent()) return;
        report(
          await setItemTag(items, name, present, {
            isCurrent: this.#isCurrent,
            logger: this.#host.logger,
          }),
        );
      },
    });
  }
}
