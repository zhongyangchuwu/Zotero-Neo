import type { ModuleHost } from '../../core/module-host';
import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import { ACTION_LABELS } from '../../input/actions';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { batchStatus, type BatchOutcome } from '../../i18n/batch-result';
import { deleteAnnotation as deleteReaderAnnotation } from '../../operations/delete-annotation';
import {
  clearAnnotationSelection,
  computeSelectionPosition,
  filteredReaderPdfSelection,
  readerAnnotationCommentFocus,
  readerAnnotationWriteGuard,
  readerOwnerWindow,
  readerReadingMode,
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
import { bindReaderAnnotationActions, type ReaderAnnotationAction } from './actions';
export type { ReaderAnnotationAction } from './actions';

export interface ReaderAnnotationsModulePorts {
  readonly reader: ReaderRuntime;
  readonly capturePresentation: (window: PdfWindow) => () => boolean;
  readonly captureView: (window: PdfWindow) => () => boolean;
  readonly selectionParams: (window: PdfWindow) => AnnotationSelectionParams | null;
  readonly itemForReader: () => ItemRuntime | null;
  readonly selectedAnnotationKey: () => string | null;
  readonly rememberAnnotation: (key: string) => void;
  readonly clearAnnotation: (key?: string) => void;
  readonly clearNativeSelection: () => void;
  readonly setModeNormal: () => void;
  readonly defaultHighlightColor: () => AnnotationColor;
  readonly language: () => KeyGuideLanguage;
  readonly copyText: (text: string) => void;
  readonly beginSelectionAction: (closePanel?: boolean) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

export interface ReaderAnnotationsModule {
  filterColor(): AnnotationColor | null;
  executeAction(action: ReaderAnnotationAction, window: PdfWindow): boolean;
  highlight(
    window: PdfWindow,
    color: AnnotationColor,
    focusComment?: boolean,
    annotationType?: 'highlight' | 'underline',
  ): Promise<void>;
  recolor(window: PdfWindow, color: AnnotationColor): Promise<void>;
  openComment(window: PdfWindow): boolean;
  cancelCommentFocus(window?: PdfWindow): void;
  selectionActions(
    window: PdfWindow,
    language: KeyGuideLanguage,
  ): readonly ReaderSelectionActionDefinition[];
}

interface AnnotationZoteroRuntime {
  readonly Item: new (type: 'annotation') => AnnotationDraft;
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

/** Owns annotation operations; the Surface owns target and view identity. */
export function createReaderAnnotationsModule(
  host: ModuleHost,
  ports: ReaderAnnotationsModulePorts,
): ReaderAnnotationsModule {
  return host.activate('reader-annotations', (scope) => {
    let filter: AnnotationColor | null = null;
    let commentFocus: { window: PdfWindow; timer?: ReaderTimer } | null = null;
    const cancelCommentFocus = (window?: PdfWindow): void => {
      if (!commentFocus || (window && window !== commentFocus.window)) return;
      clearTimeout(commentFocus.timer);
      commentFocus = null;
    };
    scope.add(cancelCommentFocus);
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
    const requestCommentFocus = (
      window: PdfWindow,
      key: string,
      current = captureView(window),
    ): void => {
      cancelCommentFocus();
      if (!current()) return;
      const request: NonNullable<typeof commentFocus> = { window };
      commentFocus = request;
      const ownsFocus = (): boolean => commentFocus === request && current();
      const finish = (status?: string): void => {
        if (commentFocus !== request) return;
        cancelCommentFocus();
        if (status && current()) statusText(status, 2000);
      };
      const deadline = Date.now() + 2000;
      try {
        const attempt = readerAnnotationCommentFocus(ports.reader, window, key);
        if (!attempt) {
          finish('comment.unavailable');
          return;
        }
        const check = (): void => {
          try {
            if (!ownsFocus()) return finish();
            if (Date.now() >= deadline) return finish('comment.unavailable');
            const result = attempt();
            if (!ownsFocus() || result === 'cancelled') return finish();
            if (result === 'readOnly') return finish('comment.readOnly');
            if (result === 'unavailable') return finish('comment.unavailable');
            if (result === 'pending') {
              request.timer = setTimeout(check, 25);
              return;
            }
            // Retire before focus: focus/blur events synchronously hand input to Zotero.
            finish();
            try {
              result.focus();
            } catch (error) {
              ports.debug(`focus native Reader comment failed: ${String(error)}`);
            }
            if (result.ownerDocument.activeElement !== result && current())
              statusText('comment.unavailable', 2000);
          } catch (error) {
            ports.debug(`focus native Reader comment failed: ${String(error)}`);
            if (commentFocus === request) finish('comment.unavailable');
          }
        };
        check();
      } catch (error) {
        ports.debug(`resolve native Reader comment failed: ${String(error)}`);
        finish('comment.unavailable');
      }
    };
    const highlight = async (
      window: PdfWindow,
      color: AnnotationColor,
      focusComment = false,
      annotationType: 'highlight' | 'underline' = 'highlight',
    ): Promise<void> => {
      const current = capturePresentation(window);
      if (!current()) return;
      const focusCurrent = focusComment ? captureView(window) : null;
      const params = ports.selectionParams(window);
      const selection = window.getSelection();
      const hasDomSelection = selection && !selection.isCollapsed;
      const filtered = readerSelectionIsFiltered(window);
      const filteredPdf = !!hasDomSelection && filtered && !readerReadingMode(window);
      const parts = filteredPdf ? filteredReaderPdfSelection(window, selection) : null;
      const computed =
        hasDomSelection && !filteredPdf ? computeSelectionPosition(window, selection) : null;
      if (
        hasDomSelection &&
        (filteredPdf ? !parts?.length : !computed || computed.position === null)
      ) {
        ports.showStatus(
          computed?.failure === 'unsupported-page-span'
            ? t('reader.annotation.unsupportedSpan', ports.language())
            : t('reader.annotation.invalidGeometry', ports.language()),
          2000,
        );
        return;
      }
      const useNativeParams =
        !filtered &&
        params?.annotation &&
        (!hasDomSelection ||
          annotationText(params.annotation.text ?? '') ===
            annotationText(readerSelectionText(window, selection)));
      let drafts: readonly {
        readonly text?: string;
        readonly position?: unknown;
        readonly sortIndex?: string;
        readonly pageLabel?: string;
      }[];
      if (parts?.length) drafts = parts;
      else if (useNativeParams) drafts = [params.annotation];
      else {
        if (!selection || !computed || computed.position === null) {
          statusText('reader.selection.none', 1500);
          return;
        }
        drafts = [{ ...computed, text: readerSelectionText(window, selection) }];
      }
      const attachment = ports.itemForReader();
      if (!attachment?.id || attachment.libraryID === undefined) {
        if (current()) statusText('reader.annotation.noAttachment', 2000);
        return;
      }
      if (filtered) {
        const valid = await validateReaderSelection(window);
        if (!current()) return;
        if (!valid) {
          ports.showStatus(t('bodySelection.changed', ports.language()), 2000);
          return;
        }
      }
      let key: string | undefined;
      try {
        for (const { text = '', position, sortIndex, pageLabel } of drafts) {
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
          key ??= item.key;
        }
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
      if (focusCurrent && focusCurrent() && current()) {
        ports.setModeNormal();
        requestCommentFocus(window, key, focusCurrent);
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
    const openComment = (window: PdfWindow): boolean => {
      let key: string | undefined;
      try {
        key = selectedAnnotationIDs(ports.reader)[0];
      } catch (error) {
        ports.debug(`read native Reader annotation selection failed: ${String(error)}`);
        statusText('comment.unavailable', 2000);
        return true;
      }
      if (!key) return false;
      requestCommentFocus(window, key);
      return true;
    };
    const execute = bindReaderAnnotationActions(host, scope, (action, window) => {
      if (!capturePresentation(window)()) return;
      switch (action) {
        case 'editAnnotation':
          if (!openComment(window)) statusText('reader.annotation.selectFirst', 2000);
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
      filterColor: () => filter,
      executeAction: execute,
      highlight,
      recolor,
      openComment,
      cancelCommentFocus,
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
            ports.beginSelectionAction(true);
            void highlight(window, ports.defaultHighlightColor(), true);
          },
        },
      ],
    };
  });
}
