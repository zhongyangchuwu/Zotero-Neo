import type { ModuleHost } from '../../core/module-host';
import type { ReaderSelectionActionDefinition, ReaderSelectionContext } from '../../core/contracts';
import { CleanupFailure } from '../../core/cleanup';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { PdfWindow, ReaderMode, ReaderRuntime } from '../../reader/types';
import {
  computeSelectionPosition,
  prepareReaderSelectionSearch,
  readerSelectionText,
} from '../../toolkit';
import { t } from '../../i18n';
import { ReaderBodySelection } from './body-selection';
import { ReaderFlash } from './flash';
import { ReaderSelectionRange } from './selection-range';
import { ReaderSelectionActions } from './selection-actions';
import { selectionClipboardText } from './selection-text';
import {
  bindReaderSelectionActions,
  READER_SELECTION_NORMAL_ACTIONS,
  type ReaderSelectionAction,
} from './actions';

export interface ReaderSelectionModulePorts {
  readonly reader: ReaderRuntime;
  readonly activeWindow: () => PdfWindow | null;
  readonly isViewCurrent: (window: PdfWindow) => boolean;
  readonly capturePresentation: (window: PdfWindow) => () => boolean;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly mode: () => ReaderMode;
  readonly setMode: (mode: ReaderMode) => void;
  readonly enabled: () => boolean;
  readonly invalidateNativeSelection: () => void;
  readonly noteOwner: () => void;
  readonly clearOwner: () => void;
  readonly updateIndicator: () => void;
  readonly scrollContainer: (window: PdfWindow) => HTMLElement;
  readonly scrollBy: (window: PdfWindow, x: number, y: number) => void;
  readonly copyText: (text: string) => void;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly language: () => KeyGuideLanguage;
  readonly pluginID: () => string | null;
  readonly contributedActions: (
    window: PdfWindow,
    language: KeyGuideLanguage,
  ) => readonly ReaderSelectionActionDefinition[];
  readonly registeredActions: (
    context: ReaderSelectionContext,
    isCurrent: () => boolean,
  ) => readonly ReaderSelectionActionDefinition[];
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

export interface ReaderSelectionModule {
  readonly flash: ReaderFlash;
  readonly range: ReaderSelectionRange;
  readonly actions: ReaderSelectionActions;
  isCurrent(): boolean;
  context(): ReaderSelectionContext | null;
  executeAction(action: ReaderSelectionAction, window: PdfWindow): boolean;
  releaseView(window: PdfWindow): void;
}

function selectionText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

type Translate = (
  text: string,
  options: { readonly pluginID: string; readonly itemID?: number },
) => Promise<{ readonly result?: string }>;

interface SelectionTranslationRuntime {
  readonly PDFTranslate?: { readonly api?: { readonly translate?: Translate } };
}

function selectionTranslator(): Translate | undefined {
  if (typeof Zotero === 'undefined') return undefined;
  // PDFTranslate's existing optional public API is absent from Zotero's host declarations.
  const runtime = Zotero as unknown as SelectionTranslationRuntime;
  return runtime.PDFTranslate?.api?.translate;
}

/** Owns selection-domain state; the Surface still owns modes, exact views and input admission. */
export function createReaderSelectionModule(
  host: ModuleHost,
  ports: ReaderSelectionModulePorts,
): ReaderSelectionModule {
  return host.activate('reader-selection', (scope) => {
    const isCurrent = (window: PdfWindow): boolean =>
      scope.isCurrent() && ports.isViewCurrent(window);
    const showStatus = (message: string, duration?: number): void => {
      if (scope.isCurrent()) ports.showStatus(message, duration);
    };
    const timers = new Set<ReturnType<typeof setTimeout>>();
    scope.add(() => {
      const failure = new CleanupFailure();
      for (const timer of timers) failure.run(() => clearTimeout(timer));
      timers.clear();
      failure.rethrow();
    });
    scope.add(ports.clearOwner);
    const body = new ReaderBodySelection({
      reader: ports.reader,
      isCurrent: () => scope.isCurrent(),
      capturePresentation: ports.capturePresentation,
      captureView: ports.captureView,
      showStatus,
      text: (key) => t(`bodySelection.${key}`, ports.language()),
      debug: ports.debug,
    });
    scope.add(() => body.dispose());
    const flash = new ReaderFlash({
      isCurrent,
      captureView: ports.captureView,
      activate: (intent, window, target) => range.activateFlashTarget(intent, window, target),
      showStatus,
      debug: ports.debug,
    });
    scope.add(() => flash.dispose());
    const range = new ReaderSelectionRange({
      isCurrent,
      captureView: ports.captureView,
      mode: ports.mode,
      setModeVisual: () => ports.setMode('visual'),
      invalidateNativeSelection: ports.invalidateNativeSelection,
      noteOwner: ports.noteOwner,
      updateIndicator: ports.updateIndicator,
      showStatus,
      scrollContainer: ports.scrollContainer,
      scrollBy: ports.scrollBy,
      openFlash: (window, intent) => flash.open(window, intent),
    });
    scope.add(() => range.dispose());
    const context = (): ReaderSelectionContext | null => {
      if (!scope.isCurrent() || ports.mode() !== 'visual') return null;
      const window = ports.activeWindow();
      if (!window || !isCurrent(window)) return null;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return null;
      const text = selectionText(readerSelectionText(window, selection));
      if (!text) return null;
      const computed = computeSelectionPosition(window, selection);
      return Object.freeze({
        text,
        itemID: ports.reader.itemID ?? null,
        pageLabel: computed?.pageLabel ?? null,
        position: computed?.position ?? null,
      });
    };
    const actions = new ReaderSelectionActions({
      isCurrent,
      captureView: ports.captureView,
      capturePresentation: ports.capturePresentation,
      actions: (snapshot, window, queryCurrent) => {
        if (!queryCurrent()) return [];
        const language = ports.language();
        const result: ReaderSelectionActionDefinition[] = [];
        const translate = selectionTranslator();
        const pluginID = ports.pluginID();
        if (typeof translate === 'function' && pluginID) {
          result.push({
            id: 'pdf-translate.translate',
            label: language === 'zh-CN' ? '翻译' : 'Translate',
            run: async (selection) => {
              if (!isCurrent(window)) return { retired: true };
              const task = await translate(selection.text, {
                pluginID,
                ...(selection.itemID === null ? {} : { itemID: selection.itemID }),
              });
              const text = task.result?.trim();
              if (!text) throw new Error('empty translation result');
              return { title: language === 'zh-CN' ? '翻译结果' : 'Translation', body: text };
            },
          });
        }
        if (!queryCurrent()) return [];
        result.push(...ports.contributedActions(window, language));
        if (!queryCurrent()) return [];
        result.push(...ports.registeredActions(snapshot, queryCurrent));
        return queryCurrent() ? result : [];
      },
      themeRoot: ports.themeRoot,
      copyText: ports.copyText,
      showStatus,
      debug: ports.debug,
    });
    scope.add(() => actions.dispose());
    const execute = bindReaderSelectionActions(host, scope, (action, window) => {
      if (!isCurrent(window)) return;
      body.bind(window);
      switch (action) {
        case 'toggleBodySelection':
          void body.toggle(window).catch((error: unknown) => {
            ports.debug(`body selection cleanup failed: ${String(error)}`);
          });
          return;
        case 'enterVisual':
          if (ports.enabled()) range.enter(window);
          return;
        case 'flashText':
          flash.open(window, 'visual-end');
          return;
        case 'openSelectionActions': {
          const snapshot = context();
          if (!snapshot) {
            showStatus('✗ no selection', 1500);
            return;
          }
          ports.noteOwner();
          actions.open(window, snapshot);
          return;
        }
        case 'exitMode':
          ports.setMode('normal');
          window.getSelection()?.removeAllRanges();
          return;
        case 'extendDown':
          range.extendByLine(window, 1);
          return;
        case 'extendTokenDown':
          range.extendByTokenLine(window, 1);
          return;
        case 'extendTokenUp':
          range.extendByTokenLine(window, -1);
          return;
        case 'extendTokenBackward':
          range.extendByToken(window, -1);
          return;
        case 'extendTokenForward':
          range.extendByToken(window, 1);
          return;
        case 'extendUp':
          range.extendByLine(window, -1);
          return;
        case 'extendLeft':
          range.modify(window, 'backward', 'character');
          return;
        case 'extendRight':
          range.modify(window, 'forward', 'character');
          return;
        case 'extendWordForward':
          range.modify(window, 'forward', 'word');
          return;
        case 'extendWordBackward':
          range.modify(window, 'backward', 'word');
          return;
        case 'extendSentenceForward':
          range.modify(window, 'forward', 'sentence');
          return;
        case 'extendSentenceBackward':
          range.modify(window, 'backward', 'sentence');
          return;
        case 'extendParagraphForward':
          range.modify(window, 'forward', 'paragraph');
          return;
        case 'extendParagraphBackward':
          range.modify(window, 'backward', 'paragraph');
          return;
        case 'extendLineStart':
          range.extendLineBoundary(window, false);
          return;
        case 'extendLineEnd':
          range.extendLineBoundary(window, true);
          return;
        case 'swapVisualEnds':
          range.swapEnds(window);
          return;
        case 'copySelection': {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed)
            ports.copyText(selectionClipboardText(readerSelectionText(window, selection)));
          if (!isCurrent(window)) return;
          ports.setMode('normal');
          selection?.removeAllRanges();
          if (isCurrent(window)) window.focus();
          return;
        }
        case 'searchSelection': {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) return;
          const text = selectionText(readerSelectionText(window, selection));
          if (!text) return;
          const viewCurrent = ports.captureView(window);
          const search = prepareReaderSelectionSearch(ports.reader, window);
          if (!search) return;
          ports.setMode('normal');
          selection.removeAllRanges();
          if (!isCurrent(window) || !viewCurrent()) return;
          const timer = setTimeout(() => {
            timers.delete(timer);
            if (isCurrent(window) && viewCurrent()) search(text);
          }, 200);
          timers.add(timer);
          return;
        }
      }
    });
    return {
      flash,
      range,
      actions,
      isCurrent: () => scope.isCurrent(),
      context,
      releaseView: (window) => {
        const failure = new CleanupFailure();
        failure.run(() => range.releaseView(window));
        failure.run(() => body.releaseView(window));
        failure.rethrow();
      },
      executeAction: (action, window) => {
        const normal = (
          READER_SELECTION_NORMAL_ACTIONS as readonly ReaderSelectionAction[]
        ).includes(action);
        if (!isCurrent(window) || ports.mode() !== (normal ? 'normal' : 'visual')) return false;
        return execute(action, window);
      },
    };
  });
}
