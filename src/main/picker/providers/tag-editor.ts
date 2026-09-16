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

type TagJson = _ZoteroTypes.Tags.TagJson;

function targetLabel(targets: ItemTargetSet): string {
  const context =
    targets.source === 'reader' ? 'Reader' : targets.source === 'note' ? 'Note' : 'Main selection';
  return `${context} · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
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
    const source: readonly TagJson[] = await Zotero.Tags.getAll(libraryID());
    const byName = new Map<string, TagJson>();
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
    const ranked = session.picker.items
      .flatMap((item, index) => {
        const score = fuzzyMatchScore(item.search, query);
        return score === null ? [] : [{ item, index, score }];
      })
      .sort((a, b) => (query.trim() ? b.score - a.score || a.index - b.index : a.index - b.index));
    session.picker.filtered = ranked.slice(0, 100).map(({ item }) => item);
    const focused = focusID ? session.picker.filtered.findIndex((item) => item.id === focusID) : -1;
    session.picker.selected =
      focused >= 0
        ? focused
        : Math.max(
            0,
            Math.min(session.picker.selected, Math.max(0, session.picker.filtered.length - 1)),
          );
    commands.render();
    const duration = Date.now() - startedAt;
    if (duration >= 50)
      trace(
        `picker filter scope=tag-edit queryLength=${query.trim().length} matches=${session.picker.filtered.length} duration=${duration}ms`,
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
  const toggle = (commands: PickerProviderCommands, item: PickerItem): Promise<boolean> =>
    setTag(commands, String(item.id), item.tagState !== 'all');
  const createFromQuery = async (commands: PickerProviderCommands): Promise<boolean> => {
    const tag = session.picker.input?.value.trim() ?? '';
    if (!tag) {
      navigation.status(session, '✗ Type a tag name first');
      return false;
    }
    return setTag(commands, tag, true);
  };
  return {
    title: `Edit Item Tags · ${targetLabel(targets)}`,
    placeholder: '> Search or type a tag name…',
    initialFocusPane: 'list',
    loadingText: 'Loading item tags…',
    help: {
      query: 'Query · Type tag name · ↑/↓ select · Enter toggle match · Tab/Esc list',
      list: 'List · Space/Enter toggle all · x remove all · n create query · Tab or / query · Esc close',
    },
    searchFocusUpdates: false,
    inputClick: (commands) => {
      session.picker.tagMode = 'query';
      commands.focusPane('search');
    },
    initialize: () => {
      session.picker.tagMode = 'list';
    },
    onClose: () => {
      session.picker.tagMode = 'list';
    },
    load,
    filter,
    rowText: (item) => {
      const state = item.tagState === 'all' ? 'all' : item.tagState === 'mixed' ? 'mixed' : 'none';
      return `${item.title} · ${state}${item.tagType ? ` · ${item.tagType}` : ''}`;
    },
    preview: (item) => ({
      title: item.title,
      body: [
        `Target: ${targetLabel(targets)}`,
        `State: ${item.tagState ?? 'none'}`,
        `Type: ${item.tagType === 'automatic' ? 'Automatic' : 'Manual'}`,
        '',
        item.tagState === 'all'
          ? 'Space/Enter removes this tag from every target.'
          : 'Space/Enter adds this tag to every target.',
        'x removes it from every target. New assignments are manual tags.',
      ].join('\n'),
    }),
    activate: () => {},
    onEscape: (commands) => {
      if (session.picker.tagMode !== 'query') return false;
      session.picker.tagMode = 'list';
      commands.focusPane('list');
      return true;
    },
    onKeyDown(event, commands) {
      const key = event.key;
      const lower = key.toLowerCase();
      const selectedItem = session.picker.filtered[session.picker.selected];
      const max = Math.max(0, session.picker.filtered.length - 1);
      const stop = (): void => {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      };
      if (session.picker.tagMode === 'query') {
        if (key === 'Tab') {
          stop();
          session.picker.tagMode = 'list';
          commands.focusPane('list');
          return true;
        }
        if (key === 'Enter') {
          stop();
          session.picker.tagMode = 'list';
          commands.focusPane('list');
          if (selectedItem) commands.enqueue('toggle item tag', () => toggle(commands, selectedItem));
          return true;
        }
        event.stopPropagation();
        return false;
      }
      if (key === 'Tab' || key === '/') {
        stop();
        session.picker.tagMode = 'query';
        commands.focusPane('search');
        if (key === '/') session.picker.input?.select();
        return true;
      }
      if (key === 'Enter' || key === ' ') {
        stop();
        if (selectedItem) commands.enqueue('toggle item tag', () => toggle(commands, selectedItem));
        return true;
      }
      if (lower === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (selectedItem?.tagState !== 'none')
          commands.enqueue('remove item tag', () => setTag(commands, String(selectedItem.id), false));
        else navigation.status(session, '✗ Tag is not present on the targets');
        return true;
      }
      if (lower === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('create item tag', () => createFromQuery(commands));
        return true;
      }
      if (lower === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
      if (key === 'G') {
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
      const state = item.tagState ?? 'none';
      marker.tabIndex = -1;
      marker.textContent = state === 'all' ? '[x]' : state === 'mixed' ? '[-]' : '[ ]';
      marker.setAttribute('role', 'checkbox');
      marker.setAttribute('aria-checked', state === 'mixed' ? 'mixed' : String(state === 'all'));
      marker.setAttribute('aria-disabled', 'true');
      marker.setAttribute('aria-label', `${state} tag ${item.title}`);
      marker.style.cssText = 'margin-right:8px';
      row.append(marker);
    },
    emptyText: (query) =>
      targets.items.length
        ? query
          ? `No existing tags match “${query}” · return to List and press n to create it`
          : 'No tags in this library'
        : 'No taggable item target in the current context',
    countText: (filtered, items) =>
      `${filtered}/${items} tags · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`,
  };
}
