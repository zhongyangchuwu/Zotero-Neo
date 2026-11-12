import type { ReferenceReaderPort, ReferenceReaderViewAccess } from './reader-port';
import type {
  ReferenceLocalMatch,
  ReferenceMetadataService,
  ReferenceQuery,
  ScholarlyPaper,
} from './contracts';
import type {
  ReaderReferenceDocument,
  ReaderReferenceEntry,
  ReaderReferenceLocation,
  ReaderReferenceSnapshot,
} from '../toolkit/reader/reference-contracts';
import type {
  ReaderReferenceInteractionContext,
  ReaderReferencePopupSlot,
  ReaderReferenceMenuContext,
  ReaderReferenceToolbarSlot,
} from '../toolkit/reader/reference-interaction-contracts';
import {
  observeReaderReferenceInteractions,
  readReaderReferenceDocument,
  readerMainWindow,
} from '../toolkit/reader';
import { launchMainURL, mainItemOpening } from '../toolkit/main';
import { createReferenceMetadataService } from './metadata';
import { addReferencePaper, findReferenceItems } from '../operations/references';
import { createReferenceAbortController } from '../platform/reference-http';
import { normalizeArxiv, normalizeDOI } from './identifiers';
import { CleanupScope } from '../core/cleanup';
import { THEME_VARS } from '../ui/theme';
import { compositionOwnsKey } from '../input/composition';
import { mountNativeReactView } from '../platform/native-ui';
import type {
  ReferenceCommand,
  ReferenceControlsCommand,
  ReferenceRow,
  ReferenceViewModel,
} from './react-model';
import type { NativeReactView } from '../ui/react/types';

const H = 'http://www.w3.org/1999/xhtml';
type ReferenceIntent = 'actions' | 'mentions' | 'local' | 'metadata' | 'catalog';

/** Match only overlapping PDF geometry, never a label or approximate nearest entry. */
function overlaps(a: ReaderReferenceLocation, b: ReaderReferenceLocation): boolean {
  const pages = (location: ReaderReferenceLocation) => [
    { page: location.pageIndex, rects: location.rects },
    ...(location.nextPageRects
      ? [{ page: location.pageIndex + 1, rects: location.nextPageRects }]
      : []),
  ];
  return pages(a).some((left) =>
    pages(b).some(
      (right) =>
        left.page === right.page &&
        left.rects.some((x) =>
          right.rects.some(
            (y) =>
              Math.min(x[0], x[2]) <= Math.max(y[0], y[2]) &&
              Math.max(x[0], x[2]) >= Math.min(y[0], y[2]) &&
              Math.min(x[1], x[3]) <= Math.max(y[1], y[3]) &&
              Math.max(x[1], x[3]) >= Math.min(y[1], y[3]),
          ),
        ),
    ),
  );
}

export class ReferenceController {
  readonly #metadata: ReferenceMetadataService = createReferenceMetadataService();
  readonly #unobserve: () => void;
  #close: (() => void) | null = null;
  #window: Window | null = null;
  #root: HTMLElement | null = null;
  #toolbar: ReaderReferenceToolbarSlot | null = null;
  readonly #footers = new Map<HTMLElement, ReaderReferenceInteractionContext>();

