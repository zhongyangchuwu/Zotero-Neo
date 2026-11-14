import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
  ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
  READER_MARKS_PERSIST_PREFERENCE_KEY,
  READER_SCROLL_MODE_PREFERENCE_KEY,
  READER_SCROLL_NUMBER_SPECS,
  READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
  READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
  annotationCommentEditorEnabled,
  normalizeReaderScrollNumber,
  readerDefaultHighlightColor,
  readerMarksPersist,
  readerModeEnabled,
  readerScrollConfig,
} from '../core/preferences';
import { t } from '../i18n';
import { readSettledMinerUToken, saveMinerUToken } from '../platform/document-credentials';
import {
  CREDENTIAL_HELP_URLS,
  checkCredential,
  createCredentialAbortController,
  openCredentialHelp,
  type CredentialProvider,
} from '../platform/credential-check';
import { changeReferenceKey, readSettledReferenceKey } from '../platform/reference-credentials';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import type {
  ReaderCredentialModel,
  ReaderPageCommand,
  ReaderPageModel,
} from './settings-reader-model';

type Provider = CredentialProvider;
type CredentialState = Pick<ReaderCredentialModel, 'checking' | 'error' | 'status'>;

/** Owns Reader preferences and credential operations for one open Settings page. */
export class SettingsReader {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  readonly #input: (provider: Provider) => HTMLInputElement | null;
  readonly #checks: Record<Provider, AbortController | null> = {
    mineru: null,
    semanticScholar: null,
  };
  readonly #revision: Record<Provider, number> = { mineru: 0, semanticScholar: 0 };
  readonly #writes: Record<Provider, Promise<void>> = {
    mineru: Promise.resolve(),
    semanticScholar: Promise.resolve(),
  };
  readonly #credentials: Record<Provider, CredentialState>;
  #disposed = false;
  #status = '';

  constructor(
    _window: MainWindow,
    preferences: PreferenceStore,
    language: SettingsLanguage,
    changed: () => void,
    input: (provider: Provider) => HTMLInputElement | null,
  ) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;
    this.#input = input;
    this.#credentials = {
      mineru: { checking: false, error: false, status: '' },
      semanticScholar: { checking: false, error: false, status: '' },
    };
    const keys = [
      READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
      ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
      READER_MARKS_PERSIST_PREFERENCE_KEY,
      READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
      READER_SCROLL_MODE_PREFERENCE_KEY,
      READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
      ...Object.values(READER_SCROLL_NUMBER_SPECS).map((spec) => spec.key),
    ];
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
    return t(
      provider === 'mineru' ? `documentCredentials.${key}` : `reader.references.credentials.${key}`,
      this.#language,
    );
  }

  model(): ReaderPageModel {
    const s = (message: Parameters<typeof settingsText>[1]): string =>
      settingsText(this.#language, message);
    const credential = (provider: Provider): ReaderCredentialModel => ({
      ...this.#credentials[provider],
      title:
        provider === 'mineru'
          ? this.#credentialText(provider, 'token')
          : this.#credentialText(provider, 'title'),
      hint: this.#credentialText(provider, 'hint'),
      inputLabel: this.#credentialText(provider, provider === 'mineru' ? 'token' : 'key'),
      verifyLabel: this.#credentialText(provider, 'verify'),
      helpLabel: this.#credentialText(provider, 'help'),
      helpURL: CREDENTIAL_HELP_URLS[provider],
    });
    return {
      labels: {
        title: s('Reader'),
        input: s('Reader input'),
        visual: s('Text Select mode'),
        visualHint: s(
          'Allow v and Zotero text selections to enter Neo Select mode for selection actions.',
        ),
        comment: s('Annotation comment editing'),
        commentHint: s(
          "When enabled, i / Enter opens the selected annotation's comment editor. When disabled, i gives native inputs keyboard ownership; Enter does nothing.",
        ),
        scrolling: s('Scrolling'),
        scrollingHint: s(
          'Reader j/k/zh/zl use the selected motion model. Only controls for the active model are shown.',
        ),
        mode: s('Scrolling mode'),
        modes: { step: s('Step'), follow: s('Constant'), trapezoid: s('Accelerating') },
        numbers: {
          scrollStep: s('Scroll step (px)'),
          followSpeed: s('Scroll speed (px/s)'),
          initialSpeed: s('Initial speed (px/s)'),
          maxSpeed: s('Max speed (px/s)'),
          acceleration: s('Acceleration (px/s²)'),
          deceleration: s('Deceleration (px/s²)'),
        },
        stop: s('Stop immediately on key release'),
        stopHint: s('Otherwise accelerating scrolling decelerates after release.'),
        marks: s('Marks'),
        persist: s('Persist marks'),
        persistHint: s(
          "Store marks in the parent item's Extra field so they survive restarts and sync with the item.",
        ),
        annotations: s('Annotations'),
        annotationsHint: s(
          'The default color is used when underlining selected text or adding a note without an explicit color.',
        ),
        color: s('Default color'),
        colors: {
          yellow: s('Yellow'),
          red: s('Red'),
          green: s('Green'),
          blue: s('Blue'),
          purple: s('Purple'),
        },
        on: s('On'),
        off: s('Off'),
      },
      visual: readerModeEnabled(this.#preferences, 'visual'),
      comment: annotationCommentEditorEnabled(this.#preferences),
      marks: readerMarksPersist(this.#preferences),
      color: readerDefaultHighlightColor(this.#preferences),
      scroll: readerScrollConfig(this.#preferences),
      status: this.#status,
      mineru: credential('mineru'),
      semanticScholar: credential('semanticScholar'),
    };
  }

  dispatch(command: ReaderPageCommand): void {
    if (this.#disposed || !command || typeof command !== 'object') return;
    if (
      command.type === 'mountCredential' ||
      command.type === 'credentialEditing' ||
      command.type === 'credentialInput' ||
      command.type === 'verifyCredential' ||
      command.type === 'credentialHelp'
    ) {
      const provider = command.provider;
      if (provider !== 'mineru' && provider !== 'semanticScholar') return;
      switch (command.type) {
        case 'mountCredential':
          void this.#prefill(provider);
          break;
        case 'credentialEditing':
          this.#invalidate(provider);
          this.#changed();
          break;
        case 'credentialInput': {
          const input = this.#input(provider);
          if (input) this.#writeCredential(provider, input.value);
          break;
        }
        case 'verifyCredential': {
          const input = this.#input(provider);
          if (input) void this.#verify(provider, input, input.value);
          break;
        }
        case 'credentialHelp':
          openCredentialHelp(provider);
          break;
      }
      return;
    }
    let key: string;
    let value: string | number | boolean;
    switch (command.type) {
      case 'visual':
      case 'comment':
      case 'marks':
      case 'stop':
        if (typeof command.value !== 'boolean') return;
        key = {
          visual: READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
          comment: ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY,
          marks: READER_MARKS_PERSIST_PREFERENCE_KEY,
          stop: READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
        }[command.type];
        value = command.value;
        break;
      case 'mode':
        if (!['step', 'follow', 'trapezoid'].includes(command.value)) return;
        key = READER_SCROLL_MODE_PREFERENCE_KEY;
        value = command.value;
        break;
      case 'color':
        if (!['yellow', 'red', 'green', 'blue', 'purple'].includes(command.value)) return;
        key = READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY;
        value = command.value;
        break;
      case 'number':
        if (
          !Object.hasOwn(READER_SCROLL_NUMBER_SPECS, command.setting) ||
          typeof command.value !== 'string'
        )
          return;
        key = READER_SCROLL_NUMBER_SPECS[command.setting].key;
        value = normalizeReaderScrollNumber(command.setting, Number.parseInt(command.value, 10));
        break;
      default:
        return;
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

  #invalidate(provider: Provider): number {
    this.#checks[provider]?.abort();
    this.#checks[provider] = null;
    this.#credentials[provider] = { checking: false, error: false, status: '' };
    return ++this.#revision[provider];
  }

  async #prefill(provider: Provider): Promise<void> {
    const revision = this.#revision[provider];
    // A mount command can arrive before the native view has returned its parts.
    await Promise.resolve();
    if (!this.#current(provider, revision)) return;
    const input = this.#input(provider);
    if (!input) return;
    try {
      const value = await (provider === 'mineru'
        ? readSettledMinerUToken()
        : readSettledReferenceKey());
      if (!this.#current(provider, revision) || this.#input(provider) !== input) return;
      input.value = value;
    } catch {
      if (!this.#current(provider, revision) || this.#input(provider) !== input) return;
      this.#credentials[provider] = {
        checking: false,
        error: true,
        status: this.#credentialText(provider, 'unavailable'),
      };
      this.#changed();
    }
  }

  #writeCredential(provider: Provider, value: string): void {
    const revision = this.#invalidate(provider);
    // Admission is synchronous; only the shared Login Manager queue orders edits.
    const pending =
      provider === 'mineru' ? saveMinerUToken(value) : changeReferenceKey(value || null);
    this.#writes[provider] = pending;
    void pending.catch(() => {
      if (!this.#current(provider, revision)) return;
      this.#credentials[provider] = {
        checking: false,
        error: true,
        status: this.#credentialText(provider, 'unavailable'),
      };
      this.#changed();
    });
    this.#changed();
  }

  async #verify(provider: Provider, input: HTMLInputElement, value: string): Promise<void> {
    const revision = this.#invalidate(provider);
    const check = createCredentialAbortController();
    this.#checks[provider] = check;
    const current = (): boolean =>
      this.#current(provider, revision) &&
      !check.signal.aborted &&
      this.#input(provider) === input &&
      input.value === value;
    this.#credentials[provider] = {
      checking: true,
      error: false,
      status: t('credentials.validation.checking', this.#language),
    };
    this.#changed();
    try {
      await this.#writes[provider];
      if (!current()) return;
      const result = await checkCredential(provider, value, check.signal);
      if (!current() || result === 'cancelled') return;
      this.#credentials[provider] = {
        checking: false,
        error: result !== 'valid',
        status: t(`credentials.validation.${result}`, this.#language),
      };
    } catch {
      if (!current()) return;
      this.#credentials[provider] = {
        checking: false,
        error: true,
        status: this.#credentialText(provider, 'unavailable'),
      };
    } finally {
      if (this.#current(provider, revision)) {
        this.#checks[provider] = null;
        if (this.#credentials[provider].checking)
          this.#credentials[provider] = { checking: false, error: false, status: '' };
        this.#changed();
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#checks.mineru?.abort();
    this.#checks.semanticScholar?.abort();
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
