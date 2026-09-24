import { describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY as PRESET,
  INTERACTION_CUSTOM_THEMES_PREFERENCE_KEY as CUSTOM,
  InteractionAppearanceManager,
  parseCustomInteractionThemes,
  serializeCustomInteractionThemes,
  type CustomInteractionTheme,
} from '../../src/main/interaction-appearance';
import {
  SettingsAppearance,
  type SettingsAppearanceState,
} from '../../src/main/settings-appearance';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly style: Record<string, string> = { cssText: '' };
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: MouseEvent) => void>>();
  value = '';
  type = '';
  disabled = false;
  maxLength = 0;
  min = '';
  max = '';
  step = '';
  private content = '';
  constructor(readonly tag: string) {}
  get textContent(): string {
    return this.content + this.children.map((child) => child.textContent).join('');
  }
  set textContent(value: string) {
    this.content = value;
    this.children.length = 0;
  }
  append(...children: ElementFake[]): void {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementFake[]): void {
    this.content = '';
    this.children.splice(0, this.children.length, ...children);
  }
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }
  addEventListener(key: string, listener: (event: MouseEvent) => void): void {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
  }
  removeEventListener(key: string, listener: (event: MouseEvent) => void): void {
    this.listeners.get(key)?.delete(listener);
  }
  fire(key: string, target: ElementFake = this): void {
    for (const listener of this.listeners.get(key) ?? [])
      listener({ target } as unknown as MouseEvent);
  }
  all(): ElementFake[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  find(tag: string, text: string): ElementFake {
    const match = this.all().find((node) => node.tag === tag && node.textContent === text);
    if (!match) throw new Error(`Missing ${tag}: ${text}`);
    return match;
  }
  labelled(label: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('aria-label') === label);
    if (!match) throw new Error(`Missing label: ${label}`);
    return match;
  }
  click(tag: string, text: string): void {
    this.find(tag, text).fire('click');
  }
  input(value: string, label: string): ElementFake {
    const field = this.labelled(label);
    field.value = value;
    field.fire('input');
    return field;
  }
}

class Preferences implements PreferenceStore {
  readonly data = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failPreset = false;
  failCustom = false;
  constructor(initial: Record<string, boolean | number | string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }
  has(key: string): boolean {
    return this.data.has(key);
  }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.data.get(key) ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    if (key === PRESET && this.failPreset) throw new Error('write failure');
    if (key === CUSTOM && this.failCustom) throw new Error('store write failure');
    this.writes.push([key, value]);
    this.data.set(key, value);
    for (const observer of this.observers.get(key) ?? []) observer();
  }
  observe(key: string, listener: () => void): () => void {
    const listeners = this.observers.get(key) ?? new Set();
    listeners.add(listener);
    this.observers.set(key, listeners);
    return () => listeners.delete(listener);
  }
  listenerCount(): number {
    return [...this.observers.values()].reduce((count, group) => count + group.size, 0);
  }
}

const custom: CustomInteractionTheme = {
  id: 'custom:study',
  name: 'Study',
  version: 2,
  light: {
    black: '#202020',
    red: '#AA0000',
    green: '#00FF00',
    yellow: '#FF0000',
    blue: '#0000AA',
    magenta: '#AA00AA',
    cyan: '#00AAAA',
    white: '#FAFAFA',
  },
  dark: {
    black: '#161616',
    red: '#FF2222',
    green: '#00FFFF',
    yellow: '#FF00FF',
    blue: '#2222FF',
    magenta: '#AA00AA',
    cyan: '#00AAAA',
    white: '#F0F0F0',
  },
};
const stored = serializeCustomInteractionThemes({ version: 2, themes: [custom] });

function mount(
  initial: Record<string, boolean | number | string> = {},
  state: SettingsAppearanceState = { view: 'library', editingThemeId: null, paletteMode: 'light' },
  mode: 'light' | 'dark' = 'light',
) {
  const preferences = new Preferences(initial);
  const source = { theme: mode, observe: () => () => {} };
  const manager = new InteractionAppearanceManager(preferences, source);
  const root = new ElementFake('section');
  const document = {
    createElementNS: (_ns: string, tag: string) => new ElementFake(tag),
    defaultView: { crypto: { randomUUID: () => 'opaque-123' } },
  };
  const appearance = new SettingsAppearance(
    { document } as never,
    root as never,
    preferences,
    manager,
    state,
  );
  return { root, preferences, manager, appearance, state, document };
}

