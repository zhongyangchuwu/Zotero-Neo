import type { ModuleHost, ModuleScope } from '../../core/module-host';
import { t } from '../../i18n';
import type { ActionId } from '../../input/actions';
import type {
  NavigationExecution,
  NavigationIntent,
  NavigationOutcome,
} from '../../navigation/types';
import type { ItemRuntime, PdfWindow, ReaderRuntime } from '../../reader/types';
import {
  readerLoadedAnnotationIDs,
  selectReaderAnnotation,
  type ReaderNativeNavigation,
} from '../../toolkit';
import type { ReaderNavigation } from './navigation';
import type { ReaderMarks } from './marks';
import type { ReaderNativeSidebar } from './native-sidebar';
import type { ReaderCaptionTargets } from './caption-targets';

import { READER_NAVIGATION_ACTIONS } from './capabilities';
export type ReaderNavigationAction = (typeof READER_NAVIGATION_ACTIONS)[number];
export function isReaderNavigationAction(action: ActionId): action is ReaderNavigationAction {
  return (READER_NAVIGATION_ACTIONS as readonly ActionId[]).includes(action);
}

export interface ReaderNavigationActionPorts {
  readonly executeNavigation: (
    window: PdfWindow,
    intent: NavigationIntent,
    perform: (navigation: ReaderNativeNavigation) => unknown,
    options?: { readonly admission?: 'replace' | 'motion'; readonly onUnavailable?: () => void },
  ) => NavigationExecution | null;
  readonly clearAnnotation: () => void;
  readonly scrollStep: () => number;
  readonly viewport: (window: PdfWindow) => number;
  readonly scrollBy: (window: PdfWindow, x: number, y: number, smooth?: boolean) => boolean;
  readonly scrollToPagePosition: (
    window: PdfWindow,
    position: 'top' | 'center' | 'bottom',
  ) => boolean;
  readonly reader: ReaderRuntime;
  readonly itemForReader: () => ItemRuntime | null;
  readonly selectedAnnotationKey: () => string | null;
  readonly filterColor: () => string | null;
  readonly rememberAnnotation: (key: string | null) => void;
  readonly invocationCurrent: (window: PdfWindow) => () => boolean;
  readonly captionsLoading: () => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}
interface Request {
  readonly window: PdfWindow;
  readonly count: number;
}