  constructor(private readonly port: ReferenceReaderPort) {
    this.#unobserve = observeReaderReferenceInteractions(port.reader, port.pluginID, {
      onCitationPopup: ({ context, mount }: ReaderReferencePopupSlot) => {
        const controls = mount.ownerDocument.createElementNS(H, 'span') as HTMLElement;
        controls.className = 'neo-reference-controls';
        const untheme = this.port.themeRoot(controls);
        mount.append(controls);
        let view: NativeReactView<{ chinese: boolean }>;
        try {
          view = mountNativeReactView({
            surface: 'reference-controls',
            root: controls,
            model: { chinese: this.port.language() === 'zh-CN' },
            dispatch: (command: ReferenceControlsCommand) => {
              if (
                controls.isConnected &&
                context.isCurrent() &&
                context.isSourceCurrent() &&
                (command.type === 'mentions' ||
                  command.type === 'local' ||
                  command.type === 'metadata')
              )
                this.#openContext(context, command.type);
            },
            isCurrent: () =>
              controls.isConnected && context.isCurrent() && context.isSourceCurrent(),
            loadingText: '',
            errorText: '',
            onError: (error) => this.port.showStatus(String(error)),
          });
        } catch (error) {
          untheme();
          controls.remove();
          throw error;
        }
        let composing = false;
        controls.addEventListener('compositionstart', () => {
          composing = true;
        });
        controls.addEventListener('compositionend', () => {
          composing = false;
        });
        controls.addEventListener('keydown', (event) => {
          if (compositionOwnsKey(event, composing)) {
            event.stopPropagation();
            return;
          }
          if (event.key === 'Escape' && context.isCurrent()) {
            event.preventDefault();
            event.stopPropagation();
            const access = this.port.captureView(context.window);
            context.dismissPreview?.();
            if (access?.isCurrent() && context.isSourceCurrent()) access.restoreFocus();
          } else if (event.key !== 'Tab') event.stopPropagation();
        });
        this.#footers.set(controls, context);
        return () => {
          this.#footers.delete(controls);
          view.dispose();
          untheme();
          controls.remove();
        };
      },
      onContextMenu: ({ context, append }: ReaderReferenceMenuContext) =>
        append([
          {
            label: this.port.language() === 'zh-CN' ? '文中引用' : 'In-text mentions',
            onCommand: () => this.#openContext(context, 'mentions'),
          },
          {
            label: this.port.language() === 'zh-CN' ? '本地副本' : 'Local copies',
            onCommand: () => this.#openContext(context, 'local'),
          },
          {
            label: this.port.language() === 'zh-CN' ? '论文详情' : 'Paper details',
            onCommand: () => this.#openContext(context, 'metadata'),
          },
          {
            label: this.port.language() === 'zh-CN' ? '搜索参考文献' : 'Search bibliography',
            onCommand: () => this.#openContext(context, 'catalog'),
          },
        ]),
      onToolbar: (slot: ReaderReferenceToolbarSlot) => {
        const { mount, isCurrent } = slot;
        this.#toolbar = slot;
        const button = mount.ownerDocument.createElementNS(H, 'button') as HTMLButtonElement;
        button.type = 'button';
        button.className = 'toolbar-button';
        const label = this.port.language() === 'zh-CN' ? '查找参考文献' : 'Find references';
        button.title = label;
        button.setAttribute('aria-label', label);
        const icon = mount.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 20 20');
        icon.setAttribute('width', '20');
        icon.setAttribute('height', '20');
        icon.setAttribute('aria-hidden', 'true');
        const path = mount.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M4 3h8l4 4v10H4z M12 3v4h4 M7 10h6 M7 13h6');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.4');
        path.setAttribute('stroke-linejoin', 'round');
        icon.append(path);
        button.append(icon);
        button.addEventListener('click', () => {
          if (button.isConnected && isCurrent()) this.open();
        });
        mount.append(button);
        return () => {
          if (this.#toolbar === slot) this.#toolbar = null;
          button.remove();
        };
      },
    });
  }

  ownsTarget(target: EventTarget | null): boolean {
    if (!target || !('nodeType' in target)) return false;
    if (this.#root?.contains(target as Node)) return true;
    const toolbar = this.#toolbar;
    if (toolbar?.mount.isConnected && toolbar.isCurrent() && toolbar.mount.contains(target as Node))
      return true;
    for (const [root, context] of this.#footers) {
      if (root.isConnected && context.isCurrent() && root.contains(target as Node)) return true;
    }
    return false;
  }
  isInputFocused(window: Window | undefined): boolean {
    if (!window) return false;
    if (this.#window === window && this.#root?.contains(this.#root.ownerDocument.activeElement))
      return true;
    for (const [root, context] of this.#footers) {
      if (
        context.window === window &&
        root.isConnected &&
        context.isCurrent() &&
        root.contains(root.ownerDocument.activeElement)
      )
        return true;
    }
    return false;
  }
  releaseView(window: Window): void {
    if (this.#window === window) this.close();
  }
  activateView(window: Window): void {
    if (this.#window && this.#window !== window) this.close();
  }
  close(): void {
    this.#close?.();
  }
  dispose(): void {
    this.close();
    try {
      this.#unobserve();
    } finally {
      this.#metadata.dispose();
    }
  }

  open(): void {
    this.close();
    const access = this.port.captureView();
    if (!access?.isCurrent()) return;
    const toolbar = this.#toolbar;
    if (toolbar?.isCurrent()) {
      const rect = toolbar.mount.getBoundingClientRect();
      this.#show(access, null, 'catalog', toolbar.uiWindow, [
        rect.left,
        rect.top,
        rect.right,
        rect.bottom,
      ]);
    } else this.#show(access, null, 'catalog');
  }

  #openContext(context: ReaderReferenceInteractionContext, intent: ReferenceIntent): void {
    if (!context.isCurrent() || !context.isSourceCurrent()) return;
    const rect = context.anchorRect();
    this.close();
    const access = this.port.captureView(context.window);
    if (!access?.isCurrent() || !context.isSourceCurrent()) return;
    context.dismissPreview?.();
    this.#show(access, context, intent, context.uiWindow, rect);
  }

  #show(
    access: ReferenceReaderViewAccess,
    context: ReaderReferenceInteractionContext | null,
    intent: ReferenceIntent,
    uiWindow: Window = context?.uiWindow ?? access.window,
    anchor: readonly [number, number, number, number] | null = null,
  ): void {
    const doc = uiWindow.document;
    const text = (en: string, cn: string): string => (this.port.language() === 'zh-CN' ? cn : en);
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      value = '',
    ): HTMLElementTagNameMap[K] => {
      const node = doc.createElementNS(H, tag) as HTMLElementTagNameMap[K];
      node.textContent = value;
      return node;
    };
    const root = element('section');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', text('References', '引用'));
    root.style.cssText = `position:fixed;z-index:2147483645;left:20px;top:50px;width:420px;max-width:calc(100vw - 24px);max-height:65vh;box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:12px;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};border-radius:6px;font:menu`;
    root.tabIndex = -1;
    const content = element('div');
    root.append(content);
    const cleanup = new CleanupScope();
    cleanup.add(this.port.themeRoot(root));
    cleanup.add(() => root.remove());
    doc.documentElement.append(root);
    // The React view is disposed by the cleanup scope before its connected host is removed.
    let live = true;
    let composing = false;
    let revision = 0;
    let abort: AbortController | null = null;
    let snapshot: ReaderReferenceSnapshot | null = null;
    let data: ReaderReferenceDocument | null = null;
    let selected: ReaderReferenceEntry | null = null;
    let paper: ScholarlyPaper | null = null;
    const mainWindow = readerMainWindow(this.port.reader);
    let view: NativeReactView<ReferenceViewModel> | null = null;
    const opening = mainWindow ? mainItemOpening(mainWindow) : null;
    const attachment = this.port.reader.itemID ? Zotero.Items.get(this.port.reader.itemID) : false;
    const libraryID = attachment ? attachment.libraryID : null;
    const stop = (): void => {
      revision++;
      abort?.abort();
      abort = null;
    };
    const viewCurrent = (): boolean => {
      if (live) {
        let valid = false;
        try {
          valid =
            access.isCurrent() &&
            (!context || context.isSourceCurrent()) &&
            uiWindow.document === doc;
        } catch {
          /* A retired iframe may be inaccessible. */
        }
        if (!valid) close();
      }
      return live && root.isConnected;
    };
    const current = (): boolean => {
      if (!viewCurrent()) return false;
      if (snapshot && !snapshot.isCurrent()) {
        close();
        return false;
      }
      return true;
    };
    const validated = async (): Promise<boolean> => {
      if (!current()) return false;
      if (snapshot && !(await snapshot.validate())) {
        close();
        return false;
      }
      return current();
    };
    const sourceDocument = access.window.document;
    const onUnload = (): void => close();
    const within = (event: Event): boolean =>
      !!event.target && 'nodeType' in event.target && root.contains(event.target as Node);
    const outside = (event: Event): void => {
      if (!within(event)) close();
    };
    const onScroll = (event: Event): void => {
      if (!within(event)) close();
    };
    const close = (restore = false): void => {
      if (!live) return;
      live = false;
      stop();
      this.#close = null;
      this.#window = null;
      this.#root = null;
      cleanup.dispose();
      if (restore && access.isCurrent() && (!context || context.isSourceCurrent()))
        access.restoreFocus();
    };
    this.#window = access.window;
    this.#root = root;
    this.#close = () => close();
    cleanup.add(() => view?.dispose());
    cleanup.addEventListener(doc, 'pointerdown', outside, true);
    if (sourceDocument !== doc)
      cleanup.addEventListener(sourceDocument, 'pointerdown', outside, true);
    for (const window of new Set([access.window, uiWindow])) {
      cleanup.addEventListener(window, 'unload', onUnload, { once: true });
      cleanup.addEventListener(window, 'resize', onUnload);
      cleanup.addEventListener(window, 'scroll', onScroll, true);
    }
    const place = (): void => {
      if (!live) return;
      const rect = root.getBoundingClientRect();
      const left = anchor?.[0] ?? 20;
      let top = anchor ? anchor[3] + 6 : 50;
      if (anchor && top + rect.height > uiWindow.innerHeight - 12)
        top = anchor[1] - rect.height - 6;
      root.style.left = `${Math.max(12, Math.min(left, uiWindow.innerWidth - rect.width - 12))}px`;
      root.style.top = `${Math.max(12, Math.min(top, uiWindow.innerHeight - rect.height - 12))}px`;
    };
    const Resize = (uiWindow as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (Resize) {
      const observer = new Resize(place);
      observer.observe(root);
      cleanup.add(() => observer.disconnect());
    }
    place();
    root.focus();
    root.addEventListener('compositionstart', () => {
      composing = true;
    });
    root.addEventListener('compositionend', () => {
      composing = false;
    });
    root.addEventListener('keydown', (event) => {
      if (compositionOwnsKey(event, composing)) {
        event.stopPropagation();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key !== 'Tab') event.stopPropagation();
    });
    const message = (error: unknown): string => {
      const value = error instanceof Error ? error.message : String(error);
      if (value.includes('429'))
        return text(
          'Reference service rate limited (429). Try again later.',
          '引用服务请求过多（429），请稍后重试。',
        );
      if (value === 'Reference service request failed')
        return text('Reference service unavailable or offline.', '引用服务不可用或网络离线。');
      if (
        value === 'PDF reference source unavailable' ||
        value === 'PDF reference data unavailable'
      )
        return text(
          'Reference analysis is unsupported or unavailable for this document.',
          '此文档不支持引用分析或引用分析不可用。',
        );
      return value;
    };
    let model: ReferenceViewModel = {
      generation: 0,
      chinese: this.port.language() === 'zh-CN',
      scene: 'loading',
      status: text('Loading references…', '正在加载参考文献…'),
      title: '',
      description: '',
      query: '',
      rows: [],
      result: '',
      provenance: '',
      paper: null,
      hasTarget: false,
      doi: false,
      arxiv: false,
    };
    let matches: readonly ReferenceLocalMatch[] = [];
    let candidates: readonly ScholarlyPaper[] = [];
    let choices: readonly ReaderReferenceEntry[] = [];
    let initialQuery: ReferenceQuery | null = null;
    let displayedQuery: string | null = null;
    let displayedProvenance = '';
    const update = (changes: Partial<ReferenceViewModel>): void => {
      model = { ...model, ...changes, generation: model.generation + 1 };
      view?.update(model);
      place();
    };
    const setStatus = (status: string): void => update({ status });
    const go = (scene: ReferenceViewModel['scene'], changes: Partial<ReferenceViewModel>): void => {
      const ownsFocus = content.contains(doc.activeElement);
      stop();
      if (ownsFocus) root.focus();
      update({
        scene,
        status: '',
        title: '',
        description: '',
        query: '',
        rows: [],
        result: '',
        provenance: '',
        paper: null,
        hasTarget: false,
        doi: false,
        arxiv: false,
        ...changes,
      });
    };
    const jump = (location: ReaderReferenceLocation): void => {
      const token = revision;
      void validated()
        .then((valid) => {
          if (!valid || revision !== token) return;
          if (access.jump(location)) close(true);
          else setStatus(text('Navigation unavailable for this location.', '无法跳转到此位置。'));
        })
        .catch((error: unknown) => {
          if (current() && revision === token) setStatus(message(error));
        });
    };
    const safeOpen = (url: string): void => {
      const token = revision;
      void validated()
        .then((valid) => {
          if (!valid || revision !== token) return;
          const URLConstructor = (uiWindow as Window & typeof globalThis).URL;
          const parsed = new URLConstructor(url);
          if (!['https:', 'http:'].includes(parsed.protocol) || !launchMainURL(parsed.href))
            throw new Error('URL navigation unavailable');
        })
        .catch((error: unknown) => {
          if (current() && revision === token) setStatus(message(error));
        });
    };
    const queryFor = (entry: ReaderReferenceEntry): ReferenceQuery => ({
      text: entry.text,
      ...(entry.doi ? { doi: entry.doi } : {}),
      ...(entry.arxivID ? { arxivID: entry.arxivID } : {}),
    });
    const queryFromInput = (value: string): ReferenceQuery => {
      const text = value.trim();
      const doi = normalizeDOI(text);
      const arxivID = normalizeArxiv(text);
      return { text, ...(doi ? { doi } : {}), ...(arxivID ? { arxivID } : {}) };
    };
    const catalogRows = (query: string): readonly ReferenceRow[] => {
      const term = query.trim().toLocaleLowerCase();
      return (data?.entries ?? [])
        .filter(
          (entry) => !term || `${entry.label} ${entry.text}`.toLocaleLowerCase().includes(term),
        )
        .map((entry) => ({ id: entry.id, label: `${entry.label} ${entry.text}` }));
    };
    const catalogScene = (): void => {
      const rows = catalogRows('');
      go('catalog', {
        title: text('Bibliography', '参考文献'),
        rows,
        result: rows.length ? '' : text('No matching references.', '没有匹配的参考文献。'),
        status:
          data?.bibliographyCoverage === 'partial'
            ? text(
                'Bibliography is partial; other entries may be missing.',
                '参考文献列表不完整，可能仍有遗漏。',
              )
            : '',
      });
      if (doc.activeElement === root) view?.getElement('query')?.focus();
    };
    const targetScene = (): void => {
      go(
        'target',
        selected
          ? {
              hasTarget: true,
              title: selected.label,
              description: selected.text,
              doi: !!selected.doi,
              arxiv: !!selected.arxivID,
            }
          : {
              description: text(
                'No reference identified at this position.',
                '此位置未识别到参考文献。',
              ),
            },
      );
    };
    const mentionsScene = (): void => {
      const occurrences =
        data?.occurrences.filter((item) => selected && item.referenceIDs.includes(selected.id)) ??
        [];
      go('mentions', {
        title: text(
          `Recognized local mentions (${occurrences.length})`,
          `已识别的本地引用位置（${occurrences.length}）`,
        ),
        description: selected?.text ?? '',
        rows: occurrences.map((item, index) => ({
          id: String(index),
          label: `${text('Page', '第')} ${item.location.pageIndex + 1}: ${item.context || item.text}`,
        })),
        result: occurrences.length
          ? ''
          : text(
              'No local mentions were recognized; this does not establish that the reference is uncited.',
              '未识别到本地引用位置；这并不代表该文献未被引用。',
            ),
      });
    };
    const localSearch = (): void => {
      stop();
      const submitted =
        initialQuery && model.query === initialQuery.text
          ? initialQuery
          : queryFromInput(model.query);
      if (!submitted.text) {
        update({
          rows: [],
          result: text('Enter a title, DOI or arXiv ID.', '请输入标题、DOI 或 arXiv ID。'),
        });
        return;
      }
      if (libraryID === null) {
        update({ rows: [], result: text('Library unavailable.', '文库不可用。') });
        return;
      }
      const token = revision;
      update({ rows: [], result: text('Searching…', '正在查找…') });
      void validated()
        .then((valid) =>
          valid && revision === token ? findReferenceItems(submitted, libraryID) : null,
        )
        .then(async (value) => {
          if (!value || revision !== token || !(await validated()) || revision !== token) return;
          matches = value;
          update({
            rows: value.map((match, index) => ({
              id: String(index),
              label: `${match.title}${match.attachmentID ? ' (PDF)' : ''}`,
            })),
            result: value.length ? '' : text('No local matches.', '没有本地匹配。'),
          });
        })
        .catch((error: unknown) => {
          if (current() && revision === token) update({ result: message(error) });
        });
    };
    const localScene = (): void => {
      if (!selected) return;
      initialQuery = paper
        ? {
            text: paper.title,
            ...(paper.doi ? { doi: paper.doi } : {}),
            ...(paper.arxivID ? { arxivID: paper.arxivID } : {}),
          }
        : queryFor(selected);
      go('local', {
        title: text('Local library candidates', '本地文库候选'),
        query: initialQuery.text,
      });
      localSearch();
      if (doc.activeElement === root) view?.getElement('query')?.focus();
    };
    const showPaper = (value: ScholarlyPaper): void => {
      const ownsFocus = !!view?.getElement('result')?.contains(doc.activeElement);
      stop();
      paper = value;
      update({ paper: value, rows: [], result: '' });
      if (ownsFocus) view?.getElement('result')?.focus();
    };
    const metadataSearch = (mode?: 'cache-only' | 'refresh'): void => {
      stop();
      const token = revision;
      const submitted =
        initialQuery && model.query === initialQuery.text
          ? initialQuery
          : queryFromInput(model.query);
      const queryKey = JSON.stringify(submitted);
      const preserve = mode === 'refresh' && displayedQuery === queryKey;
      const previousProvenance = displayedProvenance;
      if (!preserve) {
        paper = null;
        displayedQuery = null;
        displayedProvenance = '';
        update({ paper: null, rows: [], provenance: '', status: '' });
      }
      if (!submitted.text) {
        update({
          result: text('Enter a title, DOI or arXiv ID.', '请输入标题、DOI 或 arXiv ID。'),
        });
        return;
      }
      const controller = createReferenceAbortController();
      abort = controller;
      update(
        preserve
          ? { status: text('Refreshing metadata…', '正在刷新元数据…') }
          : {
              result:
                mode === 'cache-only'
                  ? text('Checking cache…', '正在检查缓存…')
                  : text('Querying…', '正在查询…'),
            },
      );
      void validated()
        .then((valid) =>
          valid && revision === token
            ? this.#metadata.lookup(submitted, controller.signal, mode)
            : null,
        )
        .then(async (value) => {
          if (!value || revision !== token || !(await validated()) || revision !== token) return;
          const info = value.cache;
          const origin = info
            ? `${info.origin === 'cached' ? text('Cached', '缓存') : text('Fetched', '已获取')}${info.stale ? ` · ${text('Stale', '已过期')}` : ''}`
            : '';
          const provenance = `${origin}${info?.warning ? ` · ${info.warning}` : ''}`;
          if (preserve && info?.origin === 'cached' && info.warning) {
            displayedProvenance = origin;
            update({ provenance, status: info.warning });
            return;
          }
          displayedQuery = value.kind === 'not-found' ? null : queryKey;
          displayedProvenance = origin;
          if (value.kind === 'found') {
            update({ provenance, status: '' });
            showPaper(value.paper);
          } else if (value.kind === 'not-found') {
            paper = null;
            update({
              provenance,
              status: '',
              paper: null,
              rows: [],
              result:
                mode === 'cache-only'
                  ? text(
                      'No cached metadata. Search to fetch it.',
                      '没有缓存的元数据。请搜索以获取。',
                    )
                  : text('No metadata found.', '未找到元数据。'),
            });
          } else {
            paper = null;
            candidates = value.papers;
            update({
              provenance,
              status: '',
              paper: null,
              result: text('Choose a matching record:', '请选择匹配的记录：'),
              rows: candidates.map((candidate, index) => ({
                id: String(index),
                label: `${candidate.title} — ${candidate.authors.join(', ')} ${candidate.year ?? ''}`,
              })),
            });
          }
        })
        .catch((error: unknown) => {
          if (!current() || revision !== token) return;
          if (preserve)
            update({
              provenance: [
                previousProvenance,
                text('Refresh failed; showing previous result', '刷新失败，显示原有结果'),
              ]
                .filter(Boolean)
                .join(' · '),
              status: message(error),
            });
          else update({ result: message(error) });
        });
    };
    const metadataScene = (): void => {
      if (!selected) return;
      initialQuery = queryFor(selected);
      displayedQuery = null;
      displayedProvenance = '';
      go('metadata', { title: text('Scholarly metadata', '学术元数据'), query: selected.text });
      metadataSearch('cache-only');
      if (doc.activeElement === root) view?.getElement('query')?.focus();
    };
    const dispatch = (command: ReferenceCommand): void => {
      if (
        !current() ||
        !command ||
        typeof command !== 'object' ||
        command.generation !== model.generation
      )
        return;
      if (composing && (command.type === 'local-search' || command.type === 'metadata-search'))
        return;
      switch (command.type) {
        case 'close':
          close(true);
          break;
        case 'catalog':
          if (model.scene === 'target' || model.scene === 'choose') catalogScene();
          break;
        case 'back':
          if (model.scene === 'mentions' || model.scene === 'local' || model.scene === 'metadata')
            targetScene();
          break;
        case 'mentions':
          if (model.scene === 'target' && selected) mentionsScene();
          break;
        case 'local':
          if (model.scene === 'target' && selected) localScene();
          break;
        case 'metadata':
          if (model.scene === 'target' && selected) metadataScene();
          break;
        case 'query': {
          if (typeof command.value !== 'string') break;
          if (model.scene === 'catalog') {
            const rows = catalogRows(command.value);
            update({
              query: command.value,
              rows,
              result: rows.length ? '' : text('No matching references.', '没有匹配的参考文献。'),
            });
          } else if (model.scene === 'local' || model.scene === 'metadata') {
            stop();
            if (model.scene === 'metadata') {
              paper = null;
              displayedQuery = null;
              displayedProvenance = '';
            }
            update({ query: command.value, rows: [], result: '', provenance: '', paper: null });
          }
          break;
        }
        case 'select': {
          const entry = (
            model.scene === 'choose'
              ? choices
              : model.scene === 'catalog'
                ? (data?.entries ?? [])
                : []
          ).find(
            (item) => item.id === command.id && model.rows.some((row) => row.id === command.id),
          );
          if (entry) {
            selected = entry;
            paper = null;
            if (model.scene === 'choose') presentTarget();
            else targetScene();
          }
          break;
        }
        case 'jump':
          if (model.scene === 'target' && selected) jump(selected.location);
          break;
        case 'occurrence': {
          if (model.scene !== 'mentions' || !model.rows.some((row) => row.id === command.id)) break;
          const occurrence = data?.occurrences.filter(
            (item) => selected && item.referenceIDs.includes(selected.id),
          )[Number(command.id)];
          if (occurrence) jump(occurrence.location);
          break;
        }
        case 'doi':
          if (model.scene === 'target' && selected?.doi)
            safeOpen(`https://doi.org/${selected.doi}`);
          break;
        case 'arxiv':
          if (model.scene === 'target' && selected?.arxivID)
            safeOpen(`https://arxiv.org/abs/${selected.arxivID}`);
          break;
        case 'web':
          if (model.scene === 'target' && selected)
            safeOpen(`https://scholar.google.com/scholar?q=${encodeURIComponent(selected.text)}`);
          break;
        case 'local-search':
          if (model.scene === 'local') localSearch();
          break;
        case 'match': {
          if (model.scene !== 'local' || !model.rows.some((row) => row.id === command.id)) break;
          const match = matches[Number(command.id)];
          if (!match?.attachmentID || !opening?.viewAttachment) {
            setStatus(text('No local PDF available.', '没有可用的本地 PDF。'));
            break;
          }
          const attachmentID = match.attachmentID;
          const viewAttachment = opening.viewAttachment;
          const token = revision;
          void validated()
            .then((valid) =>
              valid && revision === token ? viewAttachment(attachmentID) : undefined,
            )
            .catch((error: unknown) => {
              if (current() && revision === token) setStatus(message(error));
            });
          break;
        }
        case 'metadata-search':
          if (model.scene === 'metadata') metadataSearch();
          break;
        case 'metadata-refresh':
          if (model.scene === 'metadata') metadataSearch('refresh');
          break;
        case 'metadata-clear': {
          if (model.scene !== 'metadata') break;
          stop();
          const token = revision;
          void this.#metadata
            .clearCache()
            .then(() => {
              if (!current() || revision !== token) return;
              paper = null;
              displayedQuery = null;
              displayedProvenance = '';
              update({
                paper: null,
                rows: [],
                provenance: '',
                result: text('Metadata cache cleared.', '元数据缓存已清除。'),
              });
            })
            .catch((error: unknown) => {
              if (current() && revision === token) setStatus(message(error));
            });
          break;
        }
        case 'candidate': {
          if (model.scene !== 'metadata' || !model.rows.some((row) => row.id === command.id)) break;
          const candidate = candidates[Number(command.id)];
          if (!candidate) break;
          stop();
          const token = revision;
          void validated()
            .then((valid) => {
              if (valid && revision === token) showPaper(candidate);
            })
            .catch((error: unknown) => {
              if (current() && revision === token) update({ result: message(error) });
            });
          break;
        }
        case 'source':
          if (model.scene === 'metadata' && paper?.url) safeOpen(paper.url);
          break;
        case 'pdf':
          if (model.scene === 'metadata' && paper?.pdfURL) safeOpen(paper.pdfURL);
          break;
        case 'add': {
          if (model.scene !== 'metadata' || !paper) break;
          if (libraryID === null) {
            setStatus(text('Library unavailable.', '文库不可用。'));
            break;
          }
          const value = paper;
          const token = revision;
          setStatus(text('Adding…', '正在添加…'));
          void addReferencePaper(
            value,
            libraryID,
            async () => (await validated()) && revision === token,
          )
            .then(async (match) => {
              if (revision === token && (await validated()) && revision === token)
                setStatus(`${text('Available in Zotero', '已在 Zotero 中可用')}: ${match.title}`);
            })
            .catch((error: unknown) => {
              if (current() && revision === token) setStatus(message(error));
            });
          break;
        }
      }
    };
    view = mountNativeReactView({
      surface: 'references',
      root: content,
      model,
      dispatch,
      isCurrent: current,
      loadingText: text('Loading references…', '正在加载参考文献…'),
      errorText: text('Reference view unavailable.', '引用视图不可用。'),
      onError: (error) => {
        if (current()) this.port.showStatus(message(error));
      },
    });
    void view.ready
      .then(() => {
        if (
          current() &&
          doc.activeElement === root &&
          (model.scene === 'catalog' || model.scene === 'local' || model.scene === 'metadata')
        )
          view?.getElement('query')?.focus();
      })
      .catch(() => {});
    const presentTarget = (): void => {
      if (!selected) targetScene();
      else if (intent === 'mentions') mentionsScene();
      else if (intent === 'local') localScene();
      else if (intent === 'metadata') metadataScene();
      else targetScene();
    };
    void readReaderReferenceDocument(this.port.reader, viewCurrent, access.window)
      .then(async (value) => {
        if (!viewCurrent()) return;
        snapshot = value;
        if (!(await validated())) return;
        data = value.document;
        if (intent === 'catalog') {
          catalogScene();
          return;
        }
        const locations = context?.references.map((entry) => entry.location) ?? [];
        const candidates = data.entries.filter((entry) =>
          locations.some((location) => overlaps(entry.location, location)),
        );
        if (!locations.length && context?.position) {
          for (const entry of data.entries)
            if (overlaps(entry.location, context.position)) candidates.push(entry);
          for (const occurrence of data.occurrences)
            if (overlaps(occurrence.location, context.position))
              for (const entry of data.entries)
                if (occurrence.referenceIDs.includes(entry.id) && !candidates.includes(entry))
                  candidates.push(entry);
        }
        if (candidates.length === 1) {
          selected = candidates[0]!;
          presentTarget();
        } else if (candidates.length > 1) {
          choices = candidates;
          go('choose', {
            description: text('Choose a reference:', '请选择参考文献：'),
            rows: choices.map((entry) => ({ id: entry.id, label: `${entry.label} ${entry.text}` })),
          });
        } else targetScene();
      })
      .catch((error: unknown) => {
        if (current()) setStatus(message(error));
      });
  }
}
