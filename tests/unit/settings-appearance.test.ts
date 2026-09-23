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

function mount(initial: Record<string, boolean | number | string> = {}) {
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
    for (const name of ['Zotero', 'Catppuccin', 'Tokyo Night', 'Gruvbox', 'Study'])
      expect(test.root.textContent).toContain(name);
    expect(
      test.root
        .all()
        .filter((node) => node.textContent.includes('Selection #') && node.tag === 'span'),
    ).toHaveLength(5);
    expect(
      test.root
        .all()
        .find((node) => node.dataset.themeId === custom.id)
        ?.getAttribute('aria-current'),
    ).toBe('true');
    const activeCard = test.root.all().find((node) => node.dataset.themeId === custom.id)!;
    expect(activeCard.style.cssText).toContain('border:2px solid var(--zotero-neo-accent)');
    expect(activeCard.style.cssText).toContain('background:var(--zotero-neo-selected)');
    expect(test.root.labelled('Select Study').style.background).toBe('var(--zotero-neo-accent)');
    test.root.click('button', 'Select');
    expect(test.preferences.writes).toEqual([[PRESET, 'zotero']]);
    expect(test.manager.appearance.colorPreset).toBe('zotero');
    test.root.labelled('Select Study').fire('click');
    expect(test.preferences.writes.at(-1)).toEqual([PRESET, custom.id]);
    test.appearance.dispose();
  });

  it('shows the normalized active card for a legacy persisted ID without writing it', () => {
    const test = mount({ [PRESET]: 'yazi-like' });
    expect(
      test.root
        .all()
        .find((node) => node.dataset.themeId === 'catppuccin')
        ?.getAttribute('aria-current'),
    ).toBe('true');
    expect(test.preferences.get(PRESET, '')).toBe('yazi-like');
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispose();
  });

  it('opens New and Duplicate with seeded independent palettes, preserving inputs through live preview', () => {
    const test = mount({ [PRESET]: 'catppuccin' });
    test.root.click('button', '+ New theme');
    const editor = test.root.children[0];
    const hex = test.root.labelled('Yellow hex');
    hex.value = '#abcdef';
    hex.fire('input');
    expect(test.root.children[0]).toBe(editor);
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    expect(test.root.find('button', 'Light').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.find('button', 'Light').style.background).toBe('var(--zotero-neo-selected)');
    expect(test.root.find('button', 'Dark').style.background).toBe('var(--zotero-neo-input)');
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.labelled('Theme preview').textContent).toContain('#ABCDEF');
    test.root.click('button', 'Dark');
    expect(test.root.find('button', 'Dark').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.find('button', 'Dark').style.background).toBe('var(--zotero-neo-selected)');
    expect(test.root.find('button', 'Light').style.background).toBe('var(--zotero-neo-input)');
    expect(test.root.labelled('Theme preview').textContent).toContain('Dark');
    test.root.input('#123456', 'Yellow hex');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#ABCDEF');
    expect(test.root.labelled('Theme preview').textContent).toContain('#123456');
    test.root.click('button', 'Light');
    expect(test.root.labelled('Yellow hex').value).toBe('#abcdef');
    expect(test.root.labelled('Theme preview').textContent).toContain('#ABCDEF');
    test.root.click('button', 'Cancel / Back');
    expect(test.manager.appearance.colorPreset).toBe('catppuccin');
    expect(test.preferences.writes).toEqual([]);
    test.root.click('button', 'Duplicate current');
    expect(test.root.find('label', 'Theme name').children[0]?.value).toBe('Catppuccin copy');
    test.appearance.dispose();
  });

  it('keeps invalid hex visible without applying it, validates name and width, then previews valid changes', () => {
    const test = mount();
    const draft = vi.spyOn(test.manager, 'setDraft');
    test.root.click('button', '+ New theme');
    const initial = draft.mock.calls.length;
    const hex = test.root.input('oops', 'Yellow hex');
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
    test.root.input('#112233', 'Yellow hex');
    const width = test.root.find('label', 'Marker width (1–4 CSS px) ').children[0]!;
    width.value = '4';
    width.fire('input');
    test.root.click('button', 'Tinted');
    expect(test.manager.appearance.colors.selectionMarker).toBe('#112233');
    expect(test.manager.appearance.marker.width).toBe(3);
    expect(test.manager.appearance.statusStyle).toBe('neutral');
    expect(test.root.find('button', 'Tinted').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.find('button', 'Tinted').style.background).toBe('var(--zotero-neo-selected)');
    expect(test.root.find('button', 'Neutral').style.background).toBe('var(--zotero-neo-input)');
    expect(test.root.find('button', 'Save').disabled).toBe(false);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispose();
  });
  it('keeps actions anchored and previews derived status for either palette without writes', () => {
    const test = mount({
      [CUSTOM]: stored,
      [PRESET]: custom.id,
      ['appearance.interaction.markerWidth']: 1,
      ['appearance.interaction.statusStyle']: 'tinted',
    });
    test.root.click('button', 'Edit');
    expect(test.root.style.display).toBe('flex');
    expect(test.root.children[0]?.style.cssText).toContain('overflow:auto');
    const footer = test.root.children[1]!;
    expect(footer.style.cssText).toContain('position:sticky;bottom:0');
    expect(footer.style.cssText).toContain('background:var(--zotero-neo-surface)');
    expect(footer.all().some((node) => node.tag === 'button' && node.textContent === 'Save')).toBe(
      true,
    );
    expect(
      footer.all().some((node) => node.tag === 'button' && node.textContent === 'Cancel / Back'),
    ).toBe(true);
    const editorBody = test.root.children[0];
    const preview = test.root.labelled('Theme preview');
    const sample = (label: string) => preview.find('span', label).style.cssText;
    const tintedLight = sample('SEL');
    expect(tintedLight).toContain('border-left:1px solid #FF0000');
    expect(sample('VISUAL')).toContain('border-left:1px solid #00FF00');
    test.root.click('button', 'Neutral');
    expect(sample('SEL')).toContain('background:#FAFAFA');
    expect(sample('VISUAL')).toContain('background:#FAFAFA');
    expect(sample('SEL')).not.toBe(tintedLight);
    expect(test.root.find('button', 'Neutral').style.background).toBe('var(--zotero-neo-selected)');
    test.root.click('button', 'Dark');
    expect(test.root.children[0]).toBe(editorBody);
    expect(test.root.labelled('Yellow hex').value).toBe('#FF00FF');
    expect(preview.textContent).toContain('Dark palette');
    expect(sample('SEL')).toContain('background:#161616');
    expect(sample('SEL')).toContain('border-left:1px solid #FF00FF');
    test.root.click('button', 'Tinted');
    expect(sample('SEL')).not.toContain('background:#161616');
    expect(test.preferences.writes).toEqual([]);
    test.root.click('button', 'Cancel / Back');
    expect(test.manager.appearance.colorPreset).toBe(custom.id);
    expect(test.preferences.writes).toEqual([]);
    test.appearance.dispose();
  });

  it('edits a custom theme in place and preserves its other palette and width', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Edit');
    expect(test.root.find('label', 'Theme name').children[0]?.value).toBe('Study');
    test.root.input('#123456', 'Green hex');
    test.root.click('button', 'Save');
    const themes = parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes;
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      id: custom.id,
      light: { green: '#123456' },
      dark: custom.dark,
    });
    expect(test.preferences.get(PRESET, '')).toBe(custom.id);
    test.appearance.dispose();
  });

  it('saves store before active preset, clears draft and rolls back when preset persistence fails', () => {
    const test = mount();
    test.root.click('button', '+ New theme');
    test.root.input('#123456', 'Yellow hex');
    test.root.click('button', 'Save');
    expect(test.preferences.writes.map(([key]) => key)).toEqual([CUSTOM, PRESET]);
    const id = test.preferences.get(PRESET, '');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0]?.light.yellow,
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
    expect(failed.manager.appearance.colorPreset).toBe('zotero');
    failed.appearance.dispose();
  });

  it('saves edited width and style as appearance preferences, not theme properties', () => {
    const test = mount({ [PRESET]: 'gruvbox' });
    test.root.click('button', '+ New theme');
    const width = test.root.find('label', 'Marker width (1–4 CSS px) ').children[0]!;
    width.value = '1';
    width.fire('input');
    test.root.click('button', 'Tinted');
    test.root.click('button', 'Save');
    expect(test.preferences.writes.map(([key]) => key)).toEqual([
      CUSTOM,
      PRESET,
      'appearance.interaction.markerWidth',
      'appearance.interaction.statusStyle',
    ]);
    expect(test.manager.appearance.marker.width).toBe(1);
    expect(test.manager.appearance.statusStyle).toBe('tinted');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0],
    ).not.toHaveProperty('markerWidth');
    expect(
      parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes[0],
    ).not.toHaveProperty('statusStyle');
    test.appearance.dispose();
  });

  it('requires two steps to delete custom themes and falls back if active', () => {
    const test = mount({ [CUSTOM]: stored, [PRESET]: custom.id });
    test.root.click('button', 'Delete');
    expect(test.preferences.writes).toEqual([]);
    expect(test.root.textContent).toContain('Confirm delete');
    test.root.click('button', 'Confirm delete');
    expect(parseCustomInteractionThemes(test.preferences.get(CUSTOM, '')).themes).toEqual([]);
    expect(test.preferences.get(PRESET, '')).toBe('zotero');
    expect(test.manager.appearance.colorPreset).toBe('zotero');
    expect(test.root.textContent).not.toContain('Study');
    test.appearance.dispose();
  });

  it('disposes drafts and preference observers without writing state', () => {
    const test = mount({ [PRESET]: 'yazi-like' });
    test.root.click('button', '+ New theme');
    test.root.input('#abcdef', 'Yellow hex');
    test.appearance.dispose();
    expect(test.manager.appearance.colorPreset).toBe('catppuccin');
    expect(test.preferences.writes).toEqual([]);
    expect(test.preferences.listenerCount()).toBe(5);
    test.manager.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
  });
});