export function bindReaderNavigationActions(
  host: ModuleHost,
  scope: ModuleScope,
  navigation: ReaderNavigation,
  marks: ReaderMarks,
  sidebar: ReaderNativeSidebar,
  captions: ReaderCaptionTargets,
  ports: ReaderNavigationActionPorts,
  language: () => string,
): (action: ReaderNavigationAction, window: PdfWindow, count: number) => boolean {
  const handlers = new Map<ReaderNavigationAction, (request: Request) => boolean>();
  for (const action of READER_NAVIGATION_ACTIONS) {
    handlers.set(
      action,
      host.bind<Request>(scope, 'reader-normal', action, ({ window, count }) => {
        const number = Math.max(1, count || 1);
        const intent = (
          readerPath: NonNullable<NavigationIntent['context']>['readerPath'],
          isCurrent = () => scope.isCurrent(),
        ): NavigationIntent => ({
          cause: { kind: 'action', action },
          surface: 'reader',
          context: { readerPath, isCurrent },
        });
        const motion = (scroll: () => boolean): void => {
          ports.executeNavigation(window, intent('scroll'), () => scroll(), {
            admission: 'motion',
            onUnavailable: scroll,
          });
        };
        switch (action) {
          case 'toggleReadingMode': {
            const current = ports.invocationCurrent(window);
            void navigation.toggleReadingMode(window).catch((error: unknown) => {
              ports.debug(`Reader reading mode failed: ${String(error)}`);
              if (scope.isCurrent() && current())
                ports.showStatus(t('reader.navigation.readingModeFailed', language()), 3000);
            });
            break;
          }
          case 'scrollDown':
          case 'scrollUp':
          case 'scrollLeft':
          case 'scrollRight': {
            const amount = ports.scrollStep() * number;
            const x = action === 'scrollLeft' ? -amount : action === 'scrollRight' ? amount : 0;
            const y = action === 'scrollUp' ? -amount : action === 'scrollDown' ? amount : 0;
            motion(() => {
              ports.clearAnnotation();
              ports.scrollBy(window, x, y);
              return true;
            });
            break;
          }
          case 'halfPageDown':
          case 'halfPageUp':
          case 'fullPageDown':
          case 'fullPageUp': {
            const direction = action.endsWith('Up') ? -1 : 1;
            const factor = action.startsWith('half') ? 0.5 : 1;
            motion(() => {
              ports.clearAnnotation();
              ports.scrollBy(window, 0, direction * factor * ports.viewport(window) * number, true);
              return true;
            });
            break;
          }
          case 'scrollTop':
          case 'scrollCenter':
          case 'scrollBottom':
            motion(() =>
              ports.scrollToPagePosition(
                window,
                action === 'scrollTop' ? 'top' : action === 'scrollCenter' ? 'center' : 'bottom',
              ),
            );
            break;
          case 'prevPage':
          case 'nextPage': {
            const direction = action === 'prevPage' ? -number : number;
            const navigate = (): void => navigation.navigatePage(direction, window);
            ports.executeNavigation(
              window,
              intent('page-step'),
              (native) => navigation.navigatePage(direction, window, native),
              { admission: 'motion', onUnavailable: navigate },
            );
            break;
          }
          case 'firstPage':
          case 'lastPage': {
            const last = action === 'lastPage';
            const supported = navigation.pageNavigationSupported(window);
            const navigate = (): void => navigation.navigateBoundary(count, last, window);
            ports.executeNavigation(
              window,
              intent(supported ? 'explicit-page' : 'fallback-scroll'),
              (native) => navigation.navigateBoundary(count, last, window, native),
              { admission: supported ? 'replace' : 'motion', onUnavailable: navigate },
            );
            break;
          }
          case 'zoomIn':
          case 'zoomOut':
          case 'zoomReset':
            navigation.zoom(
              action === 'zoomIn' ? 'in' : action === 'zoomOut' ? 'out' : 'reset',
              action === 'zoomReset' ? 1 : number,
            );
            break;
          case 'openSearch':
            navigation.openSearch(window);
            break;
          case 'clearSearch':
            navigation.clearSearch();
            break;
          case 'findNext':
          case 'findPrevious': {
            const next = action === 'findNext';
            const find = (): void => {
              navigation.find(next, window);
            };
            ports.executeNavigation(
              window,
              intent('search'),
              (native) => navigation.find(next, window, native),
              { onUnavailable: find },
            );
            break;
          }
          case 'toggleReaderSidebarOutline':
            sidebar.toggle('outline', window);
            break;
          case 'toggleMarksExplorer':
            sidebar.toggle('marks', window);
            break;
          case 'focusReaderOutline':
          case 'focusReaderMarks':
          case 'focusReaderAnnotations':
          case 'focusReaderThumbnails':
            sidebar.focus(
              action === 'focusReaderOutline'
                ? 'outline'
                : action === 'focusReaderMarks'
                  ? 'marks'
                  : action === 'focusReaderAnnotations'
                    ? 'annotations'
                    : 'thumbnails',
              window,
            );
            break;
          case 'prevAnnotation':
          case 'nextAnnotation': {
            const invocationCurrent = ports.invocationCurrent(window);
            const current = () => scope.isCurrent() && invocationCurrent();
            if (!current()) break;
            const color = ports.filterColor();
            const annotations: { key: string; sortIndex: string }[] = [];
            let skipped = 0;
            try {
              const loaded = readerLoadedAnnotationIDs(ports.reader);
              for (const annotation of ports.itemForReader()?.getAnnotations?.() ?? []) {
                try {
                  const type = annotation.annotationType;
                  if (
                    type !== 'highlight' &&
                    type !== 'underline' &&
                    type !== 'note' &&
                    type !== 'text'
                  )
                    continue;
                  if (color && annotation.annotationColor !== color) continue;
                  const { key, annotationSortIndex: sortIndex } = annotation;
                  if (
                    typeof key !== 'string' ||
                    !key ||
                    annotation.deleted ||
                    (loaded && !loaded.has(key)) ||
                    (sortIndex != null && typeof sortIndex !== 'string')
                  ) {
                    skipped++;
                    continue;
                  }
                  annotations.push({ key, sortIndex: sortIndex ?? '' });
                } catch (error) {
                  skipped++;
                  ports.debug(
                    `read Reader annotation navigation candidate failed: ${String(error)}`,
                  );
                }
              }
            } catch (error) {
              ports.debug(`read Reader annotations for navigation failed: ${String(error)}`);
              if (current())
                ports.showStatus(t('reader.annotation.navigationUnavailable', language()), 2000);
              break;
            }
            if (!current()) break;
            const locale = language();
            const skipSuffix = skipped
              ? t('reader.annotation.navigationSkipped', locale).replace('{count}', String(skipped))
              : '';
            if (!annotations.length) {
              ports.showStatus(t('reader.annotation.navigationEmpty', locale) + skipSuffix, 2000);
              break;
            }
            annotations.sort((left, right) => left.sortIndex.localeCompare(right.sortIndex));
            const key = ports.selectedAnnotationKey();
            const previous = key
              ? annotations.findIndex((annotation) => annotation.key === key)
              : -1;
            const direction = action === 'prevAnnotation' ? -1 : 1;
            const index =
              previous < 0
                ? direction > 0
                  ? 0
                  : annotations.length - 1
                : (previous + direction + annotations.length) % annotations.length;
            const target = annotations[index];
            if (!target || !current()) break;
            let execution: NavigationExecution | null = null;
            const finish = (outcome: NavigationOutcome): void => {
              if (outcome.kind === 'failed')
                ports.debug(`Reader annotation navigation failed: ${String(outcome.error)}`);
              if (
                !current() ||
                (execution && !execution.isCurrent()) ||
                outcome.kind === 'stale' ||
                outcome.kind === 'cancelled'
              )
                return;
              if (outcome.kind === 'completed') ports.rememberAnnotation(target.key);
              else if (outcome.kind !== 'unchanged' || target.key !== key) {
                ports.showStatus(t('reader.annotation.navigationUnavailable', language()), 2000);
                return;
              }
              ports.showStatus(
                t('reader.annotation.navigationPosition', locale)
                  .replace('{index}', String(index + 1))
                  .replace('{total}', String(annotations.length)) + skipSuffix,
                1500,
              );
            };
            try {
              execution = ports.executeNavigation(window, intent('annotation', current), (native) =>
                selectReaderAnnotation(ports.reader, target.key, native),
              );
            } catch (error) {
              finish({ kind: 'failed', error });
              break;
            }
            if (!execution) finish({ kind: 'unavailable' });
            else if (execution.pending)
              void execution.result.then(finish, (error: unknown) =>
                finish({ kind: 'failed', error }),
              );
            else finish(execution.result);
            break;
          }
          case 'prevHeading':
          case 'nextHeading':
          case 'prevFigure':
          case 'nextFigure':
          case 'prevTable':
          case 'nextTable': {
            const category = action.endsWith('Heading')
              ? 'heading'
              : action.endsWith('Figure')
                ? 'figure'
                : 'table';
            const invocationCurrent = ports.invocationCurrent(window);
            if (category !== 'heading' && captions.state === 'idle') ports.captionsLoading();
            void navigation
              .traverseOutline(
                category,
                action.startsWith('prev') ? -1 : 1,
                window,
                () => scope.isCurrent() && invocationCurrent(),
              )
              .catch((error: unknown) => {
                if (scope.isCurrent() && invocationCurrent())
                  ports.debug(`reader Outline traversal failed: ${String(error)}`);
              });
            break;
          }
          case 'prevBookmark':
          case 'nextBookmark':
            void marks
              .traverse(
                ports.reader,
                window,
                action === 'prevBookmark' ? -1 : 1,
                ports.rememberAnnotation,
              )
              .catch((error: unknown) => {
                if (scope.isCurrent())
                  ports.debug(`reader bookmark traversal failed: ${String(error)}`);
              });
            break;
        }
      }),
    );
  }
  return (action, window, count) => handlers.get(action)?.({ window, count }) ?? false;
}
