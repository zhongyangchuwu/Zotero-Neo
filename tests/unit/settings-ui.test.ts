import { describe, expect, it, vi } from 'vitest';
import {
  settingsButton,
  settingsChoices,
  settingsControlRow,
  settingsGroup,
  settingsNumberRow,
  settingsStatus,
  settingsToggleRow,
  setSettingsPressed,
  type SettingsToggle,
} from '../../src/main/settings-ui';

interface FakeElement {
  readonly children: FakeElement[];
  readonly style: { cssText: string; background: string; color: string; borderColor: string };
  readonly attributes: Map<string, string>;
  readonly listeners: Map<string, () => void>;
  type: string;
  tabIndex: number;
  textContent: string;
  value: string;
  min: string;
  max: string;
  step: string;
  append(...children: FakeElement[]): void;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  emit(type: string): void;
  click(): void;
}

function fakeDocument(): Document {
  return {
    createElementNS: (_ns: string, _tag: string): FakeElement => {
      const listeners = new Map<string, () => void>();
      const attributes = new Map<string, string>();
      return {
        children: [],
        style: { cssText: '', background: '', color: '', borderColor: '' },
        attributes,
        listeners,
        type: '',
        tabIndex: 0,
        textContent: '',
        value: '',
        min: '',
        max: '',
        step: '',
        append(...children: FakeElement[]) {
          this.children.push(...children);
        },
        setAttribute(key: string, value: string) {
          attributes.set(key, value);
        },
        getAttribute(key: string) {
          return attributes.get(key) ?? null;
        },
        addEventListener(type: string, listener: () => void) {
          listeners.set(type, listener);
        },
        removeEventListener(type: string, listener: () => void) {
          if (listeners.get(type) === listener) listeners.delete(type);
        },
        emit(type: string) {
          listeners.get(type)?.();
        },
        click() {
          this.emit('click');
        },
      };
    },
  } as unknown as Document;
}