describe('Settings Appearance autosave', () => {
  it('renders canonical built-ins and custom cards with eight current-mode swatches', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id }, undefined, 'dark');
    for (const name of ['Zotero', 'Catppuccin', 'Tokyo Night', 'Gruvbox', 'Study'])
      expect(test.root.textContent).toContain(name);
    const cards = test.root.all().filter((node) => node.dataset.themeId);
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      const labels = card
        .all()
        .filter((node) => node.tag === 'span' && node.getAttribute('aria-label'))
        .map((node) => node.getAttribute('aria-label')!.split(' ')[0]);
      expect(labels).toEqual([
        'Black',
        'Red',
        'Green',
        'Yellow',
        'Blue',
        'Magenta',
        'Cyan',
        'White',
      ]);
    }
    expect(
      cards[0]?.all().some((node) => node.getAttribute('aria-label') === 'Black #2E3440'),
    ).toBe(true);
    expect(
      cards.find((card) => card.dataset.themeId === custom.id)?.getAttribute('aria-current'),
    ).toBe('true');
    expect(
      test.root
        .all()
        .find((node) => node.style.cssText.includes('grid-template-columns:repeat(auto-fit')),
    ).toBeDefined();
    expect(test.root.textContent).not.toContain('Save');
    expect(test.root.textContent).not.toContain('Cancel');
    test.appearance.dispose();
  });

  it('selects a card immediately without changing width or status style', () => {
    const test = mount({
      [CUSTOM]: stored,
      [PRESET]: custom.id,
      ['appearance.interaction.markerWidth']: 1,
      ['appearance.interaction.statusStyle']: 'tinted',
    });
    const card = test.root.all().find((node) => node.dataset.themeId === 'gruvbox')!;
    card.fire('click');
    expect(test.preferences.writes).toEqual([[PRESET, 'gruvbox']]);
    expect(test.manager.appearance.colorPreset).toBe('gruvbox');
    expect(test.manager.appearance.marker.width).toBe(1);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    const catppuccin = test.root.all().find((node) => node.dataset.themeId === 'catppuccin')!;
    const swatch = catppuccin
      .all()
      .find((node) => node.getAttribute('aria-label') === 'Blue #1E66F5')!;
    catppuccin.fire('click', swatch);
    expect(test.manager.appearance.colorPreset).toBe('catppuccin');
    test.appearance.dispose();
  });

  it('immediately persists global marker width and status style independently', () => {
    const test = mount({ [PRESET]: 'zotero', ['appearance.interaction.markerWeight']: 'strong' });
    expect(test.root.find('button', '4px').getAttribute('aria-pressed')).toBe('true');
    test.root.click('button', '1px');
    expect(test.preferences.writes).toEqual([['appearance.interaction.markerWidth', 1]]);
    expect(test.manager.appearance.marker.width).toBe(1);
    test.root.click('button', 'Tinted');
    expect(test.preferences.writes.at(-1)).toEqual([
      'appearance.interaction.statusStyle',
      'tinted',
    ]);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    test.root.labelled('Select Catppuccin').fire('click');
    expect(test.manager.appearance.marker.width).toBe(1);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    test.appearance.dispose();
  });

  it('creates a persisted v2 copy of the active theme before opening an active editor', () => {
    const test = mount({ [PRESET]: 'catppuccin' });
    const draft = vi.spyOn(test.manager, 'setDraft');
    const clear = vi.spyOn(test.manager, 'clearDraft');
    test.root.click('button', '+ Custom');
    const id = test.preferences.get(PRESET, '');
    expect(test.preferences.writes.map(([key]) => key)).toEqual([CUSTOM, PRESET]);
    expect(test.state).toMatchObject({ view: 'editor', editingThemeId: id });
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]).toEqual({
      id,
      name: 'New theme',
      version: 2,
      light: expect.objectContaining({ yellow: '#DF8E1D' }),
      dark: expect.objectContaining({ green: '#A6E3A1' }),
    });
    expect(
      test.root.all().filter((node) => node.tag === 'input' && node.type === 'color'),
    ).toHaveLength(8);
    expect(test.root.textContent).toContain('Selection = Yellow');
    expect(test.root.textContent).toContain('Visual = Green');
    expect(test.root.textContent).not.toContain('Save');
    expect(test.root.textContent).not.toContain('Cancel');
    test.root.input('#123456', 'Yellow hex');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.light.yellow,
    ).toBe('#123456');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#123456');
    test.root.click('button', 'Back to themes');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#123456');
    expect(draft).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    test.appearance.dispose();
  });

  it('seeds + Custom from the full active custom palette without changing global controls', () => {
    const test = mount({
      [CUSTOM]: stored,
      [PRESET]: custom.id,
      ['appearance.interaction.markerWidth']: 2,
      ['appearance.interaction.statusStyle']: 'tinted',
    });
    test.root.click('button', '+ Custom');
    const themes = parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes;
    expect(themes).toHaveLength(2);
    expect(themes[1]?.light).toEqual(custom.light);
    expect(themes[1]?.dark).toEqual(custom.dark);
    expect(test.preferences.get(PRESET, '')).toBe(themes[1]?.id);
    expect(test.manager.appearance.marker.width).toBe(2);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    expect(test.preferences.writes.map(([key]) => key)).toEqual([CUSTOM, PRESET]);
    test.appearance.dispose();
  });

  it('keeps invalid hex and name visible without writes, then autosaves valid input without replacing it', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: 'zotero' });
    test.root.click('button', 'Edit');
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    const hex = test.root.input('#ff', 'Yellow hex');
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(hex.value).toBe('#ff');
    expect(test.preferences.writes).toEqual([[PRESET, custom.id]]);
    const name = test.root.input('   ', 'Theme name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(test.preferences.writes).toHaveLength(1);
    hex.value = '#abcdef';
    hex.fire('input');
    expect(hex.value).toBe('#abcdef');
    expect(test.root.labelled('Yellow hex')).toBe(hex);
    expect(test.root.labelled('Theme name')).toBe(name);
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    name.value = '  Study 2  ';
    name.fire('input');
    expect(test.root.labelled('Theme name')).toBe(name);
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.name).toBe(
      'Study 2',
    );
    expect(test.preferences.writes.map(([key]) => key)).toEqual([PRESET, CUSTOM, CUSTOM]);
    test.appearance.dispose();
  });

  it('persists color picker commits and restores editor target and tab on reopen', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Edit');
    test.root.click('button', 'Dark');
    const picker = test.root.labelled('Green color picker');
    picker.value = '#123456';
    picker.fire('change');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.dark.green,
    ).toBe('#123456');
    expect(test.root.labelled('Green hex').value).toBe('#123456');
    test.appearance.dispose();
    const reopenedRoot = new ElementFake('section');
    const reopened = new SettingsAppearance(
      { document: test.document } as never,
      reopenedRoot as never,
      test.preferences,
      test.manager,
      test.state,
    );
    expect(test.state).toMatchObject({
      view: 'editor',
      editingThemeId: custom.id,
      paletteMode: 'dark',
    });
    expect(reopenedRoot.labelled('Green hex').value).toBe('#123456');
    expect(reopenedRoot.find('button', 'Dark').getAttribute('aria-pressed')).toBe('true');
    reopened.dispose();
    test.preferences.set(CUSTOM, serializeCustomInteractionThemes({ version: 2, themes: [] }));
    const fallback = new SettingsAppearance(
      { document: test.document } as never,
      reopenedRoot as never,
      test.preferences,
      test.manager,
      test.state,
    );
    expect(test.state.view).toBe('library');
    expect(reopenedRoot.textContent).toContain('Themes');
    fallback.dispose();
    test.manager.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
  });

  it('deletes a custom in two steps and restores Zotero when active', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Delete');
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.textContent).toContain('Confirm delete');
    test.root.click('button', 'Confirm delete');
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes).toEqual([]);
    expect(test.preferences.get(PRESET, '')).toBe('zotero');
    expect(test.manager.appearance.colorPreset).toBe('zotero');
    test.appearance.dispose();
  });

  it('restores the persisted theme if active-ID fallback fails during deletion', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.preferences.failPreset = true;
    test.root.click('button', 'Delete');
    test.root.click('button', 'Confirm delete');
    expect(test.root.textContent).toContain('Could not delete theme');
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes).toEqual([custom]);
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    expect(test.manager.appearance.colors.selectionMarker).toBe(custom.light.yellow);
    test.appearance.dispose();
  });

  it('rolls back failed creation and leaves failed edits at their last persisted value', () => {
    const failed = mount({ [PRESET]: 'zotero' });
    failed.preferences.failPreset = true;
    failed.root.click('button', '+ Custom');
    expect(failed.preferences.get(CUSTOM, '')).toBe('');
    expect(failed.preferences.get(PRESET, '')).toBe('zotero');
    expect(failed.root.textContent).toContain('Could not create theme');
    failed.appearance.dispose();

    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Edit');
    test.preferences.failCustom = true;
    const hex = test.root.input('#123456', 'Yellow hex');
    expect(hex.value).toBe('#123456');
    expect(test.root.textContent).toContain('Could not save change');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#FF0000');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.light.yellow,
    ).toBe('#FF0000');
    test.appearance.dispose();
  });
});
