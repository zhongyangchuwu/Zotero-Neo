import type { MainWindow } from '../core/contracts';
import {
  NOTE_EDITOR_ENABLED_PREFERENCE_KEY,
  PICKER_MOUSE_ENABLED_PREFERENCE_KEY,
  noteEditorEnabled,
  pickerMouseEnabled,
} from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import type { SettingsFormCommand, SettingsFormModel } from './settings-form-model';

const PICKER_MOUSE_FIELD_ID = 'pickerMouseEnabled';
const NOTE_EDITOR_FIELD_ID = 'noteEditorEnabled';

/** Owns the two live cross-surface Interaction controls for one open Settings page. */
export class SettingsInteraction {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  #status: SettingsFormModel['status'];
  #disposed = false;

  constructor(
    _window: MainWindow,
    preferences: PreferenceStore,
    language: SettingsLanguage,
    changed: () => void,
  ) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;

    for (const key of [PICKER_MOUSE_ENABLED_PREFERENCE_KEY, NOTE_EDITOR_ENABLED_PREFERENCE_KEY]) {
      const cleanup = preferences.observe?.(key, () => {
        if (this.#disposed) return;
        this.#status = undefined;
        this.#changed();
      });
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  model(): SettingsFormModel {
    const language = this.#language;
    return {
      title: settingsText(language, 'Interaction'),
      groups: [
        {
          id: 'picker',
          title: settingsText(language, 'Picker'),
          description: settingsText(
            language,
            'Mouse controls apply to all shared pickers, including items, collections, tags, tabs, and notes.',
          ),
          fields: [
            {
              id: PICKER_MOUSE_FIELD_ID,
              label: settingsText(language, 'Mouse row selection and double-click confirmation'),
              kind: 'boolean',
              value: pickerMouseEnabled(this.#preferences),
            },
          ],
        },
        {
          id: 'note-editing',
          title: settingsText(language, 'Note editing'),
          description: settingsText(
            language,
            'Applies to Zotero context-pane notes and standalone note tabs.',
          ),
          fields: [
            {
              id: NOTE_EDITOR_FIELD_ID,
              label: settingsText(language, 'Vim-style note editing'),
              kind: 'boolean',
              value: noteEditorEnabled(this.#preferences),
            },
          ],
        },
      ],
      ...(this.#status ? { status: this.#status } : {}),
    };
  }

  dispatch(command: SettingsFormCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    if (command.type !== 'value') return;
    switch (command.id) {
      case PICKER_MOUSE_FIELD_ID:
        if (typeof command.value === 'boolean')
          this.#save(PICKER_MOUSE_ENABLED_PREFERENCE_KEY, command.value);
        return;
      case NOTE_EDITOR_FIELD_ID:
        if (typeof command.value === 'boolean')
          this.#save(NOTE_EDITOR_ENABLED_PREFERENCE_KEY, command.value);
        return;
    }
  }

  #save(
    key: typeof PICKER_MOUSE_ENABLED_PREFERENCE_KEY | typeof NOTE_EDITOR_ENABLED_PREFERENCE_KEY,
    enabled: boolean,
  ): void {
    try {
      this.#preferences.set(key, enabled);
      this.#status = undefined;
    } catch {
      this.#status = {
        text: settingsText(this.#language, 'Could not update Interaction settings.'),
        error: true,
      };
    }
    this.#changed();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
