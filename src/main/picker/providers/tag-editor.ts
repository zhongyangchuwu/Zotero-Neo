import type { Logger } from '../../../core/logging';
import type { MainWindow } from '../../../core/contracts';
import type { MainNavigation } from '../../navigation';
import type { MainWindowSession } from '../../session';
import {
  itemTagState,
  resolveItemTagTargets,
  setTagOnTargets,
  type ItemTargetSet,
} from '../../tag-targets';
import { fuzzyMatchScore } from '../fuzzy';
import type { PickerItem } from '../model';
import type { PickerProvider, PickerProviderCommands } from '../types';

type TagRecord = { readonly tag: string; readonly type?: number };

const CREATE_TAG_KIND = 'create-tag';

function targetLabel(targets: ItemTargetSet): string {
  const context =
    targets.source === 'reader' ? 'Reader' : targets.source === 'note' ? 'Note' : 'Main selection';
  return `${context} · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
}

function createTagItem(tag: string): PickerItem {
  return {
    id: `create:${tag}`,
    title: tag,
    search: tag,
    kind: CREATE_TAG_KIND,
    tagState: 'none',
    tagType: 'manual',
  };
}

export function createTagEditorProvider(
  window: MainWindow,
  session: MainWindowSession,
  navigation: MainNavigation,
  logger: Logger,
): PickerProvider {
  const targets = resolveItemTagTargets(window);
  const trace = (message: string): void => {
    logger.debug(message);
    logger.diagnostic(message);
  };
  const failure = (context: string, error: unknown): void => {
    logger.debug(`picker ${context} failed: ${String(error)}`);
  };
  const libraryID = (): number => {
    const libraries = new Set(targets.items.map((item) => item.libraryID));
    if (libraries.size > 1) throw new Error('Selected items span multiple libraries');
    return [...libraries][0] ?? Zotero.Libraries.userLibraryID;
  };
  const load = async (): Promise<PickerItem[]> => {
    if (!targets.items.length) return [];
    const source: readonly TagRecord[] = await Zotero.Tags.getAll(libraryID());
    const byName = new Map<string, TagRecord>();
    for (const tag of source) {
      const existing = byName.get(tag.tag);
      if (!existing || (existing.type === 1 && tag.type !== 1)) byName.set(tag.tag, tag);
    }
    for (const item of targets.items) {
      for (const tag of item.getTags()) {
        const existing = byName.get(tag.tag);
        if (!existing || (existing.type === 1 && tag.type !== 1)) byName.set(tag.tag, tag);
      }
    }
    return [...byName.values()].map((tag) => {
      const tagState = itemTagState(targets.items, tag.tag);
      return {
        id: tag.tag,
        title: tag.tag,
        search: tag.tag,
        selected: tagState === 'all',
        tagState,
        tagType: tag.type === 1 ? 'automatic' : 'manual',
      };
    });
  };
  const filter = (query: string, commands: PickerProviderCommands, focusID = ''): void => {
    const startedAt = Date.now();
    const candidate = query.trim();
    const ranked = session.picker.items
      .flatMap((item, index) => {
        const score = fuzzyMatchScore(item.search, query);
        return score === null ? [] : [{ item, index, score }];
      })
      .sort((a, b) => {
        if (candidate) {
          const aExact = a.item.title === candidate;
          const bExact = b.item.title === candidate;
          if (aExact !== bExact) return aExact ? -1 : 1;
          if (b.score !== a.score) return b.score - a.score;
        }
        return a.index - b.index;
      });
    const hasExact = !!candidate && session.picker.items.some((item) => item.title === candidate);
    const create = candidate && !hasExact ? createTagItem(candidate) : null;
    const limit = create ? 99 : 100;
    session.picker.filtered = [
      ...(create ? [create] : []),
      ...ranked.slice(0, limit).map(({ item }) => item),
    ];
    const focused = focusID ? session.picker.filtered.findIndex((item) => item.id === focusID) : -1;
    session.picker.selected = create
      ? 0
      : focused >= 0
        ? focused
        : Math.max(
            0,
            Math.min(session.picker.selected, Math.max(0, session.picker.filtered.length - 1)),
          );
    commands.render();
    const duration = Date.now() - startedAt;
    if (duration >= 50)
      trace(
        `picker filter scope=tag-edit queryLength=${candidate.length} matches=${session.picker.filtered.length} duration=${duration}ms`,
      );
  };
  const reload = async (commands: PickerProviderCommands, focusID: string): Promise<void> => {
    const generation = session.picker.generation;
    const items = await load();
    if (!commands.isCurrent(generation)) return;
    session.picker.items = items;
    filter(session.picker.input?.value ?? '', commands, focusID);
  };
  const setTag = async (
    commands: PickerProviderCommands,
    tag: string,
    present: boolean,
  ): Promise<boolean> => {
    const generation = session.picker.generation;
    if (!targets.items.length) {
      navigation.status(session, '✗ No taggable item target');
      return false;
    }
    try {
      await setTagOnTargets(targets.items, tag, present);
      if (!commands.isCurrent(generation)) return false;
      await reload(commands, tag);
      if (!commands.isCurrent(generation)) return false;
      navigation.status(
        session,
        `${present ? '✓ Added' : '✓ Removed'} tag “${tag}” ${present ? 'to' : 'from'} ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`,
      );
      return true;
    } catch (error) {
      failure('item tag update', error);
      if (commands.isCurrent(generation)) {
        try {
          await reload(commands, tag);
        } catch (reloadError) {
          failure('item tag recovery', reloadError);
        }
        navigation.status(session, '✗ Unable to update item tags');
      }
      return false;
    }
  };
  const applyItem = (commands: PickerProviderCommands, item: PickerItem): Promise<boolean> =>
    item.kind === CREATE_TAG_KIND
      ? setTag(commands, item.title, true)
      : setTag(commands, String(item.id), item.tagState !== 'all');
  return {
    title: `Edit Item Tags · ${targetLabel(targets)}`,
    placeholder: '> Search tags or type a new tag…',
    initialFocusPane: 'search',
    loadingText: 'Loading item tags…',
    help: {
      query: 'Type to search · ↑/↓ choose · Enter add/remove/create · Tab list · Esc close',
      list: 'Enter/Space add/remove · ↑/↓ or j/k choose · / search · Esc close',
    },
    load,
    filter,
    rowText: (item) => {
      if (item.kind === CREATE_TAG_KIND) return `+ Add “${item.title}” as new tag`;
      const state = item.tagState === 'all' ? 'all' : item.tagState === 'mixed' ? 'mixed' : 'none';
      return `${item.title} · ${state}${item.tagType ? ` · ${item.tagType}` : ''}`;
    },
    preview: (item) => {
      if (item.kind === CREATE_TAG_KIND)
        return {
          title: `New tag: ${item.title}`,
          body: [
            `Target: ${targetLabel(targets)}`,
            '',
            `Press Enter to create “${item.title}” as a manual tag and add it to every target.`,
          ].join('\n'),
        };
      return {
        title: item.title,
        body: [
          `Target: ${targetLabel(targets)}`,
          `State: ${item.tagState ?? 'none'}`,
          `Type: ${item.tagType === 'automatic' ? 'Automatic' : 'Manual'}`,
          '',
          item.tagState === 'all'
            ? 'Press Enter to remove this tag from every target.'
            : 'Press Enter to add this tag to every target.',
        ].join('\n'),
      };
    },
    activate: () => {},
    onKeyDown(event, commands) {
      const key = event.key;
      const lower = key.toLowerCase();
      const input = session.picker.input;
      const inSearch = event.target === input || session.picker.focusPane === 'search';
      const selectedItem = session.picker.filtered[session.picker.selected];
      const max = Math.max(0, session.picker.filtered.length - 1);
      const stop = (): void => {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      };
      if (key === 'Enter') {
        stop();
        if (selectedItem)
          commands.enqueue('apply item tag', () => applyItem(commands, selectedItem));
        return true;
      }
      if (key === 'Tab' && inSearch) {
        stop();
        commands.focusPane('list');
        return true;
      }
      if (key === '/' && !inSearch) {
        stop();
        commands.focusPane('search');
        input?.select();
        return true;
      }
      if (key === ' ' && !inSearch) {
        stop();
        if (selectedItem && selectedItem.kind !== CREATE_TAG_KIND)
          commands.enqueue('toggle item tag', () => applyItem(commands, selectedItem));
        return true;
      }
      if (!inSearch && lower === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (session.picker.command === 'g') {
          session.picker.command = '';
          clearTimeout(session.picker.commandTimer);
          session.picker.commandTimer = undefined;
          session.picker.selected = 0;
          commands.render();
        } else commands.armCommand('g');
        return true;
      }
      if (!inSearch && key === 'G') {
        stop();
        session.picker.selected = max;
        commands.render();
        return true;
      }
      event.stopPropagation();
      return false;
    },
    onRowRender(row, item) {
      const marker = row.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      marker.tabIndex = -1;
      marker.style.cssText = 'margin-right:8px';
      if (item.kind === CREATE_TAG_KIND) {
        marker.textContent = '[+]';
        marker.setAttribute('aria-label', `create tag ${item.title}`);
      } else {
        const state = item.tagState ?? 'none';
        marker.textContent = state === 'all' ? '[x]' : state === 'mixed' ? '[-]' : '[ ]';
        marker.setAttribute('role', 'checkbox');
        marker.setAttribute('aria-checked', state === 'mixed' ? 'mixed' : String(state === 'all'));
        marker.setAttribute('aria-disabled', 'true');
        marker.setAttribute('aria-label', `${state} tag ${item.title}`);
      }
      row.append(marker);
    },
    emptyText: (query) =>
      targets.items.length
        ? query
          ? `No tag result for “${query}”`
          : 'No tags in this library · start typing to create one'
        : 'No taggable item target in the current context',
    countText: (_filtered, items) => {
      const visibleTags = session.picker.filtered.filter(
        (item) => item.kind !== CREATE_TAG_KIND,
      ).length;
      return `${visibleTags}/${items} tags · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
    },
  };
}
