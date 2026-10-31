import type { ModuleHost, ModuleScope } from '../../core/module-host';
import type { ActionId } from '../../input/actions';
import type { NavigationExecution, NavigationIntent } from '../../navigation/types';
import type { ItemRuntime, PdfWindow, ReaderRuntime } from '../../reader/types';
import { selectReaderAnnotation, type ReaderNativeNavigation } from '../../toolkit';
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
  readonly openFigurePicker: (window: PdfWindow) => void;
  readonly openDocumentComparison: () => void;
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
): (action: ReaderNavigationAction, window: PdfWindow, count: number) => boolean {
  const handlers = new Map<ReaderNavigationAction, (request: Request) => boolean>();
  for (const action of READER_NAVIGATION_ACTIONS) {
    handlers.set(
      action,
      host.bind<Request>(scope, 'reader-normal', action, ({ window, count }) => {
        const number = Math.max(1, count || 1);
        const intent = (
          readerPath: NonNullable<NavigationIntent['context']>['readerPath'],
        ): NavigationIntent => ({
          cause: { kind: 'action', action },
          surface: 'reader',
          context: { readerPath, isCurrent: () => scope.isCurrent() },
        });
        const motion = (scroll: () => boolean): void => {
          ports.executeNavigation(window, intent('scroll'), () => scroll(), {
            admission: 'motion',
            onUnavailable: scroll,
          });
        };
        switch (action) {
          case 'openFigurePicker':
            ports.openFigurePicker(window);
            break;
          case 'compareDocumentParsing':
            ports.openDocumentComparison();
            break;
          case 'toggleReadingMode':
            void navigation
              .toggleReadingMode(window)
              .catch((error: unknown) => ports.showStatus(String(error), 3000));
            break;
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
            let annotations =
              ports
                .itemForReader()
                ?.getAnnotations?.()
                .filter((annotation) =>
                  ['highlight', 'underline', 'note', 'text'].includes(
                    annotation.annotationType ?? '',
                  ),
                ) ?? [];
            const color = ports.filterColor();
            if (color)
              annotations = annotations.filter(
                (annotation) => annotation.annotationColor === color,
              );
            annotations = [...annotations].sort((left, right) =>
              (left.annotationSortIndex ?? '').localeCompare(right.annotationSortIndex ?? ''),
            );
            if (!annotations.length) {
              ports.showStatus('✗ no annotations', 2000);
              break;
            }
            const key = ports.selectedAnnotationKey();
            const current = key
              ? annotations.findIndex((annotation) => annotation.key === key)
              : -1;
            const direction = action === 'prevAnnotation' ? -1 : 1;
            const index =
              current < 0
                ? direction > 0
                  ? 0
                  : annotations.length - 1
                : (current + direction + annotations.length) % annotations.length;
            const target = annotations[index];
            if (!target) break;
            ports.rememberAnnotation(target.key);
            ports.executeNavigation(window, intent('annotation'), (native) =>
              selectReaderAnnotation(ports.reader, target.key, native),
            );
            ports.showStatus(`→ ann ${index + 1}/${annotations.length}`, 1500);
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
