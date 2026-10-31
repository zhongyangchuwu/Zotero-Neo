import { ReaderFigurePicker } from './figure-picker';
import { readerRegionPreview } from '../../toolkit/reader';
import { ReaderDocumentComparison, type DocumentComparisonHost } from './document-comparison';
import type { ModuleHost } from '../../core/module-host';
import {
  readerAnnotationPageRatio,
  readerPageRatioTop,
  readerScrollContainer,
  type ReaderNavigationHost,
} from '../../toolkit';
import type { ReaderRuntime } from '../../reader/types';
import { ReaderNavigation } from './navigation';
import { ReaderSmoothScroller, type ReaderSmoothScrollerHost } from './smooth-scroll';
import { ReaderMarks, type MarksHost } from './marks';
import { ReaderNativeSidebar, type ReaderNativeSidebarHost } from './native-sidebar';
import { ReaderCaptionTargets } from './caption-targets';
import { readReaderDocumentCache } from './document-cache';
import { DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY } from './document-settings';
import { t } from '../../i18n';
import {
  bindReaderNavigationActions,
  type ReaderNavigationAction,
  type ReaderNavigationActionPorts,
} from './actions';
import type { PdfWindow } from '../../reader/types';
import type { ActionId } from '../../input/actions';
import type { SmoothScrollSpec } from './smooth-scroll';

export interface ReaderNavigationModulePorts {
  readonly documentComparison?: Pick<
    DocumentComparisonHost,
    'preferences' | 'language' | 'themeRoot' | 'copyText'
  >;
  readonly reader: ReaderRuntime;
  readonly navigationHost: ReaderNavigationHost;
  readonly smooth: ReaderSmoothScrollerHost;
  readonly marks: Omit<
    MarksHost,
    'isCurrent' | 'onChange' | 'scrollToPageRatio' | 'scrollDocumentToRatio' | 'annotationPageRatio'
  >;
  readonly scrollTo: (window: PdfWindow, top: number) => boolean;
  readonly markViewCurrent: (window: PdfWindow) => boolean;
  readonly sidebar: Omit<
    ReaderNativeSidebarHost,
    'isCurrent' | 'reader' | 'marks' | 'captions' | 'onCaptionTarget' | 'bindAction'
  >;
  readonly beginCaptionJump: (window: PdfWindow) => (() => boolean) | null;
  readonly captureView?: (window: PdfWindow) => () => boolean;
  readonly actions: Omit<
    ReaderNavigationActionPorts,
    'openDocumentComparison' | 'openFigurePicker'
  >;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly debug: (message: string) => void;
}

export interface ReaderNavigationModule {
  handleKey(event: KeyboardEvent): boolean;
  releaseView(window: PdfWindow): void;
  deactivate(): void;
  readonly smooth: ReaderSmoothScroller;
  readonly marks: ReaderMarks;
  readonly sidebar: ReaderNativeSidebar;
  executeAction(action: ReaderNavigationAction, window: PdfWindow, count: number): boolean;
  setMark(window: PdfWindow, key: string): Promise<void>;
  jumpMark(window: PdfWindow, key: string): Promise<boolean>;
  clearMarks(): Promise<void>;
  deleteMark(key: string): Promise<void>;
  startSmooth(
    window: PdfWindow,
    key: string,
    spec: SmoothScrollSpec,
    action: ActionId,
    isCurrent: () => boolean,
  ): void;
}

