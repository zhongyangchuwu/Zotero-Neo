import type { ModuleHost } from '../../core/module-host';
import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import { CleanupFailure } from '../../core/cleanup';
import { ACTION_LABELS } from '../../input/actions';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { batchStatus, type BatchOutcome } from '../../i18n/batch-result';
import { deleteAnnotation as deleteReaderAnnotation } from '../../operations/delete-annotation';
import {
  clearAnnotationSelection,
  computeSelectionPosition,
  readerAnnotationWriteGuard,
  readerOwnerWindow,
  readerSelectionIsFiltered,
  readerSelectionText,
  selectedAnnotationIDs,
  setAnnotationColorFilter,
  validateReaderSelection,
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

type RecolorTarget = AnnotationRuntime & {
  readonly annotationIsExternal?: boolean;
  isEditable?(): boolean;
  saveTx(options?: { readonly skipSelect: true }): Promise<unknown>;
};

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
    const statusText = (key: string, duration: number): void =>
      ports.showStatus(t(key, ports.language()), duration);
    const selectedForBatch = (result: BatchOutcome): readonly AnnotationRuntime[] => {
      const keys = new Set<string>();
      try {
        const selected = selectedAnnotationIDs(ports.reader);
        if (selected.length) {
          // Read primitives from the host array without changing native selection.
          for (let i = 0; i < selected.length; i++) {
            const key = selected[i];
            if (typeof key === 'string' && key) keys.add(key);
            else result.unavailable = (result.unavailable ?? 0) + 1;
          }
        } else {
          const key = ports.selectedAnnotationKey();
          if (key) keys.add(key);
        }
        if (!keys.size) return [];

        const byKey = new Map<string, AnnotationRuntime>();
        for (const annotation of ports.itemForReader()?.getAnnotations?.() ?? []) {
          try {
            const key = annotation.key;
            if (keys.has(key)) byKey.set(key, annotation);
          } catch (error) {
            ports.debug(`read Reader annotation key failed: ${String(error)}`);
          }
        }
        const targets: AnnotationRuntime[] = [];
        for (const key of keys) {
          const target = byKey.get(key);
          if (target) targets.push(target);
          else result.unavailable = (result.unavailable ?? 0) + 1;
        }
        return targets;
      } catch (error) {
        ports.debug(`resolve selected Reader annotations failed: ${String(error)}`);
        result.failed = keys.size || 1;
        return [];
      }
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
      if (
        annotation &&
        (annotation.key !== target.key || annotation.libraryID !== target.libraryID)
      )
        return null;
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
            ? t('reader.annotation.unsupportedSpan', ports.language())
            : t('reader.annotation.invalidGeometry', ports.language()),
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
          statusText('reader.selection.none', 1500);
          return;
        }
        text = readerSelectionText(window, selection);
        ({ position, sortIndex, pageLabel } = computed);
      }
      const attachment = ports.itemForReader();
      if (!attachment?.id || attachment.libraryID === undefined) {
        if (current()) statusText('reader.annotation.noAttachment', 2000);
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
        if (current()) statusText('reader.annotation.createFailed', 4000);
        return;
      }
      if (!key || !current()) return;
      ports.clearNativeSelection();
      ports.rememberAnnotation(key);
      if (!useNativeParams) {
        selection?.removeAllRanges();
        if (!focusComment) ports.setModeNormal();
      }
      statusText('reader.annotation.created', 1200);
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
        statusText('reader.annotation.selectFirst', 2000);
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
      const result: BatchOutcome = { done: 0 };
      const targets: readonly RecolorTarget[] = selectedForBatch(result);
      if (!current()) return;
      let canRecolor: (key: string) => boolean;
      try {
        canRecolor = readerAnnotationWriteGuard(ports.reader);
      } catch (error) {
        ports.debug(`read Reader annotation permissions failed: ${String(error)}`);
        result.failed = (result.failed ?? 0) + targets.length;
        if (current())
          ports.showStatus(batchStatus('readerAnnotationRecolor', result, ports.language()), 1500);
        return;
      }
      for (const target of targets) {
        if (!current()) return;
        try {
          if (
            target.deleted ||
            target.annotationIsExternal ||
            target.isEditable?.() === false ||
            typeof target.saveTx !== 'function' ||
            !canRecolor(target.key)
          ) {
            result.unavailable = (result.unavailable ?? 0) + 1;
          } else if (target.annotationColor === color) {
            result.unchanged = (result.unchanged ?? 0) + 1;
          } else if (current()) {
            target.annotationColor = color;
            const saved = await target.saveTx({ skipSelect: true });
            if (saved === false) result.unchanged = (result.unchanged ?? 0) + 1;
            else result.done++;
          }
        } catch (error) {
          result.failed = (result.failed ?? 0) + 1;
          ports.debug(`recolor Reader annotation failed: ${String(error)}`);
        }
      }
      if (current())
        ports.showStatus(batchStatus('readerAnnotationRecolor', result, ports.language()), 1500);
    };
    const copyAnnotation = (window: PdfWindow, comment: boolean): void => {
      const current = capturePresentation(window);
      if (!current()) return;
      const result: BatchOutcome = { done: 0 };
      const parts: string[] = [];
      for (const annotation of selectedForBatch(result)) {
        try {
          if (annotation.deleted) {
            result.unavailable = (result.unavailable ?? 0) + 1;
            continue;
          }
          const raw = comment ? annotation.annotationComment : annotation.annotationText;
          const text = raw ? annotationText(raw) : '';
          if (text) parts.push(text);
          else result.missingData = (result.missingData ?? 0) + 1;
        } catch (error) {
          result.failed = (result.failed ?? 0) + 1;
          ports.debug(`read Reader annotation for copy failed: ${String(error)}`);
        }
      }
      if (!current()) return;
      if (parts.length) {
        try {
          ports.copyText(parts.join('\n\n'));
          result.done = parts.length;
        } catch (error) {
          result.failed = (result.failed ?? 0) + parts.length;
          ports.debug(`copy Reader annotations failed: ${String(error)}`);
        }
      }
      if (current())
        ports.showStatus(batchStatus('readerAnnotationCopy', result, ports.language()), 1500);
    };
    const openComment = async (): Promise<void> => {
      const window = ports.activeWindow();
      if (!window || !capturePresentation(window)()) return;
      const key = ports.selectedAnnotationKey();
      if (!key) {
        statusText('reader.annotation.selectFirst', 2000);
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
        case 'yankAnnotationComment':
          copyAnnotation(window, action === 'yankAnnotationComment');
          return;
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
          statusText(
            color ? 'reader.annotation.filterSet' : 'reader.annotation.filterCleared',
            1200,
          );
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
