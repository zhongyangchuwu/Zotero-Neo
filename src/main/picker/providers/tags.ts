import type { Logger } from '../../../core/logging';
import type { MainWindow } from '../../../core/contracts';
import { applyMainTagFilter, currentTagSelection, mainHost } from '../../host';
import { THEME_VARS } from '../../../ui/theme';
import { MainNavigation, selectedCollection } from '../../navigation';
import { fuzzyMatchScore } from '../fuzzy';
import type { MainWindowSession } from '../../session';
import type { PickerItem } from '../model';
import type { PickerProvider, PickerProviderCommands } from '../types';

type TagJson = _ZoteroTypes.Tags.TagJson;

export function createTagsProvider(
  window: MainWindow,
  session: MainWindowSession,
  navigation: MainNavigation,
  logger: Logger,
): PickerProvider {
  const trace = (message: string): void => {
    logger.debug(message);
    logger.diagnostic(message);
  };
  const failure = (context: string, error: unknown): void => {
    logger.debug(`picker ${context} failed: ${String(error)}`);
  };
  const currentSelection = (): string[] => currentTagSelection(window);
  const libraryID = (): number => {
    const pane = mainHost(window).ZoteroPane;
    return (
      pane?.getCollectionTreeRow?.()?.ref?.libraryID ??
      selectedCollection(pane?.collectionsView)?.libraryID ??
      Zotero.Libraries.userLibraryID
    );
  };
  const load = async (): Promise<PickerItem[]> => {
    const pane = mainHost(window).ZoteroPane;
    const row = pane?.getCollectionTreeRow?.();
    const source: readonly TagJson[] =
      session.picker.tagScope === 'current' && row?.getTags
        ? await row.getTags()
        : await Zotero.Tags.getAll(libraryID());
    const byName = new Map<string, TagJson>();
    for (const tag of source) {
      const existing = byName.get(tag.tag);
      if (!existing || (existing.type === 1 && tag.type !== 1)) byName.set(tag.tag, tag);
    }
    for (const tag of session.picker.tagSelection) if (!byName.has(tag)) byName.set(tag, { tag });
    session.picker.tagMatchCount = pane?.itemsView?.rowCount ?? null;
    return [...byName.values()].map((tag) => ({
      id: tag.tag,
      title: tag.tag,
      search: tag.tag,
      tagType: tag.type === 1 ? 'automatic' : 'manual',
      meta: source.some((candidate) => candidate.tag === tag.tag)
        ? undefined
        : 'Outside current scope',
    }));
  };
  const filter = (query: string, commands: PickerProviderCommands, focusID = ''): void => {
    const startedAt = Date.now();
    const selected = new Set(session.picker.tagSelection);
    const active = session.picker.items
      .filter((item) => selected.has(String(item.id)))
      .map((item) => ({ ...item, selected: true }));
    const available = session.picker.items
      .flatMap((item, index) => {
        if (selected.has(String(item.id))) return [];
        const score = fuzzyMatchScore(item.search, query);
        return score === null ? [] : [{ item, index, score }];
      })
      .sort((a, b) => (query.trim() ? b.score - a.score || a.index - b.index : a.index - b.index))
      .slice(0, 100)
      .map(({ item }) => ({ ...item, selected: false }));
    session.picker.filtered = [...active, ...available];
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
        `picker filter scope=tags queryLength=${query.trim().length} matches=${session.picker.filtered.length} duration=${duration}ms`,
      );
  };
  const setSelection = async (
    commands: PickerProviderCommands,
    tags: readonly string[],
    focusID: string,
  ): Promise<boolean> => {
    const generation = session.picker.generation;
    const next = [...new Set(tags)];
    try {
      const matches = await applyMainTagFilter(window, next);
      if (!session.picker.open || session.picker.generation !== generation) return false;
      session.picker.tagSelection = currentSelection();
      session.picker.tagMatchCount = matches;
      const pane = mainHost(window).ZoteroPane;
      if (pane?.tagSelector?.selectedTags)
        pane.tagSelector.selectedTags = new Set(session.picker.tagSelection);
      trace(
        `tag filter applied tags=${session.picker.tagSelection.length} matches=${session.picker.tagMatchCount ?? '?'}`,
      );
      filter(session.picker.input?.value ?? '', commands, focusID);
      return true;
    } catch (error) {
      if (!session.picker.open || session.picker.generation !== generation) return false;
      const recovered = currentSelection();
      session.picker.tagSelection = recovered;
      const pane = mainHost(window).ZoteroPane;
      if (pane?.tagSelector?.selectedTags) pane.tagSelector.selectedTags = new Set(recovered);
      filter(session.picker.input?.value ?? '', commands, focusID);
      failure('tag filter update', error);
      navigation.status(session, '✗ Unable to update tag filter');
      return false;
    }
  };
  const toggleSelected = (commands: PickerProviderCommands, tag: string): Promise<boolean> =>
    setSelection(
      commands,
      session.picker.tagSelection.includes(tag)
        ? session.picker.tagSelection.filter((value) => value !== tag)
        : [...session.picker.tagSelection, tag],
      tag,
    );
  const setSelected = (
    commands: PickerProviderCommands,
    tag: string,
    selected: boolean,
  ): Promise<boolean> =>
    setSelection(
      commands,
      selected
        ? [...session.picker.tagSelection, tag]
        : session.picker.tagSelection.filter((value) => value !== tag),
      tag,
    );
  const toggleScope = async (commands: PickerProviderCommands, focusID: string): Promise<void> => {
    const generation = session.picker.generation;
    const previous = session.picker.tagScope;
    if (session.picker.results) {
      session.picker.results.style.color = THEME_VARS.muted;
      session.picker.results.textContent = 'Loading tags…';
    }
    session.picker.tagScope = previous === 'current' ? 'library' : 'current';
    try {
      const items = await load();
      if (!session.picker.open || session.picker.generation !== generation) return;
      session.picker.items = items;
      filter(session.picker.input?.value ?? '', commands, focusID);
      trace(
        `tag scope changed scope=${session.picker.tagScope} items=${session.picker.items.length}`,
      );
    } catch (error) {
      if (!session.picker.open || session.picker.generation !== generation) return;
      session.picker.tagScope = previous;
      try {
        session.picker.items = await load();
      } catch {
        session.picker.items = [];
      }
      if (!session.picker.open || session.picker.generation !== generation) return;
      filter(session.picker.input?.value ?? '', commands, focusID);
      failure('tag scope load', error);
      navigation.status(session, '✗ Unable to load tags');
    }
  };
  return {
    title: 'Tags',
    placeholder: '> Search tag names…',
    initialFocusPane: 'list',
    loadingText: 'Loading tags…',
    help: {
      query: 'Query · Type search · Space/x/C/a literal · Esc list',
      list: 'List · Space/Enter toggle · x remove · C clear · a scope · Tab or / query · Esc close',
    },
    searchFocusUpdates: false,
    inputClick: (commands) => {
      session.picker.tagMode = 'query';
      commands.focusPane('search');
    },
    initialize: () => {
      session.picker.tagMode = 'list';
      session.picker.tagScope = 'current';
      session.picker.tagSelection = currentSelection();
      session.picker.tagMatchCount = null;
    },
    onClose: () => {
      session.picker.tagMode = 'list';
      session.picker.tagScope = 'current';
      session.picker.tagSelection = [];
      session.picker.tagMatchCount = null;
    },
    load,
    filter,
    rowText: (item) =>
      `${item.title}${item.tagType ? ` · ${item.tagType}` : ''}${item.meta ? ` · ${item.meta}` : ''}`,
    preview: (item) => ({
      title: item.title,
      body: [
        `Scope: ${session.picker.tagScope === 'current' ? 'Current view' : 'All library'}`,
        `Filters: ${session.picker.tagSelection.length ? session.picker.tagSelection.join(' AND ') : '(none)'}`,
        `Matches: ${session.picker.tagMatchCount ?? '—'} items`,
        '',
        `Highlighted: ${item.title}`,
        `Type: ${item.tagType === 'automatic' ? 'Automatic' : 'Manual'}`,
        `State: ${item.selected ? 'Selected' : 'Not selected'}`,
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
        if (key === 'ArrowDown' || key === 'Tab') {
          stop();
          session.picker.tagMode = 'list';
          commands.focusPane('list');
          return true;
        }
        if (key === 'Enter') {
          stop();
          session.picker.tagMode = 'list';
          commands.focusPane('list');
          if (selectedItem)
            commands.enqueue('toggle tag', () => toggleSelected(commands, String(selectedItem.id)));
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
        if (selectedItem)
          commands.enqueue('toggle tag', () => toggleSelected(commands, String(selectedItem.id)));
        return true;
      }
      if (key === 'ArrowDown' || lower === 'j') {
        stop();
        session.picker.selected = Math.min(max, session.picker.selected + 1);
        commands.render();
        return true;
      }
      if (key === 'ArrowUp' || lower === 'k') {
        stop();
        session.picker.selected = Math.max(0, session.picker.selected - 1);
        commands.render();
        return true;
      }
      if (lower === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (selectedItem?.selected)
          commands.enqueue('remove tag', () =>
            setSelected(commands, String(selectedItem.id), false),
          );
        else navigation.status(session, '✗ Tag is not in the active filter');
        return true;
      }
      if (key === 'C' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('clear tags', () =>
          setSelection(commands, [], String(selectedItem?.id ?? '')),
        );
        return true;
      }
      if (lower === 'a' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('toggle tag scope', () =>
          toggleScope(commands, String(selectedItem?.id ?? '')),
        );
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
      marker.tabIndex = -1;
      marker.textContent = item.selected ? '[x]' : '[ ]';
      marker.setAttribute('role', 'checkbox');
      marker.setAttribute('aria-checked', String(item.selected));
      marker.setAttribute('aria-disabled', 'true');
      marker.setAttribute(
        'aria-label',
        `${item.selected ? 'Selected' : 'Not selected'} tag ${item.title}`,
      );
      marker.style.cssText = 'margin-right:8px';
      row.append(marker);
    },
    emptyText: (query) =>
      session.picker.items.length
        ? `No tags match${query ? ` “${query}”` : ''}`
        : `No tags in ${session.picker.tagScope === 'current' ? 'Current view' : 'this library'}`,
    countText: (filtered, items) =>
      `${filtered}/${items} · ${session.picker.tagMatchCount ?? '—'} items`,
  };
}
