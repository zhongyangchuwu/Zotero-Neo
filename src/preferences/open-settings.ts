import { THEME_VARS } from '../ui/theme';

export interface NeoSettingsRuntime {
  openSettings(owner?: Window | null): boolean;
}

/** Pass only the Preferences opener; the runtime validates ownership or a sole Main fallback. */
export function openNeoSettingsFromPreferences(
  view: Window | null,
  runtime: NeoSettingsRuntime | null | undefined,
): boolean {
  if (!runtime || typeof runtime.openSettings !== 'function') return false;
  let opener: Window | null = null;
  try {
    opener = view?.top?.opener ?? view?.opener ?? null;
  } catch {
    // A separate Preferences window may not expose its opener to this compartment.
  }
  try {
    return runtime.openSettings(opener);
  } catch {
    return false;
  }
}

/** Binds the small legacy-pane entry without mounting Settings in Preferences. */
export function bindOpenNeoSettingsButton(
  button: HTMLElement | null,
  status: HTMLElement | null,
  view: Window | null,
  runtime: () => NeoSettingsRuntime | null | undefined,
  message: (opened: boolean) => string,
): void {
  button?.addEventListener('click', () => {
    let opened = false;
    try {
      opened = openNeoSettingsFromPreferences(view, runtime());
    } catch {}
    if (!status) return;
    status.textContent = message(opened);
    status.style.color = opened ? THEME_VARS.success : THEME_VARS.error;
  });
}
