import { describe, expect, it } from 'vitest';

import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  BINDINGS_PREFERENCE_KEY,
  LANGUAGE_PREFERENCE_KEY,
  bindingsFromPreferences,
} from '../../src/core/preferences';
import {
  DEFAULT_BINDINGS,
  encodeBindingOverrides,
  type BindingContext,
  type BindingMap,
} from '../../src/input/bindings';
import { deriveBindingEditor, type BindingEditorState } from '../../src/input/binding-editor';
import type { ActionId } from '../../src/input/actions';
import { bindingSequenceTokens } from '../../src/input/key-sequence';
import { contextLabel, shortcutsForAction } from '../../src/input/shortcut-catalog';
import {
  SettingsKeybindings,
  type SettingsKeybindingsState,
} from '../../src/main/settings-keybindings';
import { settingsText, type SettingsLanguage } from '../../src/main/settings-i18n';

type Listener = (event: Event) => void;

class FakeEvent {
  readonly type: string;
  readonly target: FakeElement;
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
  defaultPrevented = false;
  cancelBubble = false;
  immediatePropagationStopped = false;

  constructor(
    type: string,
    target: FakeElement,
    init: Partial<
      Pick<
        FakeEvent,
        'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode'
      >
    > = {},
  ) {
    this.type = type;
    this.target = target;
    this.key = init.key ?? '';
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
    this.isComposing = init.isComposing ?? false;
    this.keyCode = init.keyCode ?? 0;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.cancelBubble = true;
  }

  stopImmediatePropagation(): void {
    this.cancelBubble = true;
    this.immediatePropagationStopped = true;
  }
}

class FakeWindow {
  readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as Listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  dispatch(event: FakeEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event as unknown as Event);
      if (event.immediatePropagationStopped) break;
    }
  }
}

class FakeElement {
  nodeType = 1;
  readonly localName: string;
  readonly tagName: string;
  readonly namespaceURI: string;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Listener[]>();
  readonly style: Record<string, string> = {
    cssText: '',
    background: '',
    color: '',
    borderColor: '',
  };
  readonly classList = {
    add: (...names: string[]) => {
      for (const name of names) this.classes.add(name);
    },
    remove: (...names: string[]) => {
      for (const name of names) this.classes.delete(name);
    },
    contains: (name: string) => this.classes.has(name),
  };
  parentElement: FakeElement | null = null;
  id = '';
  value = '';
  type = '';
  autocomplete = '';
  placeholder = '';
  tabIndex = 0;
  hidden = false;
  disabled = false;
  open = false;
  private text = '';
  private classes = new Set<string>();
  private readonly attributes = new Map<string, string>();

  constructor(
    ownerDocument: FakeDocument,
    localName: string,
    namespaceURI = 'http://www.w3.org/1999/xhtml',
  ) {
    this.ownerDocument = ownerDocument;
    this.localName = localName;
    this.tagName = localName.toUpperCase();
    this.namespaceURI = namespaceURI;
  }

  get className(): string {
    return [...this.classes].join(' ');
  }