describe('shared Neo Settings controls', () => {
  it('creates a host-font mouse-first button with Gecko-neutral centered geometry and cleanup', () => {
    const cleanups: Array<() => void> = [];
    const onClick = vi.fn();
    const button = settingsButton(
      fakeDocument(),
      'Apply',
      onClick,
      cleanups,
    ) as unknown as FakeElement;
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(-1);
    expect(button.textContent).toBe('Apply');
    for (const rule of [
      'appearance:none',
      '-moz-appearance:none',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'box-sizing:border-box',
      'min-height:2.5em',
      'line-height:1.2',
      'font:inherit',
    ])
      expect(button.style.cssText).toContain(rule);
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
    cleanups[0]!();
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('centralizes selected colors and aria-pressed state', () => {
    const button = settingsButton(
      fakeDocument(),
      'Selected',
      () => {},
      [],
    ) as unknown as FakeElement;
    setSettingsPressed(button as unknown as HTMLButtonElement, true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.style.background).toBe('var(--zotero-neo-selected)');
    expect(button.style.color).toBe('var(--zotero-neo-selected-text)');
    expect(button.style.borderColor).toBe('var(--zotero-neo-accent)');
    setSettingsPressed(button as unknown as HTMLButtonElement, false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.style.background).toBe('var(--zotero-neo-input)');
  });

  it('updates numeric and string choice groups without custom keyboard behavior', () => {
    const cleanups: Array<() => void> = [];
    const changed = vi.fn((value: number) => value !== 4);
    const widths = settingsChoices(
      fakeDocument(),
      [1, 2, 3, 4].map((value) => ({ value, label: `${value}px` })),
      3,
      changed,
      cleanups,
    );
    const buttons = (widths.element as unknown as FakeElement).children;
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
    expect(buttons.every((button) => button.tabIndex === -1)).toBe(true);
    expect(buttons.every((button) => button.style.cssText.includes('display:inline-flex'))).toBe(
      true,
    );
    buttons[0]!.click();
    expect(changed).toHaveBeenCalledWith(1);
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    buttons[3]!.click();
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    widths.select(2);
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('true');
    const styles = settingsChoices(
      fakeDocument(),
      [
        { value: 'neutral', label: 'Neutral' },
        { value: 'tinted', label: 'Tinted' },
      ],
      'neutral',
      () => {},
      cleanups,
    );
    const styleButtons = (styles.element as unknown as FakeElement).children;
    styleButtons[1]!.click();
    expect(styleButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
    for (const cleanup of cleanups) cleanup();
    expect(buttons.every((button) => button.listeners.size === 0)).toBe(true);
    expect(styleButtons.every((button) => button.listeners.size === 0)).toBe(true);
  });
  it('renders lightweight group headings and accessible inline status', () => {
    const doc = fakeDocument();
    const group = settingsGroup(doc, 'Picker', 'Shared candidates');
    const children = (group as unknown as FakeElement).children;
    expect(children[0]?.textContent).toBe('Picker');
    expect(children[1]?.textContent).toBe('Shared candidates');
    expect(children[0]?.style.cssText).toContain('font-size:1.2em');
    expect((settingsGroup(doc, 'Note editing') as unknown as FakeElement).children).toHaveLength(1);
    const status = settingsStatus(doc) as unknown as FakeElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('shares labeled row geometry across choices, toggles, and number inputs', () => {
    const doc = fakeDocument();
    const control = settingsChoices(doc, [{ value: 'a', label: 'A' }], 'a', () => {}, []).element;
    const row = settingsControlRow(
      doc,
      'Mode',
      control,
      'Shared description',
    ) as unknown as FakeElement;
    expect(row.style.cssText).toContain('align-items:center');
    expect(row.children[0]?.children[0]?.textContent).toBe('Mode');
    expect(row.children[0]?.children[1]?.textContent).toBe('Shared description');
    expect(row.children[1]).toBe(control as unknown as FakeElement);
  });

  it('keeps number fields keyboard-editable while centralizing geometry and commit normalization', () => {
    const cleanups: Array<() => void> = [];
    const changed = vi.fn((value: number) => (value > 500 ? 500 : value));
    const field = settingsNumberRow(
      fakeDocument(),
      'Scroll step (px)',
      60,
      { minimum: 10, maximum: 500, step: 10 },
      changed,
      cleanups,
    );
    const row = field.element as unknown as FakeElement;
    const input = row.children[1]!;
    expect(input.type).toBe('number');
    expect(input.tabIndex).toBe(0);
    expect(input.min).toBe('10');
    expect(input.max).toBe('500');
    expect(input.step).toBe('10');
    expect(input.value).toBe('60');
    expect(input.getAttribute('aria-label')).toBe('Scroll step (px)');
    expect(input.style.cssText).toContain('font:inherit');
    expect(input.style.cssText).toContain('box-sizing:border-box');
    input.value = '900';
    input.emit('change');
    expect(changed).toHaveBeenCalledWith(900);
    expect(input.value).toBe('500');
    field.set(120);
    expect(input.value).toBe('120');
    for (const cleanup of cleanups) cleanup();
    input.value = '200';
    input.emit('change');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('updates a switch after success, vetoes failures, and cleans its mouse listener', () => {
    const cleanups: Array<() => void> = [];
    const onChange = vi.fn((value: boolean) => value !== false);
    const toggle = settingsToggleRow(
      fakeDocument(),
      'Mouse rows',
      false,
      onChange,
      cleanups,
      'All shared pickers',
    );
    const row = toggle.element as unknown as FakeElement;
    const button = row.children[1]!;
    expect(row.children[0]?.children[0]?.textContent).toBe('Mouse rows');
    expect(row.children[0]?.children[1]?.textContent).toBe('All shared pickers');
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-label')).toBe('Mouse rows');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.getAttribute('aria-pressed')).toBeNull();
    expect(button.tabIndex).toBe(-1);
    expect(button.style.cssText).toContain('appearance:none;');
    expect(button.style.cssText).toContain('align-items:center;justify-content:center');
    button.click();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    button.click();
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(button.getAttribute('aria-checked')).toBe('true');
    toggle.set(false);
    expect(button.getAttribute('aria-checked')).toBe('false');
    for (const cleanup of cleanups) cleanup();
    button.click();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not invert a switch after a synchronous preference observer updates it', () => {
    let toggle: SettingsToggle;
    toggle = settingsToggleRow(
      fakeDocument(),
      'Note editor',
      false,
      (next) => {
        toggle.set(next);
        return true;
      },
      [],
    );
    const button = (toggle.element as unknown as FakeElement).children[1]!;
    button.click();
    expect(button.getAttribute('aria-checked')).toBe('true');
  });
});
