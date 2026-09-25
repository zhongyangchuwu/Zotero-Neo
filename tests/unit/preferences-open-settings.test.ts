import { describe, expect, it, vi } from 'vitest';
import {
  bindOpenNeoSettingsButton,
  openNeoSettingsFromPreferences,
} from '../../src/preferences/open-settings';

describe('legacy Preferences Settings entry', () => {
  it('passes the opener to the runtime for attached-owner resolution', () => {
    const owner = {} as Window;
    const view = { top: { opener: owner } } as unknown as Window;
    const openSettings = vi.fn(() => true);
    expect(openNeoSettingsFromPreferences(view, { openSettings })).toBe(true);
    expect(openSettings).toHaveBeenCalledExactlyOnceWith(owner);
  });

  it('passes null when no opener is available for the sole-Main fallback', () => {
    const openSettings = vi.fn(() => true);
    expect(
      openNeoSettingsFromPreferences({ top: null, opener: null } as unknown as Window, {
        openSettings,
      }),
    ).toBe(true);
    expect(openSettings).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('reports missing, ambiguous, and throwing runtimes as unavailable', () => {
    expect(openNeoSettingsFromPreferences(null, null)).toBe(false);
    const ambiguous = vi.fn(() => false);
    expect(openNeoSettingsFromPreferences(null, { openSettings: ambiguous })).toBe(false);
    expect(ambiguous).toHaveBeenCalledExactlyOnceWith(null);
    expect(
      openNeoSettingsFromPreferences(null, {
        openSettings: () => {
          throw new Error('host unavailable');
        },
      }),
    ).toBe(false);
  });

  it('wires button clicks to runtime and reports success or failure in its status', () => {
    const button = new EventTarget() as HTMLElement;
    const status = { textContent: '', style: { color: '' } } as HTMLElement;
    const owner = {} as Window;
    const view = { top: { opener: owner } } as unknown as Window;
    const openSettings = vi.fn(() => true);
    const message = vi.fn((opened: boolean) => (opened ? 'Opened' : 'Unavailable'));
    bindOpenNeoSettingsButton(button, status, view, () => ({ openSettings }), message);
    button.dispatchEvent(new Event('click'));
    expect(openSettings).toHaveBeenCalledExactlyOnceWith(owner);
    expect(message).toHaveBeenLastCalledWith(true);
    expect(status.textContent).toBe('Opened');
    expect(status.style.color).toBe('var(--zotero-neo-success)');

    openSettings.mockReturnValue(false);
    button.dispatchEvent(new Event('click'));
    expect(message).toHaveBeenLastCalledWith(false);
    expect(status.textContent).toBe('Unavailable');
    expect(status.style.color).toBe('var(--zotero-neo-error)');
  });
});