/** Owns the Reader navigation helpers and retires them together with their module scope. */
export function createReaderNavigationModule(
  host: ModuleHost,
  ports: ReaderNavigationModulePorts,
): ReaderNavigationModule {
  return host.activate('reader-navigation', (scope) => {
    let sidebar: ReaderNativeSidebar | undefined;
    const marks = new ReaderMarks({
      ...ports.marks,
      isCurrent: () => scope.isCurrent(),
      scrollToPageRatio: async (window, pageIndex, ratio, invocationCurrent) => {
        for (let attempt = 0; attempt <= 10; attempt += 1) {
          if (!scope.isCurrent() || !invocationCurrent() || !ports.markViewCurrent(window))
            return false;
          const top = readerPageRatioTop(window, pageIndex, ratio);
          if (top !== null) return ports.scrollTo(window, top);
          if (attempt === 10) return false;
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, 80);
          await promise;
        }
        return false;
      },
      scrollDocumentToRatio: (window, ratio, invocationCurrent) => {
        if (!scope.isCurrent() || !invocationCurrent()) return false;
        const container = readerScrollContainer(window);
        return ports.scrollTo(
          window,
          ratio * Math.max(0, container.scrollHeight - container.clientHeight),
        );
      },
      annotationPageRatio: (window, annotation) =>
        readerAnnotationPageRatio(window, annotation.annotationPosition),
      onChange: () => {
        try {
          sidebar?.refreshMarks();
        } catch (error) {
          ports.debug(`reader bookmark presentation failed: ${String(error)}`);
        }
      },
    });
    scope.add(() => marks.dispose());
    const captions = new ReaderCaptionTargets(
      ports.reader.itemID,
      () => sidebar?.refreshCaptions(),
      ports.debug,
      () => scope.isCurrent(),
      ports.documentComparison
        ? {
            read: () =>
              readReaderDocumentCache(ports.reader, ports.documentComparison!.preferences, () =>
                scope.isCurrent(),
              ),
            unnamedTitle: (kind, pageIndex) =>
              `${t(`reader.sidebar.${kind}`, ports.sidebar.language())} · ${pageIndex + 1}`,
          }
        : undefined,
    );
    scope.add(() => captions.dispose());
    let picker: ReaderFigurePicker | null = null;
    const refreshAnalysis = (): void => {
      picker?.close(false);
      const loaded = captions.state !== 'idle';
      captions.invalidate();
      if (loaded) void captions.load();
    };
    const preferences = ports.documentComparison?.preferences;
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = preferences?.observe?.(key, refreshAnalysis);
      if (stop) scope.add(stop);
    }
    sidebar = new ReaderNativeSidebar({
      ...ports.sidebar,
      bindAction: (context, action, run) => {
        let result = false;
        const invoke = host.bind<KeyboardEvent | null>(scope, context, action, (event) => {
          result = run(event);
        });
        return (event) => {
          result = false;
          return invoke(event) && result;
        };
      },
      isCurrent: () => scope.isCurrent(),
      reader: ports.reader,
      marks,
      captions,
      onCaptionTarget: (target, window) => {
        if (!scope.isCurrent()) return;
        const invocationCurrent = ports.beginCaptionJump(window);
        if (!invocationCurrent || !scope.isCurrent() || !invocationCurrent()) return;
        void navigation.navigateCaption(target, window).catch((error: unknown) => {
          if (scope.isCurrent() && invocationCurrent())
            ports.debug(`reader caption jump failed: ${String(error)}`);
        });
      },
    });
    scope.add(() => sidebar?.dispose());
    const smooth = new ReaderSmoothScroller(ports.smooth);
    scope.add(() => smooth.dispose());
    const navigation = new ReaderNavigation({
      reader: ports.reader,
      captions,
      host: ports.navigationHost,
      showStatus: ports.showStatus,
      debug: ports.debug,
    });
    const comparison = ports.documentComparison
      ? new ReaderDocumentComparison({
          ...ports.documentComparison,
          debug: ports.debug,
          reader: ports.reader,
          isCurrent: () => scope.isCurrent(),
          onCacheSaved: refreshAnalysis,
          focusReader: () => {
            const window = ports.navigationHost.activePdfWindow();
            if (ports.markViewCurrent(window)) window.focus();
          },
          navigate: (position) => {
            const window = ports.navigationHost.activePdfWindow();
            const current = ports.beginCaptionJump(window);
            if (current?.())
              return ports.navigationHost.navigateToRegion(window, {
                position,
              });
          },
        })
      : null;
    if (comparison) scope.add(() => comparison.close());
    if (ports.documentComparison && ports.captureView) {
      picker = new ReaderFigurePicker({
        reader: ports.reader,
        captions,
        text: (key) => t(`reader.figures.${key}`, ports.documentComparison!.language()),
        themeRoot: ports.documentComparison.themeRoot,
        captureView: ports.captureView,
        isCurrent: () => scope.isCurrent(),
        render: (target, signal) =>
          readerRegionPreview(ports.reader, target.location.position, signal),
        navigate: (target, window) => navigation.navigateCaption(target, window),
        debug: ports.debug,
      });
      scope.add(() => picker?.close(false));
    }
    const executeAction = bindReaderNavigationActions(
      host,
      scope,
      navigation,
      marks,
      sidebar,
      captions,
      {
        ...ports.actions,
        openDocumentComparison: () => {
          picker?.close(false);
          comparison?.open();
        },
        openFigurePicker: (window) => {
          comparison?.close();
          picker?.open(window);
        },
      },
    );
    const startSmooth: ReaderNavigationModule['startSmooth'] = (
      window,
      key,
      spec,
      action,
      invocationCurrent,
    ) => {
      const isCurrent = (): boolean => scope.isCurrent() && invocationCurrent();
      if (!isCurrent()) return;
      const start = (): boolean =>
        isCurrent() && smooth.start(window, key, spec, undefined, isCurrent);
      ports.actions.executeNavigation(
        window,
        {
          cause: { kind: 'action', action },
          surface: 'reader',
          context: { readerPath: 'scroll', isCurrent },
        },
        (native) => {
          if (native.policy.kind !== 'record') return start();
          const { promise, resolve } = Promise.withResolvers<boolean>();
          if (!smooth.start(window, key, spec, () => resolve(isCurrent()), isCurrent))
            resolve(false);
          return promise;
        },
        { admission: 'motion', onUnavailable: start },
      );
    };
    return {
      handleKey: (event) => picker?.handleKey(event) || comparison?.handleKey(event) || false,
      releaseView: (window) => picker?.releaseView(window),
      deactivate: () => picker?.close(false),
      smooth,
      marks,
      sidebar,
      executeAction,
      startSmooth,
      setMark: (window, key) =>
        scope.isCurrent()
          ? marks.set(ports.reader, window, key, ports.actions.selectedAnnotationKey())
          : Promise.resolve(),
      jumpMark: (window, key) =>
        marks.jump(ports.reader, window, key, ports.actions.rememberAnnotation),
      clearMarks: () => marks.clear(ports.reader),
      deleteMark: (key) => marks.delete(ports.reader, key),
    };
  });
}
