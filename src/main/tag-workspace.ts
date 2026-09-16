import type { MainWindow } from '../core/contracts';
import type { Logger } from '../core/logging';
import type { PreferenceReader } from '../core/preferences';
import { THEME_VARS } from '../ui/theme';
import { fuzzyMatchScore } from './picker/fuzzy';
import type { MainNavigation } from './navigation';
import type { MainWindowSession } from './session';
import { suggestTagPaths, type TagPathSuggestion } from './tag-path';
import {
  itemTagState,
  resolveItemTagTargets,
  setTagOnTargets,
  type ItemTargetSet,
  type ItemTagState,
} from './tag-targets';

type TagRecord = { readonly tag: string; readonly type?: number };
type WorkspaceSuggestion =
  | TagPathSuggestion
  | {
      readonly kind: 'create';
      readonly label: string;
      readonly insertText: string;
      readonly score: number;
      readonly count: 1;
    };

interface TagWorkspaceState {
  readonly overlay: HTMLElement;
  readonly input: HTMLInputElement;
  readonly assigned: HTMLElement;
  readonly list: HTMLElement;
  readonly footer: HTMLElement;
  readonly targets: ItemTargetSet;
  readonly libraryID: number;
  readonly separator: string;
  readonly previousElement: Element | null;
  readonly themeCleanup: () => void;
  tags: TagRecord[];
  suggestions: WorkspaceSuggestion[];
  selected: number;
  queue: Promise<void>;
}

function targetLabel(targets: ItemTargetSet): string {
  const context =
    targets.source === 'reader' ? 'Reader' : targets.source === 'note' ? 'Note' : 'Main selection';
  return `${context} · ${targets.items.length} item${targets.items.length === 1 ? '' : 's'}`;
}

function marker(state: ItemTagState): string {
  return state === 'all' ? '[x]' : state === 'mixed' ? '[-]' : '[ ]';
}

