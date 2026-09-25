import type { MainWindow } from '../core/contracts';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
  READER_INSERT_MODE_ENABLED_PREFERENCE_KEY,
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
  type HighlightColorName,
  type ReaderScrollNumberSetting,
  type ScrollMode,
} from '../core/preferences';
import type { PreferenceStore } from '../core/preference-store';
import { settingsText, settingsToggleLabels, type SettingsLanguage } from './settings-i18n';
import {
  settingsChoices,
  settingsControlRow,
  settingsGroup,
  settingsNumberRow,
  settingsStatus,
  settingsToggleRow,
  type SettingsNumberInput,
  type SettingsToggle,
} from './settings-ui';

const H = 'http://www.w3.org/1999/xhtml';

interface SettingsChoice<T extends string | number> {
  readonly element: HTMLElement;
  select(value: T): void;
}

const SCROLL_INPUT_STEPS: Readonly<Record<ReaderScrollNumberSetting, number>> = {
  scrollStep: 10,
  followSpeed: 50,
  initialSpeed: 10,
  maxSpeed: 50,
  acceleration: 100,
  deceleration: 100,
};

/** Owns Reader mode, scrolling, marks, and annotation preferences for one open Settings page. */
export class SettingsReader {
  readonly #root: HTMLElement;
  readonly #preferences: PreferenceStore;
  readonly #language: SettingsLanguage;
  readonly #cleanups: Array<() => void> = [];
  readonly #visualToggle: SettingsToggle;
  readonly #insertToggle: SettingsToggle;
  readonly #scrollMode: SettingsChoice<ScrollMode>;
  readonly #scrollNumbers: Record<ReaderScrollNumberSetting, SettingsNumberInput>;
  readonly #stopOnReleaseToggle: SettingsToggle;
  readonly #marksToggle: SettingsToggle;
  readonly #highlightColor: SettingsChoice<HighlightColorName>;
  readonly #stepBlock: HTMLElement;
  readonly #followBlock: HTMLElement;
  readonly #trapezoidBlock: HTMLElement;
  readonly #status: HTMLElement;

