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
import { SettingsAppearance } from '../../src/main/settings-appearance';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly style: Record<string, string> = { cssText: '' };
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
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
  addEventListener(key: string, listener: () => void): void {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
  }
  removeEventListener(key: string, listener: () => void): void {
    this.listeners.get(key)?.delete(listener);
  }
  fire(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) listener();
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
  constructor(initial: Record<string, string> = {}) {
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
  version: 1,
  light: {
    selection: '#FF0000',
    visual: '#00FF00',
    statusBackground: '#FAFAFA',
    statusForeground: '#202020',
    statusBorder: '#AAAAAA',
  },
  dark: {
    selection: '#FF00FF',
    visual: '#00FFFF',
    statusBackground: '#161616',
    statusForeground: '#F0F0F0',
    statusBorder: '#555555',
  },
  markerWidth: 1,
  statusStyle: 'tinted',
};
const stored = serializeCustomInteractionThemes({ version: 1, themes: [custom] });

function mount(initial: Record<string, string> = {}) {
  const preferences = new Preferences(initial);
  const source = { theme: 'light' as const, observe: () => () => {} };
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
  );
  return { root, preferences, manager, appearance };
}

describe('Settings Appearance', () => {
  it('renders built-in and custom cards, swatches, active state, and selects without unrelated writes', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    for (const name of ['Primer Neutral', 'Soft Academic', 'Yazi-like', 'Study'])
      expect(test.root.textContent).toContain(name);
    expect(
      test.root
        .all()
        .filter((node) => node.textContent.includes('Selection #') && node.tag === 'span'),
    ).toHaveLength(4);
    expect(
      test.root
        .all()
        .find((node) => node.dataset.themeId === custom.id)
        ?.getAttribute('aria-current'),
    ).toBe('true');
    test.root.click('button', 'Select');
    expect(test.preferences.writes).toEqual([[PRESET, 'primer-neutral']]);
    expect(test.manager.appearance.colorPreset).toBe('primer-neutral');
    test.root.labelled('Select Study').fire('click');
    expect(test.preferences.writes.at(-1)).toEqual([PRESET, custom.id]);
    test.appearance.dispose();
  });

  it('opens New and Duplicate with seeded independent palettes, preserving inputs through live preview', () => {
    const test = mount({ [PRESET]: 'soft-academic' });
    test.root.click('button', '+ New theme');
    const editor = test.root.children[0];
    const hex = test.root.labelled('Selection color hex');
    hex.value = '#abcdef';
    hex.fire('input');
    expect(test.root.children[0]).toBe(editor);
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.labelled('Theme preview').textContent).toContain('#ABCDEF');
    test.root.click('button', 'Dark');
    expect(test.root.labelled('Theme preview').textContent).toContain('Dark');
    test.root.input('#123456', 'Selection color hex');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    expect(test.root.labelled('Theme preview').textContent).toContain('#123456');
    test.root.click('button', 'Light');
    expect(test.root.labelled('Selection color hex').value).toBe('#abcdef');
    expect(test.root.labelled('Theme preview').textContent).toContain('#ABCDEF');
    test.root.click('button', 'Cancel / Back');
    expect(test.manager.appearance.colorPreset).toBe('soft-academic');
    expect(test.preferences.writes).toEqual([]);
    test.root.click('button', 'Duplicate current');
    expect(test.root.find('label', 'Theme name').children[0]?.value).toBe('Soft Academic copy');
    test.appearance.dispose();
  });

  it('keeps invalid hex visible without applying it, validates name and width, then previews valid changes', () => {
    const test = mount();
    const draft = vi.spyOn(test.manager, 'setDraft');
    test.root.click('button', '+ New theme');
    const initial = draft.mock.calls.length;
    const hex = test.root.input('oops', 'Selection color hex');
    expect(hex.value).toBe('oops');
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(draft).toHaveBeenCalledTimes(initial);
    expect(test.root.find('button', 'Save').disabled).toBe(true);
    const name = test.root.find('label', 'Theme name').children[0]!;
    name.value = '   ';
    name.fire('input');
    expect(test.root.find('button', 'Save').disabled).toBe(true);
    name.value = 'Personal';
    name.fire('input');
    test.root.input('#112233', 'Selection color hex');
    const width = test.root.find('label', 'Marker width (1–4 CSS px) ').children[0]!;
    width.value = '4';
    width.fire('input');
    test.root.click('button', 'Tinted');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#112233');
    expect(test.manager.appearance.marker.width).toBe(4);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    expect(test.root.find('button', 'Tinted').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.find('button', 'Save').disabled).toBe(false);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispose();
  });

  it('edits a custom theme in place and preserves its other palette and width', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Edit');
    expect(test.root.find('label', 'Theme name').children[0]?.value).toBe('Study');
    test.root.input('#123456', 'Visual color hex');
    test.root.click('button', 'Save');
    const themes = parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes;
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      id: custom.id,
      light: { visual: '#123456' },
      dark: custom.dark,
      markerWidth: 1,
      statusStyle: 'tinted',
    });
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    test.appearance.dispose();
  });

  it('saves store before active preset, clears draft and rolls back when preset persistence fails', () => {
    const test = mount();
    test.root.click('button', '+ New theme');
    test.root.input('#123456', 'Selection color hex');
    test.root.click('button', 'Save');
    expect(test.preferences.writes.map(([key]) => key)).toEqual([CUSTOM, PRESET]);
    const id = test.preferences.get(PRESET, '');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.light.selection,
    ).toBe('#123456');
    expect(test.manager.appearance.colorPreset).toBe(id);
    expect(test.root.textContent).toContain('Active');
    test.appearance.dispose();

    const failed = mount({ [PRESET]: 'soft-academic' });
    failed.root.click('button', '+ New theme');
    failed.preferences.failPreset = true;
    failed.root.click('button', 'Save');
    expect(failed.preferences.get(CUSTOM, '')).toBe('');
    expect(failed.preferences.get(PRESET, '')).toBe('soft-academic');
    expect(failed.root.textContent).toContain('Could not save theme');
    failed.root.click('button', 'Cancel / Back');
    expect(failed.manager.appearance.colorPreset).toBe('soft-academic');
    failed.appearance.dispose();
  });

  it('requires two steps to delete custom themes and falls back if active', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Delete');
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.textContent).toContain('Confirm delete');
    test.root.click('button', 'Confirm delete');
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes).toEqual([]);
    expect(test.preferences.get(PRESET, '')).toBe('primer-neutral');
    expect(test.manager.appearance.colorPreset).toBe('primer-neutral');
    expect(test.root.textContent).not.toContain('Study');
    test.appearance.dispose();
  });

  it('disposes drafts and preference observers without writing state', () => {
    const test = mount({ [PRESET]: 'yazi-like' });
    test.root.click('button', '+ New theme');
    test.root.input('#abcdef', 'Selection color hex');
    test.appearance.dispose();
    expect(test.manager.appearance.colorPreset).toBe('yazi-like');
    expect(test.preferences.writes).toEqual([]);
    expect(test.preferences.listenerCount()).toBe(4);
    test.manager.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
  });
});
