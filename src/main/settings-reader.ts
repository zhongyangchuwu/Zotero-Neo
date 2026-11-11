import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY, ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
  READER_MARKS_PERSIST_PREFERENCE_KEY, READER_SCROLL_MODE_PREFERENCE_KEY, READER_SCROLL_NUMBER_SPECS,
  READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY, READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
  annotationCommentEditorEnabled, normalizeReaderScrollNumber, readerDefaultHighlightColor,
  readerMarksPersist, readerModeEnabled, readerScrollConfig,
} from '../core/preferences';
import { t } from '../i18n';
import { readMinerUToken, saveMinerUToken } from '../platform/document-credentials';
import { createReferenceMetadataService } from '../references/metadata';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import type { ReaderCredentialModel, ReaderPageCommand, ReaderPageModel } from './settings-reader-model';

type Provider = 'mineru' | 'semanticScholar';
type CredentialState = Pick<ReaderCredentialModel, 'configured' | 'pending' | 'error' | 'status'>;

/** Owns Reader preferences and credential operations for one open Settings page. */
export class SettingsReader {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  readonly #reference = createReferenceMetadataService();
  readonly #revision: Record<Provider, number> = { mineru: 0, semanticScholar: 0 };
  readonly #credentials: Record<Provider, CredentialState>;
  #disposed = false;
  #status = '';