function sameTag(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

export class TagWorkspace {
  readonly #logger: Logger;
  readonly #navigation: MainNavigation;
  readonly #preferences: PreferenceReader;
  readonly #states = new Map<MainWindow, TagWorkspaceState>();

  constructor(logger: Logger, navigation: MainNavigation, preferences: PreferenceReader) {
    this.#logger = logger;
    this.#navigation = navigation;
    this.#preferences = preferences;
  }

  isOpen(window: MainWindow): boolean {
    return this.#states.has(window);
  }

  async open(window: MainWindow, session: MainWindowSession): Promise<void> {
    const existing = this.#states.get(window);
    if (existing) {
      existing.input.focus();
      existing.input.select();
      return;
    }

    const targets = resolveItemTagTargets(window);
    if (!targets.items.length) {
      this.#navigation.status(session, '✗ No taggable item target');
      return;
    }
    const libraries = new Set(targets.items.map((item) => item.libraryID));
    if (libraries.size !== 1) {
      this.#navigation.status(session, '✗ Tag Workspace requires one library at a time');
      return;
    }
    const libraryID = [...libraries][0] ?? Zotero.Libraries.userLibraryID;
    const tags = await this.loadTags(targets, libraryID);
    const doc = window.document;
    const create = (tag: string): HTMLElement =>
      doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
    const overlay = create('div');
    overlay.id = 'zotero-neo-tag-workspace';
    overlay.style.cssText = `position:fixed;inset:0;z-index:100000;background:${THEME_VARS.backdrop};display:flex;align-items:flex-start;justify-content:center;padding:7vh 4vw`;
    const panel = create('section');
    panel.style.cssText = `width:min(980px,92vw);height:min(720px,84vh);display:flex;flex-direction:column;overflow:hidden;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:8px;box-shadow:0 20px 60px ${THEME_VARS.shadow};font:13px/1.45 monospace`;
    const header = create('header');
    header.style.cssText = `padding:9px 14px;border-bottom:1px solid ${THEME_VARS.border};background:${THEME_VARS.elevated};color:${THEME_VARS.accent};font-weight:700`;
    header.textContent = `TAG · ${targetLabel(targets)}`;
    const input = create('input') as HTMLInputElement;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Search or type a tag…';
    input.style.cssText = `margin:12px 14px 8px;padding:9px 11px;background:${THEME_VARS.input};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:4px;outline:2px solid ${THEME_VARS.focusRing};outline-offset:1px;font:14px/1.2 monospace`;
    const assigned = create('div');
    assigned.style.cssText = `padding:4px 14px 10px;border-bottom:1px solid ${THEME_VARS.border};display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:28px`;
    const list = create('div');
    list.tabIndex = -1;
    list.style.cssText = 'flex:1;min-height:0;overflow:auto;padding:6px 0';
    const footer = create('footer');
    footer.style.cssText = `padding:7px 14px;border-top:1px solid ${THEME_VARS.border};color:${THEME_VARS.muted};background:${THEME_VARS.elevated};font-size:11px`;
    panel.append(header, input, assigned, list, footer);
    overlay.append(panel);
    (doc.body ?? doc.documentElement).append(overlay);
    const themeCleanup = session.theme.add(overlay);
    const state: TagWorkspaceState = {
      overlay,
      input,
      assigned,
      list,
      footer,
      targets,
      libraryID,
      separator: this.#preferences.get('tags.separator', '/'),
      previousElement: doc.activeElement,
      themeCleanup,
      tags,
      suggestions: [],
      selected: 0,
      queue: Promise.resolve(),
    };
    this.#states.set(window, state);

    input.addEventListener('input', () => {
      state.selected = 0;
      this.render(state);
    });
    list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest?.('[data-neo-tag-index]') as HTMLElement | null;
      if (!row) return;
      const index = Number.parseInt(row.dataset.neoTagIndex ?? '', 10);
      if (!Number.isInteger(index)) return;
      state.selected = index;
      this.render(state);
      input.focus();
    });
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close(window);
    });
    this.render(state);
    window.setTimeout(() => input.focus(), 0);
  }

  close(window: MainWindow): void {
    const state = this.#states.get(window);
    if (!state) return;
    this.#states.delete(window);
    state.themeCleanup();
    state.overlay.remove();
    try {
      if (state.previousElement?.isConnected) (state.previousElement as HTMLElement).focus();
    } catch {}
  }

  onKeyDown(event: KeyboardEvent, window: MainWindow, session: MainWindowSession): void {
    const state = this.#states.get(window);
    if (!state) return;
    const lower = event.key.toLowerCase();
    const stop = (): void => {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    };

    if (event.key === 'Escape') {
      stop();
      if (state.input.value) {
        state.input.value = '';
        state.selected = 0;
        this.render(state);
      } else {
        this.close(window);
      }
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      (event.ctrlKey && !event.metaKey && !event.altKey && lower === 'j')
    ) {
      stop();
      this.move(state, 1);
      return;
    }
    if (
      event.key === 'ArrowUp' ||
      (event.ctrlKey && !event.metaKey && !event.altKey && lower === 'k')
    ) {
      stop();
      this.move(state, -1);
      return;
    }
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      stop();
      this.acceptSuggestion(state);
      return;
    }
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      stop();
      const suggestion = state.suggestions[state.selected];
      if (!suggestion) return;
      if (suggestion.kind === 'namespace') {
        state.input.value = suggestion.insertText;
        state.selected = 0;
        this.render(state);
        return;
      }
      this.enqueue(state, async () => {
        const name = suggestion.insertText;
        const present =
          suggestion.kind === 'create' || itemTagState(state.targets.items, name) !== 'all';
        try {
          await setTagOnTargets(state.targets.items, name, present);
          if (this.#states.get(window) !== state) return;
          state.tags = await this.loadTags(state.targets, state.libraryID);
          if (this.#states.get(window) !== state) return;
          state.input.value = '';
          state.selected = 0;
          this.render(state);
          this.#navigation.status(
            session,
            `${present ? '✓ Added' : '✓ Removed'} tag “${name}” ${present ? 'to' : 'from'} ${state.targets.items.length} item${state.targets.items.length === 1 ? '' : 's'}`,
          );
        } catch (error) {
          this.#logger.debug(`tag workspace update failed: ${String(error)}`);
          if (this.#states.get(window) === state) {
            state.tags = await this.loadTags(state.targets, state.libraryID).catch(
              () => state.tags,
            );
            this.render(state);
            this.#navigation.status(session, '✗ Unable to update item tags');
          }
        }
      });
      return;
    }

    if (event.target !== state.input) state.input.focus();
  }

  private async loadTags(targets: ItemTargetSet, libraryID: number): Promise<TagRecord[]> {
    const source: readonly TagRecord[] = await Zotero.Tags.getAll(libraryID);
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
    return [...byName.values()];
  }

  private render(state: TagWorkspaceState): void {
    this.renderAssigned(state);
    const query = state.input.value;
    const pathSuggestions = suggestTagPaths(
      state.tags.map((tag) => tag.tag),
      query,
      state.separator,
    ).slice(0, 80);
    const exact = state.tags.some((tag) => sameTag(tag.tag, query));
    const canCreate =
      !!query.trim() && !exact && (!state.separator || !query.endsWith(state.separator));
    const createSuggestion: WorkspaceSuggestion[] = canCreate
      ? [
          {
            kind: 'create',
            label: `+ Create & add “${query.trim()}”`,
            insertText: query.trim(),
            score: fuzzyMatchScore(query.trim(), query.trim()) ?? 0,
            count: 1,
          },
        ]
      : [];
    const namespaces = pathSuggestions.filter((suggestion) => suggestion.kind === 'namespace');
    const tags = pathSuggestions.filter((suggestion) => suggestion.kind === 'tag');
    state.suggestions = [...namespaces, ...createSuggestion, ...tags];
    state.selected = Math.max(
      0,
      Math.min(state.selected, Math.max(0, state.suggestions.length - 1)),
    );
    state.list.replaceChildren();

    const doc = state.list.ownerDocument;
    state.suggestions.forEach((suggestion, index) => {
      const row = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.dataset.neoTagIndex = String(index);
      row.style.cssText = `padding:7px 14px;display:flex;gap:10px;align-items:center;cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${index === state.selected ? `background:${THEME_VARS.selected};` : ''}`;
      if (suggestion.kind === 'namespace') {
        row.textContent = `› ${suggestion.label}  ·  ${suggestion.count} tag${suggestion.count === 1 ? '' : 's'}`;
      } else if (suggestion.kind === 'create') {
        row.textContent = suggestion.label;
      } else {
        const tagState = itemTagState(state.targets.items, suggestion.insertText);
        const type =
          state.tags.find((tag) => tag.tag === suggestion.insertText)?.type === 1
            ? 'automatic'
            : 'manual';
        row.textContent = `${marker(tagState)} ${suggestion.label}  ·  ${type}`;
      }
      state.list.append(row);
    });

    if (!state.suggestions.length) {
      const empty = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      empty.style.cssText = `padding:16px 14px;color:${THEME_VARS.muted}`;
      empty.textContent = query ? `No tags match “${query}”` : 'No tags in this library';
      state.list.append(empty);
    }

    state.footer.textContent = state.separator
      ? `Hierarchy separator: “${state.separator}” · Tab complete · ↑/↓ or Ctrl+j/k select · Enter add/remove · Esc clear/close`
      : 'Flat tags · Tab complete · ↑/↓ or Ctrl+j/k select · Enter add/remove · Esc clear/close';
  }

  private renderAssigned(state: TagWorkspaceState): void {
    const doc = state.assigned.ownerDocument;
    state.assigned.replaceChildren();
    const label = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
    label.textContent = 'Assigned:';
    label.style.color = THEME_VARS.muted;
    state.assigned.append(label);
    const names = new Set<string>();
    for (const item of state.targets.items) for (const tag of item.getTags()) names.add(tag.tag);
    const present = [...names]
      .map((name) => ({ name, state: itemTagState(state.targets.items, name) }))
      .filter((entry) => entry.state !== 'none')
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!present.length) {
      const empty = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      empty.textContent = 'none';
      empty.style.color = THEME_VARS.muted;
      state.assigned.append(empty);
      return;
    }
    for (const entry of present) {
      const chip = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      chip.textContent = `${marker(entry.state)} ${entry.name}`;
      chip.style.cssText = `padding:2px 6px;border:1px solid ${THEME_VARS.border};border-radius:3px;background:${THEME_VARS.elevated}`;
      state.assigned.append(chip);
    }
  }

  private move(state: TagWorkspaceState, amount: number): void {
    if (!state.suggestions.length) return;
    state.selected = Math.max(0, Math.min(state.suggestions.length - 1, state.selected + amount));
    this.render(state);
    const row = state.list.querySelector(`[data-neo-tag-index="${state.selected}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  private acceptSuggestion(state: TagWorkspaceState): void {
    const suggestion = state.suggestions[state.selected];
    if (!suggestion || suggestion.kind === 'create') return;
    state.input.value = suggestion.insertText;
    state.selected = 0;
    this.render(state);
  }

  private enqueue(state: TagWorkspaceState, operation: () => Promise<void>): void {
    state.queue = state.queue.then(operation, operation);
  }
}
