import { describe, expect, it, vi } from 'vitest';
import {
  settingsButton,
  settingsChoices,
  settingsGroup,
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
  append(...children: FakeElement[]): void;
  setAttribute(key: string, value: string): void;
  getAttribute(key: string): string | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
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
        click() {
          listeners.get('click')?.();
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