  constructor(_window: MainWindow, preferences: PreferenceStore, language: SettingsLanguage, changed: () => void) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;
    this.#credentials = {
      mineru: { configured: null, pending: false, error: false, status: this.#credentialText('mineru', 'hint') },
      semanticScholar: { configured: null, pending: true, error: false, status: this.#credentialText('semanticScholar', 'checking') },
    };
    try {
      this.#credentials.mineru = { ...this.#credentials.mineru, configured: !!readMinerUToken() };
    } catch {
      this.#credentials.mineru = { ...this.#credentials.mineru, error: true, status: this.#credentialText('mineru', 'unavailable') };
    }
    const revision = ++this.#revision.semanticScholar;
    void this.#reference.hasSemanticScholarKey().then((configured) => {
      if (!this.#current('semanticScholar', revision)) return;
      this.#credentials.semanticScholar = { configured, pending: false, error: false, status: this.#credentialText('semanticScholar', configured ? 'configured' : 'notConfigured') };
      this.#changed();
    }, () => {
      if (!this.#current('semanticScholar', revision)) return;
      this.#credentials.semanticScholar = { configured: null, pending: false, error: true, status: this.#credentialText('semanticScholar', 'unavailable') };
      this.#changed();
    });
    const keys = [READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY, ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
      READER_MARKS_PERSIST_PREFERENCE_KEY, READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
      READER_SCROLL_MODE_PREFERENCE_KEY, READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
      ...Object.values(READER_SCROLL_NUMBER_SPECS).map((spec) => spec.key)];
    for (const key of keys) {
      const cleanup = preferences.observe?.(key, () => {
        if (this.#disposed) return;
        this.#status = '';
        this.#changed();
      });
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  #credentialText(provider: Provider, key: string): string {
    return t(provider === 'mineru' ? `documentCredentials.${key}` : `reader.references.credentials.${key}`, this.#language);
  }

  model(): ReaderPageModel {
    const s = (message: Parameters<typeof settingsText>[1]): string => settingsText(this.#language, message);
    const credential = (provider: Provider): ReaderCredentialModel => ({
      ...this.#credentials[provider],
      title: provider === 'mineru' ? this.#credentialText(provider, 'token') : this.#credentialText(provider, 'title'),
      hint: this.#credentialText(provider, 'hint'),
      inputLabel: this.#credentialText(provider, provider === 'mineru' ? 'token' : 'key'),
      saveLabel: this.#credentialText(provider, 'save'),
      forgetLabel: this.#credentialText(provider, provider === 'mineru' ? 'clear' : 'forget'),
    });
    return {
      labels: {
        title: s('Reader'), input: s('Reader input'), visual: s('Text Select mode'),
        visualHint: s('Allow v and Zotero text selections to enter Neo Select mode for selection actions.'),
        comment: s('Annotation comment editing'),
        commentHint: s("When enabled, i / Enter opens the selected annotation's comment editor. When disabled, i gives native inputs keyboard ownership; Enter does nothing."),
        scrolling: s('Scrolling'), scrollingHint: s('Reader j/k/zh/zl use the selected motion model. Only controls for the active model are shown.'),
        mode: s('Scrolling mode'), modes: { step: s('Step'), follow: s('Constant'), trapezoid: s('Accelerating') },
        numbers: { scrollStep: s('Scroll step (px)'), followSpeed: s('Scroll speed (px/s)'), initialSpeed: s('Initial speed (px/s)'), maxSpeed: s('Max speed (px/s)'), acceleration: s('Acceleration (px/s²)'), deceleration: s('Deceleration (px/s²)') },
        stop: s('Stop immediately on key release'), stopHint: s('Otherwise accelerating scrolling decelerates after release.'),
        marks: s('Marks'), persist: s('Persist marks'), persistHint: s("Store marks in the parent item's Extra field so they survive restarts and sync with the item."),
        annotations: s('Annotations'), annotationsHint: s('The default color is used when underlining selected text or adding a note without an explicit color.'),
        color: s('Default color'), colors: { yellow: s('Yellow'), red: s('Red'), green: s('Green'), blue: s('Blue'), purple: s('Purple') },
        on: s('On'), off: s('Off'), cancel: s('Cancel'),
      },
      visual: readerModeEnabled(this.#preferences, 'visual'), comment: annotationCommentEditorEnabled(this.#preferences),
      marks: readerMarksPersist(this.#preferences), color: readerDefaultHighlightColor(this.#preferences),
      scroll: readerScrollConfig(this.#preferences), status: this.#status,
      mineru: credential('mineru'), semanticScholar: credential('semanticScholar'),
    };
  }

  dispatch(command: ReaderPageCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    if (command.type === 'saveCredential' || command.type === 'forgetCredential') {
      if (command.provider !== 'mineru' && command.provider !== 'semanticScholar') return;
      if (command.type === 'saveCredential' && typeof command.value !== 'string') return;
      const value = command.type === 'saveCredential' ? command.value : null;
      if (value !== null && !value.trim() && command.provider === 'semanticScholar') {
        if (this.#credentials.semanticScholar.pending) return;
        this.#credentials.semanticScholar = { ...this.#credentials.semanticScholar, error: true, status: this.#credentialText('semanticScholar', 'required') };
        this.#changed();
        return;
      }
      void this.#writeCredential(command.provider, value);
      return;
    }
    let key: string;
    let value: string | number | boolean;
    switch (command.type) {
      case 'visual': case 'comment': case 'marks': case 'stop':
        if (typeof command.value !== 'boolean') return;
        key = { visual: READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY, comment: ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY, marks: READER_MARKS_PERSIST_PREFERENCE_KEY, stop: READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY }[command.type];
        value = command.value; break;
      case 'mode':
        if (!['step', 'follow', 'trapezoid'].includes(command.value)) return;
        key = READER_SCROLL_MODE_PREFERENCE_KEY; value = command.value; break;
      case 'color':
        if (!['yellow', 'red', 'green', 'blue', 'purple'].includes(command.value)) return;
        key = READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY; value = command.value; break;
      case 'number':
        if (!Object.hasOwn(READER_SCROLL_NUMBER_SPECS, command.setting) || typeof command.value !== 'string') return;
        key = READER_SCROLL_NUMBER_SPECS[command.setting].key;
        value = normalizeReaderScrollNumber(command.setting, Number.parseInt(command.value, 10)); break;
      default: return;
    }
    try {
      this.#preferences.set(key, value);
      this.#status = '';
    } catch {
      this.#status = settingsText(this.#language, 'Could not update Reader settings.');
    }
    this.#changed();
  }

  #current(provider: Provider, revision: number): boolean {
    return !this.#disposed && this.#revision[provider] === revision;
  }

  async #writeCredential(provider: Provider, value: string | null): Promise<void> {
    if (this.#disposed || this.#credentials[provider].pending) return;
    const forget = value === null || (provider === 'mineru' && !value.trim());
    const revision = ++this.#revision[provider];
    this.#credentials[provider] = { ...this.#credentials[provider], pending: true, error: false,
      status: provider === 'semanticScholar' ? this.#credentialText(provider, 'saving') : this.#credentials[provider].status };
    this.#changed();
    try {
      if (provider === 'mineru') await saveMinerUToken(forget ? '' : value!);
      else await this.#reference.setSemanticScholarKey(forget ? null : value);
      if (!this.#current(provider, revision)) return;
      this.#credentials[provider] = { configured: !forget, pending: false, error: false,
        status: this.#credentialText(provider, forget ? (provider === 'mineru' ? 'cleared' : 'forgotten') : 'saved') };
    } catch {
      if (!this.#current(provider, revision)) return;
      this.#credentials[provider] = { ...this.#credentials[provider], configured: null, pending: false, error: true, status: this.#credentialText(provider, 'unavailable') };
    }
    this.#changed();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#revision.mineru++;
    this.#revision.semanticScholar++;
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#reference.dispose();
  }
}
