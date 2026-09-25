import type { MainWindow } from '../core/contracts';
import {
  NOTE_EDITOR_ENABLED_PREFERENCE_KEY,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY,
  noteEditorEnabled,
  pickerMouseEnabled,
} from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import {
  settingsGroup,
  settingsStatus,
  settingsToggleRow,
  type SettingsToggle,
} from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

/** Owns the two live cross-surface Interaction controls for one open Settings page. */
export class SettingsInteraction {
  readonly #root: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #cleanups: Array<() => void> = [];
  readonly #pickerToggle: SettingsToggle;
  readonly #noteToggle: SettingsToggle;
  readonly #status: HTMLElement;

  constructor(window: MainWindow, root: HTMLElement, preferences: PreferenceStore) {
    this.#root = root;
    this.#preferences = preferences;
    const doc = window.document;
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';
    const title = doc.createElementNS(H, 'h2');
    title.textContent = 'Interaction';
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const picker = settingsGroup(
      doc,
      'Picker',
      'Mouse controls apply to all shared pickers, including items, collections, tags, tabs, and notes.',
    );
    this.#pickerToggle = settingsToggleRow(
      doc,
      'Mouse row selection and double-click confirmation',
      pickerMouseEnabled(preferences),
      (enabled) => this.#save(PICKER_MOUSE_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
    );
    picker.append(this.#pickerToggle.element);

    const note = settingsGroup(
      doc,
      'Note editing',
      'Applies to Zotero context-pane notes and standalone note tabs.',
    );
    this.#noteToggle = settingsToggleRow(
      doc,
      'Vim-style note editing',
      noteEditorEnabled(preferences),
      (enabled) => this.#save(NOTE_EDITOR_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
    );
    note.append(this.#noteToggle.element);

    this.#status = settingsStatus(doc);
    root.append(title, picker, note, this.#status);
    for (const key of [PICKER_MOUSE_ENABLED_PREFERENCE_KEY, NOTE_EDITOR_ENABLED_PREFERENCE_KEY]) {
      const cleanup = preferences.observe?.(key, () => this.#refresh(true));
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  #refresh(clearStatus = false): void {
    this.#pickerToggle.set(pickerMouseEnabled(this.#preferences));
    this.#noteToggle.set(noteEditorEnabled(this.#preferences));
    if (clearStatus) this.#status.textContent = '';
  }

  #save(key: string, enabled: boolean): boolean {
    try {
      this.#preferences.set(key, enabled);
      this.#refresh(true);
      return true;
    } catch {
      this.#refresh();
      this.#status.textContent = 'Could not update Interaction settings.';
      return false;
    }
  }

  dispose(): void {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
