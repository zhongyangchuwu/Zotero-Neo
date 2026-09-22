import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { PreferenceReader } from '../core/preferences';
import type { FuzzyPicker } from './picker';
import { createTagCandidateProvider, type TagRecord } from './picker/providers/tags';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';
import { mainHost } from './host';
import type { MainViewActions } from './view-actions';
import { itemTagState, setTagOnTargets } from './tag-targets';
import {
  resolveItemTargets,
  type ItemTargetContext,
  type ItemTargetSet,
} from './item-targets';

function sameTag(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function targetLabel(targets: ItemTargetSet): string {
  const context =
    targets.source === 'reader' ? 'Reader' : targets.source === 'note' ? 'Note' : 'Main target';
  return `${context} · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
}

function targetLibraryID(targets: ItemTargetSet): number | null {
  const libraries = new Set(targets.items.map((item) => item.libraryID));
  return libraries.size === 1 ? ([...libraries][0] ?? null) : null;
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
  const state = itemTagState(targets.items, tag);
  if (state === 'none') return undefined;
  const count = targets.items.filter((item) => item.hasTag(tag)).length;
  return state === 'all'
    ? `Assigned to all ${targets.items.length}`
    : `Assigned to ${count}/${targets.items.length}`;
}

/**
 * Owns semantic tag actions. Candidate search is delegated to the shared chooser; item mutation
 * and Main-view filtering remain separate host operations.
 */
export class TagActions {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #preferences: PreferenceReader;
  readonly #picker: FuzzyPicker;
  readonly #viewActions: MainViewActions;

  constructor(
    logger: Logger,
    navigation: MainNavigation,
    preferences: PreferenceReader,
    picker: FuzzyPicker,
    viewActions: MainViewActions,
  ) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#preferences = preferences;
    this.#picker = picker;
    this.#viewActions = viewActions;
  }

  add(
    window: MainWindow,
    session: MainWindowSession,
    context: ItemTargetContext = 'main',
  ): void {
    const targets = this.targets(window, session, context);
    if (!targets) return;
    const libraryID = targetLibraryID(targets);
    if (libraryID === null) {
      this.#navigation.status(session, '✗ Add Tag requires one library at a time');
      return;
    }
    const separator = this.#preferences.get('tags.separator', '/');
    const source = createTagCandidateProvider({
      title: `Add Tag · ${targetLabel(targets)}`,
      placeholder: '> Search or create a tag…',
      separator,
      allowCreate: true,
      loadTags: async () => mergeTags(await Zotero.Tags.getAll(libraryID), targetTags(targets)),
      describe: (tag) => presenceLabel(targets, tag),
    });
    void this.#picker.open(window, session, 'tags', {
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const changed = await setTagOnTargets(targets.items, name, true);
        this.#navigation.status(
          session,
          changed
            ? `✓ Added tag “${name}” to ${changed} item${changed === 1 ? '' : 's'}`
            : `✓ Tag “${name}” already assigned`,
        );
      },
    });
  }

  remove(
    window: MainWindow,
    session: MainWindowSession,
    context: ItemTargetContext = 'main',
  ): void {
    const targets = this.targets(window, session, context);
    if (!targets) return;
    const tags = targetTags(targets);
    if (!tags.length) {
      this.#navigation.status(session, '→ No assigned tags to remove');
      return;
    }
    const source = createTagCandidateProvider({
      title: `Remove Tag · ${targetLabel(targets)}`,
      placeholder: '> Search assigned tags…',
      separator: this.#preferences.get('tags.separator', '/'),
      loadTags: async () => tags,
      describe: (tag) => presenceLabel(targets, tag),
    });
    void this.#picker.open(window, session, 'tags', {
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const changed = await setTagOnTargets(targets.items, name, false);
        this.#navigation.status(
          session,
          changed
            ? `✓ Removed tag “${name}” from ${changed} item${changed === 1 ? '' : 's'}`
            : `✓ Tag “${name}” is not assigned`,
        );
      },
    });
  }

  toggleFilter(window: MainWindow, session: MainWindowSession): void {
    const active = [...this.#viewActions.state(window).tags];
    const activeSet = new Set(active);
    const pane = mainHost(window).ZoteroPane;
    const row = pane?.getCollectionTreeRow?.();
    const libraryID = row?.ref?.libraryID ?? Zotero.Libraries.userLibraryID;
    const source = createTagCandidateProvider({
      title: 'Toggle Tag Filter',
      placeholder: '> Search tags to toggle…',
      separator: this.#preferences.get('tags.separator', '/'),
      loadTags: async () => {
        const scoped: readonly TagRecord[] = row?.getTags
          ? await row.getTags()
          : await Zotero.Tags.getAll(libraryID);
        return mergeTags(
          scoped,
          active.map((tag) => ({ tag })),
        );
      },
      describe: (tag) => (activeSet.has(tag) ? 'Active filter' : undefined),
    });
    void this.#picker.open(window, session, 'tags', {
      source,
      confirm: async (item) => {
        const name = candidateName(item);
        if (!name) return;
        const wasActive = active.some((tag) => sameTag(tag, name));
        const next = wasActive ? active.filter((tag) => !sameTag(tag, name)) : [...active, name];
        const matches = await this.#viewActions.applyTagFilter(window, next);
        this.#navigation.status(
          session,
          `✓ ${wasActive ? 'Removed' : 'Added'} tag filter “${name}” · ${matches} item${
            matches === 1 ? '' : 's'
          }`,
        );
      },
    });
  }

  clearFilters(window: MainWindow, session: MainWindowSession): void {
    if (!this.#viewActions.state(window).tags.length) {
      this.#navigation.status(session, '→ No tag filters active');
      return;
    }
    void this.#viewActions
      .applyTagFilter(window, [])
      .then((matches) =>
        this.#navigation.status(
          session,
          `✓ Cleared tag filters · ${matches} item${matches === 1 ? '' : 's'}`,
        ),
      )
      .catch((error) => {
        this.#logger.debug(`clear tag filters failed: ${String(error)}`);
        this.#navigation.status(session, '✗ Unable to clear tag filters');
      });
  }

  private targets(
    window: MainWindow,
    session: MainWindowSession,
    context: ItemTargetContext,
  ): ItemTargetSet | null {
    const targets = resolveItemTargets(window, session, context);
    if (targets.missing > 0) {
      this.#navigation.status(
        session,
        `✗ ${context === 'main' ? 'Selection contains' : 'Context item is'} unavailable; refresh before changing tags`,
      );
      return null;
    }
    if (targets.items.length) return targets;
    this.#navigation.status(session, '✗ No taggable item target');
    return null;
  }
}