  constructor(
    window: MainWindow,
    root: HTMLElement,
    preferences: PreferenceStore,
    language: SettingsLanguage = 'en',
  ) {
    this.#root = root;
    this.#preferences = preferences;
    this.#language = language;
    const doc = window.document;
    const scroll = readerScrollConfig(preferences);
    root.style.cssText = 'display:block;overflow:auto;padding:16px 20px';

    const title = doc.createElementNS(H, 'h2');
    title.textContent = settingsText(language, 'Reader');
    title.style.cssText = 'margin:0 0 0.55em;font-size:1.55em';

    const modes = settingsGroup(doc, settingsText(language, 'Modes'));
    this.#visualToggle = settingsToggleRow(
      doc,
      settingsText(language, 'Text Select mode'),
      readerModeEnabled(preferences, 'visual'),
      (enabled) => this.#save(READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
      settingsText(
        language,
        'Allow v and Zotero text selections to enter Neo Select mode for selection actions.',
      ),
      settingsToggleLabels(language),
    );
    this.#insertToggle = settingsToggleRow(
      doc,
      settingsText(language, 'Annotation comment editing'),
      readerModeEnabled(preferences, 'insert'),
      (enabled) => this.#save(READER_INSERT_MODE_ENABLED_PREFERENCE_KEY, enabled),
      this.#cleanups,
      settingsText(
        language,
        "When enabled, i / Enter opens the selected annotation's comment editor. When disabled, i only enters passthrough Insert mode.",
      ),
      settingsToggleLabels(language),
    );
    modes.append(this.#visualToggle.element, this.#insertToggle.element);

    const scrolling = settingsGroup(
      doc,
      settingsText(language, 'Scrolling'),
      settingsText(
        language,
        'Reader j/k/zh/zl use the selected motion model. Only controls for the active model are shown.',
      ),
    );
    this.#scrollMode = settingsChoices(
      doc,
      [
        { value: 'step', label: settingsText(language, 'Step') },
        { value: 'follow', label: settingsText(language, 'Constant') },
        { value: 'trapezoid', label: settingsText(language, 'Accelerating') },
      ] as const,
      scroll.mode,
      (mode) => this.#save(READER_SCROLL_MODE_PREFERENCE_KEY, mode),
      this.#cleanups,
    );
    scrolling.append(
      settingsControlRow(doc, settingsText(language, 'Scrolling mode'), this.#scrollMode.element),
    );

    this.#stepBlock = this.#modeBlock(doc, 'step');
    this.#followBlock = this.#modeBlock(doc, 'follow');
    this.#trapezoidBlock = this.#modeBlock(doc, 'trapezoid');
    this.#scrollNumbers = {
      scrollStep: this.#number(doc, settingsText(language, 'Scroll step (px)'), 'scrollStep', scroll.scrollStep),
      followSpeed: this.#number(doc, settingsText(language, 'Scroll speed (px/s)'), 'followSpeed', scroll.followSpeed),
      initialSpeed: this.#number(doc, settingsText(language, 'Initial speed (px/s)'), 'initialSpeed', scroll.initialSpeed),
      maxSpeed: this.#number(doc, settingsText(language, 'Max speed (px/s)'), 'maxSpeed', scroll.maxSpeed),
      acceleration: this.#number(doc, settingsText(language, 'Acceleration (px/s²)'), 'acceleration', scroll.acceleration),
      deceleration: this.#number(doc, settingsText(language, 'Deceleration (px/s²)'), 'deceleration', scroll.deceleration),
    };
    this.#stepBlock.append(this.#scrollNumbers.scrollStep.element);
    this.#followBlock.append(this.#scrollNumbers.followSpeed.element);
    this.#trapezoidBlock.append(
      this.#scrollNumbers.initialSpeed.element,
      this.#scrollNumbers.maxSpeed.element,
      this.#scrollNumbers.acceleration.element,
      this.#scrollNumbers.deceleration.element,
    );
    this.#stopOnReleaseToggle = settingsToggleRow(
      doc,
      settingsText(language, 'Stop immediately on key release'),
      scroll.stopOnRelease,
      (enabled) => this.#save(READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY, enabled),
      this.#cleanups,
      settingsText(language, 'Otherwise accelerating scrolling decelerates after release.'),
      settingsToggleLabels(language),
    );
    this.#trapezoidBlock.append(this.#stopOnReleaseToggle.element);
    scrolling.append(this.#stepBlock, this.#followBlock, this.#trapezoidBlock);

    const marks = settingsGroup(doc, settingsText(language, 'Marks'));
    this.#marksToggle = settingsToggleRow(
      doc,
      settingsText(language, 'Persist marks'),
      readerMarksPersist(preferences),
      (enabled) => this.#save(READER_MARKS_PERSIST_PREFERENCE_KEY, enabled),
      this.#cleanups,
      settingsText(
        language,
        "Store marks in the parent item's Extra field so they survive restarts and sync with the item.",
      ),
      settingsToggleLabels(language),
    );
    marks.append(this.#marksToggle.element);

    const annotations = settingsGroup(
      doc,
      settingsText(language, 'Annotations'),
      settingsText(
        language,
        'The default color is used when underlining selected text or adding a note without an explicit color.',
      ),
    );
    this.#highlightColor = settingsChoices(
      doc,
      [
        { value: 'yellow', label: settingsText(language, 'Yellow') },
        { value: 'red', label: settingsText(language, 'Red') },
        { value: 'green', label: settingsText(language, 'Green') },
        { value: 'blue', label: settingsText(language, 'Blue') },
        { value: 'purple', label: settingsText(language, 'Purple') },
      ] as const,
      readerDefaultHighlightColor(preferences),
      (color) => this.#save(READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY, color),
      this.#cleanups,
    );
    annotations.append(
      settingsControlRow(doc, settingsText(language, 'Default color'), this.#highlightColor.element),
    );

    this.#status = settingsStatus(doc);
    root.append(title, modes, scrolling, marks, annotations, this.#status);
    this.#refresh();

    const keys = [
      READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
      READER_INSERT_MODE_ENABLED_PREFERENCE_KEY,
      READER_MARKS_PERSIST_PREFERENCE_KEY,
      READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
      READER_SCROLL_MODE_PREFERENCE_KEY,
      READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
      ...Object.values(READER_SCROLL_NUMBER_SPECS).map((spec) => spec.key),
    ];
    for (const key of keys) {
      const cleanup = preferences.observe?.(key, () => this.#refresh(true));
      if (cleanup) this.#cleanups.push(cleanup);
    }
  }

  #modeBlock(doc: Document, mode: ScrollMode): HTMLElement {
    const block = doc.createElementNS(H, 'div') as HTMLElement;
    block.setAttribute('data-scroll-mode', mode);
    block.style.cssText = 'margin-top:0.55em';
    return block;
  }

  #number(
    doc: Document,
    label: string,
    setting: ReaderScrollNumberSetting,
    value: number,
  ): SettingsNumberInput {
    const spec = READER_SCROLL_NUMBER_SPECS[setting];
    return settingsNumberRow(
      doc,
      label,
      value,
      {
        minimum: spec.minimum,
        maximum: spec.maximum,
        step: SCROLL_INPUT_STEPS[setting],
      },
      (next) => this.#saveNumber(setting, next),
      this.#cleanups,
    );
  }

  #saveNumber(setting: ReaderScrollNumberSetting, raw: number): number | false {
    const next = normalizeReaderScrollNumber(setting, raw);
    if (!this.#save(READER_SCROLL_NUMBER_SPECS[setting].key, next)) return false;
    return readerScrollConfig(this.#preferences)[setting];
  }

  #save(key: string, value: boolean | number | string): boolean {
    try {
      this.#preferences.set(key, value);
      this.#refresh(true);
      return true;
    } catch {
      this.#refresh();
      this.#status.textContent = settingsText(this.#language, 'Could not update Reader settings.');
      return false;
    }
  }

  #refresh(clearStatus = false): void {
    const scroll = readerScrollConfig(this.#preferences);
    this.#visualToggle.set(readerModeEnabled(this.#preferences, 'visual'));
    this.#insertToggle.set(readerModeEnabled(this.#preferences, 'insert'));
    this.#scrollMode.select(scroll.mode);
    for (const setting of Object.keys(this.#scrollNumbers) as ReaderScrollNumberSetting[]) {
      this.#scrollNumbers[setting].set(scroll[setting]);
    }
    this.#stopOnReleaseToggle.set(scroll.stopOnRelease);
    this.#marksToggle.set(readerMarksPersist(this.#preferences));
    this.#highlightColor.select(readerDefaultHighlightColor(this.#preferences));
    this.#stepBlock.style.display = scroll.mode === 'step' ? 'block' : 'none';
    this.#followBlock.style.display = scroll.mode === 'follow' ? 'block' : 'none';
    this.#trapezoidBlock.style.display = scroll.mode === 'trapezoid' ? 'block' : 'none';
    if (clearStatus) this.#status.textContent = '';
  }

  dispose(): void {
    for (const cleanup of this.#cleanups.splice(0)) cleanup();
    this.#root.replaceChildren();
  }
}
