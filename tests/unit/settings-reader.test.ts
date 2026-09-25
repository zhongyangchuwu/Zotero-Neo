import { describe, expect, it } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY as COLOR,
  READER_INSERT_MODE_ENABLED_PREFERENCE_KEY as INSERT,
  READER_MARKS_PERSIST_PREFERENCE_KEY as MARKS,
  READER_SCROLL_MODE_PREFERENCE_KEY as MODE,
  READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY as VISUAL,
} from '../../src/core/preferences';
import { SettingsReader } from '../../src/main/settings-reader';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style: Record<string, string> = {
    cssText: '',
    display: '',
    background: '',
    color: '',
    borderColor: '',
  };
  textContent = '';
  tabIndex = 0;
  type = '';
  value = '';
  min = '';
  max = '';
  step = '';
  constructor(readonly tag: string) {}
  append(...children: ElementFake[]): void {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementFake[]): void {
    this.children.splice(0, this.children.length, ...children);
  }
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }
  addEventListener(type: string, listener: () => void): void {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  click(): void {
    this.emit('click');
  }
  all(): ElementFake[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
  byAria(label: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('aria-label') === label);
    if (!match) throw new Error(`Missing control: ${label}`);
    return match;
  }
  button(label: string): ElementFake {
    const match = this.all().find((node) => node.tag === 'button' && node.textContent === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }
  modeBlock(mode: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('data-scroll-mode') === mode);
    if (!match) throw new Error(`Missing scroll mode block: ${mode}`);
    return match;
  }
}

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failKey: string | null = null;
  constructor(initial: Record<string, boolean | number | string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }
  has(key: string): boolean {
    return this.values.has(key);
  }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values.get(key) ?? fallback;
  }
  set(key: string, value: boolean | number | string): void {
    if (key === this.failKey) throw new Error('Write failed');
    this.values.set(key, value);
    this.writes.push([key, value]);
    for (const listener of this.observers.get(key) ?? []) listener();
  }
  observe(key: string, listener: () => void): () => void {
    const group = this.observers.get(key) ?? new Set();
    group.add(listener);
    this.observers.set(key, group);
    return () => group.delete(listener);
  }
  listenerCount(): number {
    return [...this.observers.values()].reduce((count, group) => count + group.size, 0);
  }
}

function mount(initial: Record<string, boolean | number | string> = {}) {
  const document = { createElementNS: (_ns: string, tag: string) => new ElementFake(tag) };
  const root = new ElementFake('section');
  const preferences = new Preferences(initial);
  const page = new SettingsReader({ document } as never, root as never, preferences);
  const status = root.all().find((node) => node.getAttribute('role') === 'status')!;
  return { page, root, preferences, status };
}

describe('Reader Settings', () => {
  it('renders the four Reader groups with truthful defaults and active-mode controls', () => {
    const test = mount();
    expect(test.root.all().find((node) => node.tag === 'h2')?.textContent).toBe('Reader');
    expect(
      test.root
        .all()
        .filter((node) => node.tag === 'h3')
        .map((node) => node.textContent),
    ).toEqual(['Modes', 'Scrolling', 'Marks', 'Annotations']);
    expect(test.root.byAria('Text Select mode').getAttribute('aria-checked')).toBe('true');
    expect(test.root.byAria('Annotation comment editing').getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(test.root.byAria('Persist marks').getAttribute('aria-checked')).toBe('false');
    expect(test.root.button('Constant').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.button('Yellow').getAttribute('aria-pressed')).toBe('true');
    expect(test.root.modeBlock('step').style.display).toBe('none');
    expect(test.root.modeBlock('follow').style.display).toBe('block');
    expect(test.root.modeBlock('trapezoid').style.display).toBe('none');
    expect(test.root.byAria('Scroll speed (px/s)').value).toBe('2000');
    const copy = test.root
      .all()
      .map((node) => node.textContent)
      .join(' ');
    expect(copy).not.toContain('Flash-select');
    expect(copy).not.toContain('explicit colour prefix');
    test.page.dispose();
  });

  it('switches scroll models and normalizes numeric writes through the canonical Reader policy', () => {
    const test = mount();
    test.root.button('Step').click();
    expect(test.preferences.writes).toContainEqual([MODE, 'step']);
    expect(test.root.modeBlock('step').style.display).toBe('block');
    expect(test.root.modeBlock('follow').style.display).toBe('none');

    const step = test.root.byAria('Scroll step (px)');
    step.value = '9999';
    step.emit('change');
    expect(test.preferences.writes).toContainEqual(['scrollStep', 500]);
    expect(step.value).toBe('500');

    test.root.button('Accelerating').click();
    expect(test.root.modeBlock('trapezoid').style.display).toBe('block');
    const initial = test.root.byAria('Initial speed (px/s)');
    initial.value = '-20';
    initial.emit('change');
    expect(test.preferences.writes).toContainEqual(['smoothScroll.initialSpeed', 50]);
    expect(initial.value).toBe('50');
    test.page.dispose();
  });

  it('writes mode, marks, and annotation choices live while vetoing failed persistence', () => {
    const test = mount();
    test.root.byAria('Text Select mode').click();
    test.root.byAria('Annotation comment editing').click();
    test.root.byAria('Persist marks').click();
    test.root.button('Purple').click();
    expect(test.preferences.writes).toEqual([
      [VISUAL, false],
      [INSERT, false],
      [MARKS, true],
      [COLOR, 'purple'],
    ]);

    test.preferences.failKey = MODE;
    test.root.button('Accelerating').click();
    expect(test.root.button('Constant').getAttribute('aria-pressed')).toBe('true');
    expect(test.status.textContent).toContain('Could not update Reader settings');
    test.preferences.failKey = null;
    test.root.button('Accelerating').click();
    expect(test.status.textContent).toBe('');
    expect(test.root.button('Accelerating').getAttribute('aria-pressed')).toBe('true');
    test.page.dispose();
  });

  it('tracks external preference writes and releases observers and control listeners on dispose', () => {
    const test = mount();
    const step = test.root.byAria('Scroll step (px)');
    const before = test.preferences.listenerCount();
    expect(before).toBeGreaterThan(0);

    test.preferences.set(MODE, 'step');
    test.preferences.set('scrollStep', 120);
    test.preferences.set(MARKS, true);
    test.preferences.set(COLOR, 'blue');
    expect(test.root.modeBlock('step').style.display).toBe('block');
    expect(step.value).toBe('120');
    expect(test.root.byAria('Persist marks').getAttribute('aria-checked')).toBe('true');
    expect(test.root.button('Blue').getAttribute('aria-pressed')).toBe('true');

    const writeCount = test.preferences.writes.length;
    test.page.dispose();
    expect(test.preferences.listenerCount()).toBe(0);
    expect(test.root.children).toEqual([]);
    step.value = '200';
    step.emit('change');
    expect(test.preferences.writes).toHaveLength(writeCount);
  });
});