  set className(value: string) {
    this.classes = new Set(value.split(/\s+/).filter(Boolean));
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.text = value;
    this.replaceChildren();
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node: FakeElement): FakeElement {
    if (node.parentElement) {
      const index = node.parentElement.children.indexOf(node);
      if (index >= 0) node.parentElement.children.splice(index, 1);
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (let active = this.ownerDocument.activeElement; active; active = active.parentElement) {
      if (active.parentElement === this) {
        this.ownerDocument.activeElement = null;
        break;
      }
    }
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') this.id = value;
    if (name === 'class') this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'id') this.id = '';
    if (name === 'class') this.classes.clear();
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener as Listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      const candidate: FakeElement = current;
      const tagMatch = selector.match(/^[A-Za-z][A-Za-z0-9-]*/);
      const idMatch = selector.match(/#([A-Za-z0-9_-]+)/);
      const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
      const attributes = [
        ...selector.matchAll(/\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g),
      ];
      const tagMatches = !tagMatch || candidate.localName === tagMatch[0].toLowerCase();
      const idMatches = !idMatch || candidate.id === idMatch[1];
      const classMatches = classes.every((name) => candidate.classes.has(name));
      const attributeMatches = attributes.every((match) => {
        const value = candidate.getAttribute(match[1]);
        const expected = match[2] ?? match[3] ?? match[4];
        return value !== null && (expected === undefined || value === expected);
      });
      if (tagMatches && idMatches && classMatches && attributeMatches) return candidate;
      current = candidate.parentElement;
    }
    return null;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      for (const child of element.children) {
        if (child.closest(selector) === child) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  emit(
    type: string,
    init: Partial<
      Pick<
        FakeEvent,
        'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'keyCode'
      >
    > = {},
  ): FakeEvent {
    const event = new FakeEvent(type, this, init);
    let current: FakeElement | null = this;
    while (current) {
      for (const listener of current.listeners.get(type) ?? []) {
        listener(event as unknown as Event);
        if (event.immediatePropagationStopped) return event;
      }
      if (event.cancelBubble) break;
      current = current.parentElement;
    }
    return event;
  }
}

class FakeDocument {
  readonly documentElement: FakeElement;
  readonly defaultView: FakeWindow;
  activeElement: FakeElement | null = null;

  constructor() {
    this.documentElement = new FakeElement(this, 'html');
    this.defaultView = new FakeWindow();
  }

  createElementNS(namespace: string, localName: string): FakeElement {
    return new FakeElement(this, localName, namespace);
  }

  createTextNode(value: string): Text {
    const node = new FakeElement(this, '#text');
    node.nodeType = 3;
    node.textContent = value;
    return node as unknown as Text;
  }
}

class MemoryPreferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly listeners = new Map<string, Set<() => void>>();

  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  set(key: string, value: boolean | number | string): void {
    this.values.set(key, value);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }

  clear(key: string): void {
    this.values.delete(key);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }

  observe(key: string, listener: () => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => listeners.delete(listener);
  }
}

interface SettingsHarness {
  readonly document: FakeDocument;
  readonly root: FakeElement;
  readonly preferences: MemoryPreferences;
  readonly state: SettingsKeybindingsState;
  settings: SettingsKeybindings;
}

function mountSettings(
  preferences: MemoryPreferences,
  state: SettingsKeybindingsState,
  language: SettingsLanguage,
): SettingsHarness {
  const document = new FakeDocument();
  const root = document.createElementNS('http://www.w3.org/1999/xhtml', 'main');
  const settings = new SettingsKeybindings(
    { document } as unknown as MainWindow,
    root as unknown as HTMLElement,
    preferences,
    state,
    language,
  );
  return { document, root, preferences, state, settings };
}

function createPreferences(bindings: BindingMap = DEFAULT_BINDINGS): MemoryPreferences {
  const preferences = new MemoryPreferences();
  preferences.set(LANGUAGE_PREFERENCE_KEY, 'en');
  preferences.set(BINDINGS_PREFERENCE_KEY, encodeBindingOverrides(bindings));
  return preferences;
}

function createCustomReaderBindings(): {
  readonly bindings: BindingMap;
  readonly downKey: string;
  readonly upKey: string;
} {
  const bindings: Record<string, ActionId> = { ...DEFAULT_BINDINGS };
  const candidates = ['~', '!', '@', '#', '$', '%', '^', '&', '*', '_', '?', '`'];
  const occupied = new Set(
    Object.keys(bindings)
      .filter((key) => key.startsWith('reader-normal:'))
      .map((key) => key.slice('reader-normal:'.length)),
  );
  const downKey = candidates.find((key) => !occupied.has(key));
  if (!downKey) throw new Error('No unused test key is available');
  occupied.add(downKey);
  const upKey = candidates.find((key) => !occupied.has(key));
  if (!upKey) throw new Error('No second unused test key is available');
  bindings[`reader-normal:${downKey}`] = 'scrollDown';
  bindings[`reader-normal:${upKey}`] = 'scrollUp';
  return { bindings: Object.freeze(bindings), downKey, upKey };
}

function elements(root: FakeElement): FakeElement[] {
  const all: FakeElement[] = [root];
  for (const child of root.children) all.push(...elements(child));
  return all;
}

function editorState(state: SettingsKeybindingsState): BindingEditorState {
  if (!state.editor) throw new Error('Settings did not create an editor draft');
  return state.editor;
}

function byAccessibleLabel(root: FakeElement, label: string): FakeElement | undefined {
  return elements(root).find((element) => element.getAttribute('aria-label') === label);
}

function searchFor(
  root: FakeElement,
  query: string,
  language: SettingsLanguage = 'en',
): FakeElement {
  const search = byAccessibleLabel(root, settingsText(language, 'Search shortcuts'));
  if (!search) throw new Error('Search shortcuts control was not rendered');
  search.value = query;
  search.emit('input');
  return search;
}

function buttonNamed(root: FakeElement, label: string): FakeElement {
  const button = elements(root).find(
    (element) => element.localName === 'button' && element.textContent === label,
  );
  if (!button) throw new Error(`Could not find Settings button: ${label}`);
  return button;
}

function clickButton(root: FakeElement, label: string): void {
  const button = buttonNamed(root, label);
  button.focus();
  button.emit('click');
}

function actionCard(
  root: FakeElement,
  action: ActionId,
  context: BindingContext,
  language: SettingsLanguage = 'en',
): FakeElement | undefined {
  return elements(root).find((element) => {
    if (element.localName !== 'details' || element.children[0]?.localName !== 'summary')
      return false;
    const summary = element.children[0].textContent;
    return summary.includes(action) && summary.includes(contextLabel(context, language));
  });
}

function recordingTarget(root: FakeElement): FakeElement {
  const target = elements(root).find((element) => element.getAttribute('role') === 'group');
  if (!target) throw new Error('Key recording controls are not visible');
  return target;
}

function sendRecordedKey(
  harness: SettingsHarness,
  key: string,
  target = recordingTarget(harness.root),
  init: Partial<
    Pick<FakeEvent, 'isComposing' | 'keyCode' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>
  > = {},
): FakeEvent {
  const event = new FakeEvent('keydown', target, { ...init, key });
  harness.document.defaultView.dispatch(event);
  return event;
}

function unboundAction(state: SettingsKeybindingsState, context: BindingContext): ActionId {
  const entry = deriveBindingEditor(editorState(state)).catalog.find(
    (candidate) => candidate.context === context && candidate.source === 'unbound',
  );
  if (!entry) throw new Error(`No unbound action is available in ${context}`);
  return entry.action;
}

describe('Settings shortcut browser', () => {
  it('searches action IDs, keys, and localized contexts, and filters unbound/native records', () => {
    const { bindings, downKey } = createCustomReaderBindings();
    const preferences = createPreferences(bindings);
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const down = editorState(state).rows.find(
      (row) => row.mode === 'reader-normal' && row.action === 'scrollDown',
    );
    expect(down).toBeDefined();

    searchFor(harness.root, 'scrollDown');
    expect(actionCard(harness.root, 'scrollDown', 'reader-normal')).toBeDefined();
    searchFor(harness.root, downKey);
    expect(actionCard(harness.root, 'scrollDown', 'reader-normal')).toBeDefined();
    searchFor(harness.root, contextLabel('reader-normal', 'en'));
    expect(actionCard(harness.root, 'scrollDown', 'reader-normal')).toBeDefined();

    const group = deriveBindingEditor(editorState(state)).catalog.find(
      (entry) => entry.action === 'scrollDown' && entry.context === 'reader-normal',
    )?.group;
    const otherGroupAction = deriveBindingEditor(editorState(state)).catalog.find(
      (entry) => entry.context === 'reader-normal' && entry.group !== group,
    );
    if (group && otherGroupAction) {
      const groupFilter = byAccessibleLabel(harness.root, settingsText('en', 'All groups'));
      if (!groupFilter) throw new Error('Group filter was not rendered');
      groupFilter.value = group;
      groupFilter.emit('change');
      searchFor(harness.root, '');
      expect(actionCard(harness.root, otherGroupAction.action, 'reader-normal')).toBeUndefined();
    }

    const groupFilter = byAccessibleLabel(harness.root, settingsText('en', 'All groups'));
    if (!groupFilter) throw new Error('Group filter was not rendered');
    groupFilter.value = 'all';
    groupFilter.emit('change');

    const contextFilter = byAccessibleLabel(harness.root, settingsText('en', 'All contexts'));
    const availability = byAccessibleLabel(
      harness.root,
      settingsText('en', 'Show bound and unbound'),
    );
    if (!contextFilter || !availability) throw new Error('Shortcut filters were not rendered');
    contextFilter.value = 'reader-normal';
    contextFilter.emit('change');
    availability.value = 'unbound';
    availability.emit('change');
    const unbound = unboundAction(state, 'reader-normal');
    searchFor(harness.root, unbound);
    expect(actionCard(harness.root, unbound, 'reader-normal')).toBeDefined();
    expect(actionCard(harness.root, unbound, 'reader-normal')?.textContent).toContain(
      settingsText('en', 'Unbound'),
    );

    contextFilter.value = 'picker-input';
    contextFilter.emit('change');
    availability.value = 'all';
    availability.emit('change');
    const groups = byAccessibleLabel(harness.root, settingsText('en', 'All groups'));
    if (!groups) throw new Error('Group filter was not rendered');
    groups.value = 'all';
    groups.emit('change');
    searchFor(harness.root, 'Text / IME');
    expect(harness.root.textContent).toContain(settingsText('en', 'Native shortcuts'));
    expect(harness.root.textContent).toContain(
      settingsText('en', 'Read-only; Zotero or the operating system owns these keys.'),
    );
    expect(
      elements(harness.root).some(
        (element) =>
          element.localName === 'button' &&
          element.textContent === settingsText('en', 'Record keys'),
      ),
    ).toBe(false);
    harness.settings.dispose();
  });

  it('records Enter and Escape as keys, saves only on Apply, and discards an unfinished recording', () => {
    const preferences = createPreferences();
    const originalValue = preferences.get(BINDINGS_PREFERENCE_KEY, '');
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const action = unboundAction(state, 'reader-normal');

    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'reader-normal');
    if (!card) throw new Error('Action was not found by its ID');
    clickButton(card, settingsText('en', 'Add shortcut'));
    const enter = sendRecordedKey(harness, 'Enter');
    const escape = sendRecordedKey(harness, 'Escape');
    expect(enter.defaultPrevented).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(recordingTarget(harness.root).textContent).toContain('<Enter><Esc>');
    clickButton(harness.root, settingsText('en', 'Done'));

    const stateAfterDone = editorState(state);
    expect(
      stateAfterDone.rows.some(
        (row) =>
          row.mode === 'reader-normal' && row.action === action && row.key === '<Enter><Esc>',
      ),
    ).toBe(true);
    expect(preferences.get(BINDINGS_PREFERENCE_KEY, '')).toBe(originalValue);

    harness.settings.dispose();
    preferences.set(LANGUAGE_PREFERENCE_KEY, 'zh-CN');
    const reopened = mountSettings(preferences, state, 'zh-CN');
    searchFor(reopened.root, action, 'zh-CN');
    expect(
      byAccessibleLabel(reopened.root, settingsText('zh-CN', 'Search shortcuts')),
    ).toBeDefined();
    expect(actionCard(reopened.root, action, 'reader-normal', 'zh-CN')?.textContent).toContain(
      '<Enter><Esc>',
    );
    clickButton(reopened.root, settingsText('zh-CN', 'Apply bindings'));
    expect(
      shortcutsForAction(bindingsFromPreferences(preferences), 'reader-normal', action),
    ).toContain('<Enter><Esc>');

    const savedValue = preferences.get(BINDINGS_PREFERENCE_KEY, '');
    const rowsBeforeCancel = editorState(state).rows.length;
    const reopenedCard = actionCard(reopened.root, action, 'reader-normal', 'zh-CN');
    if (!reopenedCard) throw new Error('Recorded action disappeared after Apply');
    clickButton(reopenedCard, settingsText('zh-CN', 'Add shortcut'));
    sendRecordedKey(reopened, 'Escape');
    clickButton(reopened.root, settingsText('zh-CN', 'Cancel'));
    expect(editorState(state).rows).toHaveLength(rowsBeforeCancel);
    expect(preferences.get(BINDINGS_PREFERENCE_KEY, '')).toBe(savedValue);
    reopened.settings.dispose();
  });

  it('reports duplicate and prefix collisions while allowing the user to correct the draft', () => {
    const preferences = createPreferences();
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const candidates = deriveBindingEditor(editorState(state)).catalog.filter(
      (entry) => entry.context === 'reader-normal' && entry.source === 'unbound',
    );
    const first = candidates[0]?.action;
    const second = candidates.find((entry) => entry.action !== first)?.action;
    if (!first || !second)
      throw new Error('Two unbound Reader actions are needed for the collision case');
    const prefix = 'reader-normal:';
    const defaultSequences = Object.keys(DEFAULT_BINDINGS)
      .filter((key) => key.startsWith(prefix))
      .map((key) => bindingSequenceTokens(key.slice(prefix.length))?.[0]);
    const freeToken = ['~', '!', '@', '#', '$', '%', '^', '&', '*', '_', '?', '`'].find((token) =>
      defaultSequences.every((sequence) => sequence !== token),
    );
    if (!freeToken) throw new Error('No unused Reader key token is available');

    searchFor(harness.root, first);
    const firstCard = actionCard(harness.root, first, 'reader-normal');
    if (!firstCard) throw new Error('First unbound action was not found');
    clickButton(firstCard, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, freeToken);
    clickButton(harness.root, settingsText('en', 'Done'));

    searchFor(harness.root, second);
    const secondCard = actionCard(harness.root, second, 'reader-normal');
    if (!secondCard) throw new Error('Second unbound action was not found');
    clickButton(secondCard, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, freeToken);
    clickButton(harness.root, settingsText('en', 'Done'));
    expect(
      deriveBindingEditor(editorState(state)).validation.errors.some(
        (issue) => issue.kind === 'duplicate',
      ),
    ).toBe(true);
    expect(actionCard(harness.root, second, 'reader-normal')?.textContent).toContain(
      settingsText('en', 'Duplicate mode and key sequence.'),
    );
    expect(buttonNamed(harness.root, settingsText('en', 'Apply bindings')).disabled).toBe(true);

    const conflictedCard = actionCard(harness.root, second, 'reader-normal');
    if (!conflictedCard) throw new Error('Conflicting action was not found for correction');
    clickButton(conflictedCard, settingsText('en', 'Record keys'));
    sendRecordedKey(harness, freeToken);
    sendRecordedKey(harness, 'y');
    clickButton(harness.root, settingsText('en', 'Done'));
    expect(
      editorState(state).rows.some(
        (row) => row.mode === 'reader-normal' && row.action === first && row.key === freeToken,
      ),
    ).toBe(true);
    expect(
      deriveBindingEditor(editorState(state)).validation.errors.some(
        (issue) => issue.kind === 'duplicate',
      ),
    ).toBe(false);
    expect(
      deriveBindingEditor(editorState(state)).validation.warnings.some(
        (issue) => issue.kind === 'prefix',
      ),
    ).toBe(true);
    expect(harness.root.textContent).toContain(
      settingsText('en', 'Strict prefix of another sequence.'),
    );
    expect(buttonNamed(harness.root, settingsText('en', 'Apply bindings')).disabled).toBe(false);
    harness.settings.dispose();
  });

  it('shows native reservation errors and permits editing the invalid draft', () => {
    const preferences = createPreferences();
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const action = unboundAction(state, 'picker-input');
    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'picker-input');
    if (!card) throw new Error('Picker action was not found');
    clickButton(card, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, 'a');
    clickButton(harness.root, settingsText('en', 'Done'));
    expect(
      deriveBindingEditor(editorState(state)).validation.errors.some(
        (issue) => issue.kind === 'native',
      ),
    ).toBe(true);
    expect(actionCard(harness.root, action, 'picker-input')?.textContent).toContain(
      settingsText('en', 'Native key is reserved by Zotero or text editing.'),
    );
    expect(buttonNamed(harness.root, settingsText('en', 'Apply bindings')).disabled).toBe(true);

    const invalidCard = actionCard(harness.root, action, 'picker-input');
    if (!invalidCard) throw new Error('Invalid draft action disappeared');
    clickButton(invalidCard, settingsText('en', 'Record keys'));
    sendRecordedKey(harness, 'F12');
    clickButton(harness.root, settingsText('en', 'Done'));
    expect(
      deriveBindingEditor(editorState(state)).validation.errors.some(
        (issue) => issue.kind === 'native',
      ),
    ).toBe(false);
    expect(deriveBindingEditor(editorState(state)).validation.valid).toBe(true);
    harness.settings.dispose();
  });

