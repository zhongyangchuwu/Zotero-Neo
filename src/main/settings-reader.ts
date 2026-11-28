import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
  READER_MARKS_PERSIST_PREFERENCE_KEY,
  READER_SCROLL_MODE_PREFERENCE_KEY,
  READER_SCROLL_NUMBER_SPECS,
  READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
  READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
  normalizeReaderScrollNumber,
  readerDefaultHighlightColor,
  readerMarksPersist,
  readerModeEnabled,
  readerScrollConfig,
} from '../core/preferences';
import { t } from '../i18n';
import {
  SEMANTIC_SCHOLAR_CREDENTIAL_HELP_URL,
  checkSemanticScholarCredential,
  createCredentialAbortController,
  openSemanticScholarCredentialHelp,
} from '../platform/credential-check';
import { changeReferenceKey, readSettledReferenceKey } from '../platform/reference-credentials';
import { settingsText, type SettingsLanguage } from './settings-i18n';
import type {
  ReaderCredentialModel,
  ReaderPageCommand,
  ReaderPageModel,
} from './settings-reader-model';

type CredentialState = Pick<ReaderCredentialModel, 'checking' | 'error' | 'status'>;

/** Owns Reader preferences and credential operations for one open Settings page. */
export class SettingsReader {
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #changed: () => void;
  readonly #cleanups: Array<() => void> = [];
  readonly #input: () => HTMLInputElement | null;
  #check: AbortController | null = null;
  #revision = 0;
  #pendingWrite = Promise.resolve();
  #credential: CredentialState = { checking: false, error: false, status: '' };
  #disposed = false;
  #status = '';

  constructor(
    _window: MainWindow,
    preferences: PreferenceStore,
    language: SettingsLanguage,
    changed: () => void,
    input: () => HTMLInputElement | null,
  ) {
    this.#preferences = preferences;
    this.#language = language;
    this.#changed = changed;
    this.#input = input;
    const keys = [
      READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
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

  #credentialText(key: string): string {
    return t(`reader.references.credentials.${key}`, this.#language);
  }

  model(): ReaderPageModel {
    const s = (message: Parameters<typeof settingsText>[1]): string =>
      settingsText(this.#language, message);
    return {
      labels: {
        title: s('Reader'),
        description:
          this.#language === 'zh-CN'
            ? '阅读器设置会在修改时保存。'
            : 'Reader preferences are saved as you change them.',
        input: s('Reader input'),
        visual: s('Text Select mode'),
        visualHint:
          this.#language === 'zh-CN'
            ? '按 v 或用鼠标选中文字后，可用 Neo 的选区快捷键。'
            : 'Press v or select text with the mouse to use Neo’s selection shortcuts.',
        scrolling: s('Scrolling'),
        scrollingHint:
          this.#language === 'zh-CN'
            ? '选择 j、k、zh 和 zl 在阅读器中的滚动方式。'
            : 'Choose how j, k, zh, and zl scroll in the reader.',
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
        stop:
          this.#language === 'zh-CN' ? '松开按键时立即停止' : 'Stop as soon as the key is released',
        stopHint:
          this.#language === 'zh-CN'
            ? '关闭后，加速滚动会在松开按键后减速。'
            : 'Otherwise, accelerating scrolling slows down after release.',
        marks: s('Marks'),
        persist: this.#language === 'zh-CN' ? '保存位置标记' : 'Save marks',
        persistHint:
          this.#language === 'zh-CN'
            ? '重启 Zotero 后仍可跳回保存的位置。'
            : 'Return to marked positions after restarting Zotero.',
        annotations: s('Annotations'),
        annotationsHint:
          this.#language === 'zh-CN'
            ? '为选中文字添加下划线或创建笔记时，未指定颜色则使用此颜色。'
            : 'Used when underlining selected text or adding a note without choosing a color.',
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
      marks: readerMarksPersist(this.#preferences),
      color: readerDefaultHighlightColor(this.#preferences),
      scroll: readerScrollConfig(this.#preferences),
      status: this.#status,
      semanticScholar: {
        ...this.#credential,
        title: this.#credentialText('title'),
        hint: this.#credentialText('hint'),
        inputLabel: this.#credentialText('key'),
        verifyLabel: this.#credentialText('verify'),
        helpLabel: this.#credentialText('help'),
        helpURL: SEMANTIC_SCHOLAR_CREDENTIAL_HELP_URL,
      },
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
      switch (command.type) {
        case 'mountCredential':
          void this.#prefill();
          break;
        case 'credentialEditing':
          this.#invalidate();
          this.#changed();
          break;
        case 'credentialInput': {
          const input = this.#input();
          if (input) this.#writeCredential(input.value);
          break;
        }
        case 'verifyCredential': {
          const input = this.#input();
          if (input) void this.#verify(input, input.value);
          break;
        }
        case 'credentialHelp':
          openSemanticScholarCredentialHelp();
          break;
      }
      return;
    }
    let key: string;
    let value: string | number | boolean;
    switch (command.type) {
      case 'visual':
      case 'marks':
      case 'stop':
        if (typeof command.value !== 'boolean') return;
        key = {
          visual: READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
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

  #current(revision: number): boolean {
    return !this.#disposed && this.#revision === revision;
  }

  #invalidate(): number {
    this.#check?.abort();
    this.#check = null;
    this.#credential = { checking: false, error: false, status: '' };
    return ++this.#revision;
  }

  async #prefill(): Promise<void> {
    const revision = this.#revision;
    // A mount command can arrive before the native view has returned its parts.
    await Promise.resolve();
    if (!this.#current(revision)) return;
    const input = this.#input();
    if (!input) return;
    try {
      const value = await readSettledReferenceKey();
      if (!this.#current(revision) || this.#input() !== input) return;
      input.value = value;
    } catch {
      if (!this.#current(revision) || this.#input() !== input) return;
      this.#credential = {
        checking: false,
        error: true,
        status: this.#credentialText('unavailable'),
      };
      this.#changed();
    }
  }

  #writeCredential(value: string): void {
    const revision = this.#invalidate();
    // Admission is synchronous; only the shared Login Manager queue orders edits.
    const pending = changeReferenceKey(value || null);
    this.#pendingWrite = pending;
    void pending.catch(() => {
      if (!this.#current(revision)) return;
      this.#credential = {
        checking: false,
        error: true,
        status: this.#credentialText('unavailable'),
      };
      this.#changed();
    });
    this.#changed();
  }

  async #verify(input: HTMLInputElement, value: string): Promise<void> {
    const revision = this.#invalidate();
    const check = createCredentialAbortController();
    this.#check = check;
    const current = (): boolean =>
      this.#current(revision) &&
      !check.signal.aborted &&
      this.#input() === input &&
      input.value === value;
    this.#credential = {
      checking: true,
      error: false,
      status: t('credentials.validation.checking', this.#language),
    };
    this.#changed();
    try {
      await this.#pendingWrite;
      if (!current()) return;
      const result = await checkSemanticScholarCredential(value, check.signal);
      if (!current() || result === 'cancelled') return;
      this.#credential = {
        checking: false,
        error: result !== 'valid',
        status: t(`credentials.validation.${result}`, this.#language),
      };
    } catch {
      if (!current()) return;
      this.#credential = {
        checking: false,
        error: true,
        status: this.#credentialText('unavailable'),
      };
    } finally {
      if (this.#current(revision)) {
        this.#check = null;
        if (this.#credential.checking)
          this.#credential = { checking: false, error: false, status: '' };
        this.#changed();
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#check?.abort();
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
  }
}
