import type { ModuleHost } from '../../core/module-host';
import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import { CleanupFailure } from '../../core/cleanup';
import { ACTION_LABELS } from '../../input/actions';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { deleteAnnotation as deleteReaderAnnotation } from '../../operations/delete-annotation';
import {
  clearAnnotationSelection,
  computeSelectionPosition,
  readerOwnerWindow,
  readerSelectionIsFiltered,
  readerSelectionText,
  validateReaderSelection,
  setAnnotationColorFilter,
} from '../../toolkit';
import {
  COLORS,
  type AnnotationColor,
  type AnnotationDraft,
  type AnnotationRuntime,
  type AnnotationSelectionParams,
  type ItemRuntime,
  type PdfWindow,
  type ReaderRuntime,
  type ReaderTimer,
} from '../../reader/types';
import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';
import { bindReaderAnnotationActions, type ReaderAnnotationAction } from './actions';
export type { ReaderAnnotationAction } from './actions';

export interface ReaderAnnotationsModulePorts {
  readonly reader: ReaderRuntime;
  readonly activeWindow: () => PdfWindow | null;
  readonly capturePresentation: (window: PdfWindow) => () => boolean;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly captureViewLifetime: (window: PdfWindow) => () => boolean;
  readonly selectionParams: (window: PdfWindow) => AnnotationSelectionParams | null;
  readonly itemForReader: () => ItemRuntime | null;
  readonly selectedAnnotationKey: () => string | null;
  readonly rememberAnnotation: (key: string) => void;
  readonly clearAnnotation: (key?: string) => void;
  readonly clearNativeSelection: () => void;
  readonly setModeNormal: () => void;
  readonly releaseNativeInput: () => void;
  readonly defaultHighlightColor: () => AnnotationColor;
  readonly commentEnabled: () => boolean;
  readonly themeRoot: (root: HTMLElement) => () => void;
  readonly nativeEditableFocused: () => boolean;
  readonly onNativeEditorFocus: () => void;
  readonly onInputOwnerChanged: () => void;
  readonly onCommentExit: (saved: boolean, window: PdfWindow) => void;
  readonly language: () => KeyGuideLanguage;
  readonly locale: () => string;
  readonly copyText: (text: string) => void;
  readonly beginSelectionAction: () => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

export interface ReaderAnnotationsModule {
  readonly commentEditor: ReaderCommentEditor;
  filterColor(): AnnotationColor | null;
  executeAction(action: ReaderAnnotationAction, window: PdfWindow): boolean;
  highlight(
    window: PdfWindow,
    color: AnnotationColor,
    focusComment?: boolean,
    annotationType?: 'highlight' | 'underline',
  ): Promise<void>;
  recolor(window: PdfWindow, color: AnnotationColor): Promise<void>;
  openComment(): Promise<void>;
  selectionActions(
    window: PdfWindow,
    language: KeyGuideLanguage,
  ): readonly ReaderSelectionActionDefinition[];
}

interface AnnotationZoteroRuntime {
  readonly Item: new (type: 'annotation') => AnnotationDraft;
  readonly Items: {
    get(id: number): ItemRuntime | null | false;
    getByLibraryAndKey?(libraryID: number, key: string): AnnotationRuntime | null | false;
    getByLibraryAndKeyAsync?(
      libraryID: number,
      key: string,
    ): Promise<AnnotationRuntime | null | false>;
  };
}

function zoteroRuntime(): AnnotationZoteroRuntime {
  return Zotero as unknown as AnnotationZoteroRuntime;
}
function annotationText(value: string): string {
  return value.normalize('NFKC').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/** Owns annotation operations and their child editor; the Surface owns target and view identity. */
export function createReaderAnnotationsModule(
  host: ModuleHost,
  ports: ReaderAnnotationsModulePorts,
): ReaderAnnotationsModule {
  return host.activate('reader-annotations', (scope) => {
    let filter: AnnotationColor | null = null;
    const timers = new Set<ReaderTimer>();
    const clearTimer = (timer: ReaderTimer | null): void => {
      if (timer !== null) timers.delete(timer);
      clearTimeout(timer ?? undefined);
    };
    scope.add(() => {
      const failure = new CleanupFailure();
      for (const timer of timers) failure.run(() => clearTimeout(timer));
      timers.clear();
      failure.rethrow();
    });
    const captureView = (window: PdfWindow): (() => boolean) => {
      const current = ports.captureView(window);
      return () => scope.isCurrent() && current();
    };
    const capturePresentation = (window: PdfWindow): (() => boolean) => {
      const current = ports.capturePresentation(window);
      return () => scope.isCurrent() && current();
    };
    const selectedAnnotation = (): AnnotationRuntime | null => {
      const key = ports.selectedAnnotationKey();
      return key
        ? (ports
            .itemForReader()
            ?.getAnnotations?.()
            .find((item) => item.key === key) ?? null)
        : null;
    };
    const resolveAnnotation = async (key: string): Promise<AnnotationRuntime | null> => {
      const attachment = ports.itemForReader();
      if (!attachment) return null;
      let annotation = attachment.getAnnotations?.().find((item) => item.key === key) ?? null;
      if (!annotation && attachment.libraryID !== undefined)
        annotation = zoteroRuntime().Items.getByLibraryAndKey?.(attachment.libraryID, key) || null;
      if (annotation?.loadDataType) await annotation.loadDataType('annotation');
      return annotation;
    };
    const annotationForSave = async (
      target: AnnotationCommentTarget,
    ): Promise<AnnotationRuntime | null> => {
      const items = zoteroRuntime().Items;
      let annotation: AnnotationRuntime | null = null;
      if (target.itemID !== null) annotation = items.get(target.itemID) || null;
      if (!annotation && target.libraryID !== null)
        annotation = items.getByLibraryAndKey?.(target.libraryID, target.key) || null;
      if (!annotation && target.libraryID !== null && items.getByLibraryAndKeyAsync)
        annotation = (await items.getByLibraryAndKeyAsync(target.libraryID, target.key)) || null;
      if (annotation?.loadDataType) await annotation.loadDataType('annotation');
      return annotation;
    };
    const commentEditor = new ReaderCommentEditor({
      reader: ports.reader,
      schedule: (delay, task) => {
        const timer = setTimeout(() => {
          if (!timers.delete(timer) || !scope.isCurrent()) return;
          task();
        }, delay);
        timers.add(timer);
        if (!scope.isCurrent()) clearTimer(timer);
        return timer;
      },
      clearTimer,
      captureView,
      captureViewLifetime: (window) => {
        const current = ports.captureViewLifetime(window);
        return () => scope.isCurrent() && current();
      },
      themeRoot: ports.themeRoot,
      activePdfWindow: ports.activeWindow,
      resolveAnnotation,
      annotationForSave,
      nativeEditableFocused: ports.nativeEditableFocused,
      onNativeEditorFocus: ports.onNativeEditorFocus,
      onInputOwnerChanged: ports.onInputOwnerChanged,
      onExit: ports.onCommentExit,
      debug: ports.debug,
      locale: ports.locale,
    });
    scope.add(() => commentEditor.dispose());
    const highlight = async (
      window: PdfWindow,
      color: AnnotationColor,
      focusComment = false,
      annotationType: 'highlight' | 'underline' = 'highlight',
    ): Promise<void> => {
      const current = capturePresentation(window);
      if (!current()) return;
      const params = ports.selectionParams(window);
      const selection = window.getSelection();
      const hasDomSelection = selection && !selection.isCollapsed;
      const computed = hasDomSelection ? computeSelectionPosition(window, selection) : null;
      if (hasDomSelection && (!computed || computed.position === null)) {
        ports.showStatus(
          computed?.failure === 'unsupported-page-span'
            ? '✗ unsupported page span: select one page or two adjacent pages'
            : '✗ no complete PDF selection rects',
          2000,
        );
        return;
      }
      const useNativeParams =
        !readerSelectionIsFiltered(window) &&
        params?.annotation &&
        (!hasDomSelection ||
          annotationText(params.annotation.text ?? '') ===
            annotationText(readerSelectionText(window, selection)));
      let text: string;
      let position: unknown;
      let sortIndex: string | undefined;
      let pageLabel: string | undefined;
      if (useNativeParams) ({ text = '', position, sortIndex, pageLabel } = params.annotation);
      else {
        if (!selection || !computed || computed.position === null) {
          ports.showStatus('✗ no selection', 1500);
          return;
        }
        text = readerSelectionText(window, selection);
        ({ position, sortIndex, pageLabel } = computed);
      }
      const attachment = ports.itemForReader();
      if (!attachment?.id || attachment.libraryID === undefined) {
        if (current()) ports.showStatus('✗ no attachment', 2000);
        return;
      }
      if (readerSelectionIsFiltered(window)) {
        const valid = await validateReaderSelection(window);
        if (!current()) return;
        if (!valid) {
          ports.showStatus(t('bodySelection.changed', ports.language()), 2000);
          return;
        }
      }
      let key: string;
      try {
        const item = new (zoteroRuntime().Item)('annotation');
        item.libraryID = attachment.libraryID;
        item.parentID = attachment.id;
        item.annotationType = annotationType;
        item.annotationColor = color;
        item.annotationText = annotationText(text);
        item.annotationComment = '';
        item.annotationIsExternal = false;
        if (sortIndex) item.annotationSortIndex = sortIndex;
        if (pageLabel) item.annotationPageLabel = pageLabel;
        if (position)
          item.annotationPosition =
            typeof position === 'string' ? position : JSON.stringify(position);
        await item.saveTx();
        key = item.key;
      } catch (error) {
        ports.debug(`create Reader annotation failed: ${String(error)}`);
        if (current()) ports.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
        return;
      }
      if (!key || !current()) return;
      ports.clearNativeSelection();
      ports.rememberAnnotation(key);
      if (!useNativeParams) {
        selection?.removeAllRanges();
        if (!focusComment) ports.setModeNormal();
      }
      ports.showStatus('✓ annotated', 1200);
      if (focusComment && current()) {
        const viewCurrent = captureView(window);
        ports.releaseNativeInput();
        ports.setModeNormal();
        if (viewCurrent() && ports.activeWindow() === window) await commentEditor.open(key);
      }
    };
    const deleteAnnotation = async (window: PdfWindow): Promise<void> => {
      const current = capturePresentation(window);
      if (!current()) return;
      const language = ports.language();
      const target = selectedAnnotation();
      if (!target?.eraseTx) {
        ports.showStatus('✗ select an annotation first', 2000);
        return;
      }
      const owner = readerOwnerWindow(ports.reader);
      if (!owner) {
        ports.showStatus(`✗ ${t('status.readerAnnotationDeleteUnconfirmable', language)}`, 2000);
        return;
      }
      const summary = t('target.readerAnnotation', language);
      try {
        const prompt = t('confirm.readerAnnotationDelete', language).replace('{target}', summary);
        if (!owner.confirm(prompt)) {
          if (current())
            ports.showStatus(
              `→ ${t('status.destructiveCancelled', language).replace('{target}', summary)}`,
              2000,
            );
          return;
        }
        if (!current()) return;
        await deleteReaderAnnotation(target);
        if (!current()) return;
        try {
          if (ports.selectedAnnotationKey() === target.key) clearAnnotationSelection(ports.reader);
        } catch (error) {
          ports.debug(`clear deleted Reader annotation selection failed: ${String(error)}`);
        }
        if (!current()) return;
        ports.clearAnnotation(target.key);
        ports.showStatus(
          `✓ ${t('status.readerAnnotationDeleteComplete', language).replace('{target}', summary)}`,
          1500,
        );
      } catch (error) {
        ports.debug(`delete Reader annotation failed: ${String(error)}`);
        if (current())
          ports.showStatus(
            `✗ ${t('status.readerAnnotationDeleteFailed', language).replace('{target}', summary)}`,
            2000,
          );
      }
    };
    const recolor = async (window: PdfWindow, color: AnnotationColor): Promise<void> => {
      const current = capturePresentation(window);
      if (!current()) return;
      const target = selectedAnnotation();
      if (!target) {
        ports.showStatus('✗ select an annotation first', 2000);
        return;
      }
      try {
        target.annotationColor = color;
        await target.saveTx();
        if (current()) ports.showStatus('✓ recolored', 1200);
      } catch (error) {
        ports.debug(`recolor Reader annotation failed: ${String(error)}`);
        if (current()) ports.showStatus(`✗ ${String(error).slice(0, 40)}`, 4000);
      }
    };
    const openComment = async (): Promise<void> => {
      const window = ports.activeWindow();
      if (!window || !capturePresentation(window)()) return;
      const key = ports.selectedAnnotationKey();
      if (!key) {
        ports.showStatus('✗ select an annotation first', 2000);
        return;
      }
      const viewCurrent = captureView(window);
      ports.releaseNativeInput();
      ports.setModeNormal();
      if (!viewCurrent() || ports.activeWindow() !== window) return;
      ports.rememberAnnotation(key);
      await commentEditor.open(key);
    };
    const execute = bindReaderAnnotationActions(host, scope, (action, window) => {
      if (!capturePresentation(window)()) return;
      switch (action) {
        case 'editAnnotation':
          if (ports.commentEnabled()) void openComment();
          return;
        case 'deleteAnnotation':
          void deleteAnnotation(window);
          return;
        case 'recolorYellow':
          void recolor(window, COLORS.yellow);
          return;
        case 'recolorRed':
          void recolor(window, COLORS.red);
          return;
        case 'recolorGreen':
          void recolor(window, COLORS.green);
          return;
        case 'recolorPurple':
          void recolor(window, COLORS.purple);
          return;
        case 'highlightYellow':
          void highlight(window, COLORS.yellow);
          return;
        case 'highlightRed':
          void highlight(window, COLORS.red);
          return;
        case 'highlightGreen':
          void highlight(window, COLORS.green);
          return;
        case 'highlightBlue':
          void highlight(window, COLORS.blue);
          return;
        case 'highlightPurple':
          void highlight(window, COLORS.purple);
          return;
        case 'underlineSelection':
          void highlight(window, ports.defaultHighlightColor(), false, 'underline');
          return;
        case 'addNote':
          void highlight(window, ports.defaultHighlightColor(), true);
          return;
        case 'yankAnnotation':
        case 'yankAnnotationComment': {
          const annotation = selectedAnnotation();
          const comment = action === 'yankAnnotationComment';
          const text = comment ? annotation?.annotationComment : annotation?.annotationText;
          if (!text)
            ports.showStatus(
              comment ? '✗ annotation has no comment' : '✗ annotation has no text',
              2000,
            );
          else ports.copyText(annotationText(text));
          return;
        }
        case 'filterYellow':
        case 'filterRed':
        case 'filterGreen':
        case 'filterBlue':
        case 'filterPurple':
        case 'filterClear': {
          const color =
            action === 'filterYellow'
              ? COLORS.yellow
              : action === 'filterRed'
                ? COLORS.red
                : action === 'filterGreen'
                  ? COLORS.green
                  : action === 'filterBlue'
                    ? COLORS.blue
                    : action === 'filterPurple'
                      ? COLORS.purple
                      : null;
          setAnnotationColorFilter(ports.reader, color ? [color] : []);
          filter = color;
          ports.showStatus(color ? '✓ filter set' : '✓ filter cleared', 1200);
          return;
        }
      }
    });
    return {
      commentEditor,
      filterColor: () => filter,
      executeAction: execute,
      highlight,
      recolor,
      openComment,
      selectionActions: (window, language) => [
        {
          id: 'neo.underline',
          label: ACTION_LABELS.underlineSelection[language],
          run: () => {
            ports.beginSelectionAction();
            void highlight(window, ports.defaultHighlightColor(), false, 'underline');
          },
        },
        {
          id: 'neo.add-note',
          label: ACTION_LABELS.addNote[language],
          run: () => {
            ports.beginSelectionAction();
            void highlight(window, ports.defaultHighlightColor(), true);
          },
        },
      ],
    };
  });
}