  it('keeps query text and IME events outside active key recording', () => {
    const preferences = createPreferences();
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const action = unboundAction(state, 'picker-input');
    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'picker-input');
    if (!card) throw new Error('Picker action was not found');
    clickButton(card, settingsText('en', 'Add shortcut'));
    const target = recordingTarget(harness.root);
    const composing = sendRecordedKey(harness, 'Process', target, {
      isComposing: true,
      keyCode: 229,
    });
    expect(composing.defaultPrevented).toBe(false);
    expect(target.textContent).not.toContain('<Process>');

    const search = byAccessibleLabel(harness.root, settingsText('en', 'Search shortcuts'));
    if (!search) throw new Error('Search input was not rendered');
    const nativeInputKey = new FakeEvent('keydown', search, { key: 'a' });
    harness.document.defaultView.dispatch(nativeInputKey);
    expect(nativeInputKey.defaultPrevented).toBe(false);
    const rowsBeforeInput = editorState(state).rows.length;
    search.value = 'scrollDown';
    search.emit('input');
    expect(editorState(state).rows).toHaveLength(rowsBeforeInput);
    expect(elements(harness.root).some((element) => element.getAttribute('role') === 'group')).toBe(
      false,
    );
    harness.settings.dispose();
  });

  it('unbinds and resets one action without dropping another custom control', () => {
    const { bindings, upKey } = createCustomReaderBindings();
    const preferences = createPreferences(bindings);
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    searchFor(harness.root, 'scrollDown');
    const downCard = actionCard(harness.root, 'scrollDown', 'reader-normal');
    if (!downCard) throw new Error('Reader scroll action was not found');
    clickButton(downCard, settingsText('en', 'Unbind this action'));
    expect(
      editorState(state).rows.some(
        (row) => row.mode === 'reader-normal' && row.action === 'scrollDown',
      ),
    ).toBe(false);
    expect(
      editorState(state).rows.some(
        (row) => row.mode === 'reader-normal' && row.action === 'scrollUp' && row.key === upKey,
      ),
    ).toBe(true);

    const unboundCard = actionCard(harness.root, 'scrollDown', 'reader-normal');
    if (!unboundCard) throw new Error('Unbound Reader action was not found');
    clickButton(unboundCard, settingsText('en', 'Reset this action'));
    const draftBindings = editorState(state).rows.reduce<Record<string, ActionId>>((map, row) => {
      if (row.key && row.action) map[`${row.mode}:${row.key}`] = row.action as ActionId;
      return map;
    }, {});
    expect(shortcutsForAction(draftBindings, 'reader-normal', 'scrollDown')).toEqual(
      shortcutsForAction(DEFAULT_BINDINGS, 'reader-normal', 'scrollDown'),
    );
    expect(
      editorState(state).rows.some(
        (row) => row.mode === 'reader-normal' && row.action === 'scrollUp' && row.key === upKey,
      ),
    ).toBe(true);

    clickButton(harness.root, settingsText('en', 'Apply bindings'));
    const saved = bindingsFromPreferences(preferences);
    expect(shortcutsForAction(saved, 'reader-normal', 'scrollDown')).toEqual(
      shortcutsForAction(DEFAULT_BINDINGS, 'reader-normal', 'scrollDown'),
    );
    expect(saved[`reader-normal:${upKey}`]).toBe('scrollUp');
    harness.settings.dispose();
  });

  it('restores the edited action after recording, cancellation, unbind and reset', () => {
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(createPreferences(), state, 'en');
    const action = unboundAction(state, 'reader-normal');
    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'reader-normal');
    if (!card) throw new Error('Unbound action was not found');
    clickButton(card, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, 'F2');
    clickButton(harness.root, settingsText('en', 'Done'));
    const assertActionFocus = () => {
      const current = actionCard(harness.root, action, 'reader-normal');
      expect(harness.document.activeElement).toBe(current?.children[0]);
      expect(elements(harness.root)).toContain(harness.document.activeElement);
      return current!;
    };
    clickButton(assertActionFocus(), settingsText('en', 'Add shortcut'));
    clickButton(harness.root, settingsText('en', 'Cancel'));
    clickButton(assertActionFocus(), settingsText('en', 'Unbind this action'));
    clickButton(assertActionFocus(), settingsText('en', 'Reset this action'));
    assertActionFocus();
    harness.settings.dispose();
  });

  it('focuses Apply when recording removes an action from the Unbound filter', () => {
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(createPreferences(), state, 'en');
    const action = unboundAction(state, 'reader-normal');
    const availability = byAccessibleLabel(
      harness.root,
      settingsText('en', 'Show bound and unbound'),
    );
    if (!availability) throw new Error('Availability filter was not rendered');
    availability.value = 'unbound';
    availability.emit('change');
    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'reader-normal');
    if (!card) throw new Error('Unbound action was not found');
    clickButton(card, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, 'F2');
    clickButton(harness.root, settingsText('en', 'Done'));
    expect(actionCard(harness.root, action, 'reader-normal')).toBeUndefined();
    const apply = buttonNamed(harness.root, settingsText('en', 'Apply bindings'));
    expect(apply.disabled).toBe(false);
    expect(harness.document.activeElement).toBe(apply);
    harness.settings.dispose();
  });

  it('repairs an incompatible carried row without offering a recorder or deleting other bindings', () => {
    const state: SettingsKeybindingsState = { editor: null };
    const preferences = createPreferences();
    const initial = mountSettings(preferences, state, 'en');
    const draft = editorState(state);
    initial.settings.dispose();
    const invalidId = draft.nextRowId;
    state.editor = {
      ...draft,
      rows: [...draft.rows, { id: invalidId, mode: 'picker-input', key: '<F2>', action: 'zoomIn' }],
      nextRowId: invalidId + 1,
    };
    const harness = mountSettings(preferences, state, 'en');
    const remove = buttonNamed(harness.root, settingsText('en', 'Delete binding'));
    expect(
      remove.parentElement?.querySelector('button[data-shortcut-operation="record"]'),
    ).toBeNull();
    expect(buttonNamed(harness.root, settingsText('en', 'Apply bindings')).disabled).toBe(true);
    remove.focus();
    remove.emit('click');
    expect(editorState(state).rows).toEqual(draft.rows);
    expect(deriveBindingEditor(editorState(state)).validation.valid).toBe(true);
    expect(harness.document.activeElement).toBe(
      byAccessibleLabel(harness.root, settingsText('en', 'Search shortcuts')),
    );
    harness.settings.dispose();
  });

  it('keeps a failed Apply draft and retries without losing the saved baseline', () => {
    const preferences = createPreferences();
    const baseline = preferences.get(BINDINGS_PREFERENCE_KEY, '');
    const state: SettingsKeybindingsState = { editor: null };
    const harness = mountSettings(preferences, state, 'en');
    const action = unboundAction(state, 'reader-normal');
    searchFor(harness.root, action);
    const card = actionCard(harness.root, action, 'reader-normal');
    if (!card) throw new Error('Unbound action was not found');
    clickButton(card, settingsText('en', 'Add shortcut'));
    sendRecordedKey(harness, 'F2');
    clickButton(harness.root, settingsText('en', 'Done'));
    const stagedRows = editorState(state).rows;
    const originalSet = preferences.set.bind(preferences);
    preferences.set = (key, value) => {
      if (key === BINDINGS_PREFERENCE_KEY) throw new Error('Preference write denied');
      originalSet(key, value);
    };
    clickButton(harness.root, settingsText('en', 'Apply bindings'));
    expect(preferences.get(BINDINGS_PREFERENCE_KEY, '')).toBe(baseline);
    expect(editorState(state).saveOutcome).toBe('save-failed');
    expect(editorState(state).rows).toEqual(stagedRows);
    expect(deriveBindingEditor(editorState(state)).dirty).toBe(true);
    expect(buttonNamed(harness.root, settingsText('en', 'Apply bindings')).disabled).toBe(false);
    preferences.set = originalSet;
    clickButton(harness.root, settingsText('en', 'Apply bindings'));
    expect(
      shortcutsForAction(bindingsFromPreferences(preferences), 'reader-normal', action),
    ).toContain('<F2>');
    expect(editorState(state).saveOutcome).toBe('saved');
    expect(deriveBindingEditor(editorState(state)).dirty).toBe(false);
    harness.settings.dispose();
  });
});
