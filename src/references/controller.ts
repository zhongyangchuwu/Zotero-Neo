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
        controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
        const untheme = this.port.themeRoot(controls);
        const actions: ReadonlyArray<readonly [ReferenceIntent, string, string]> = [
          ['mentions', 'In-text mentions', '文中引用'],
          ['local', 'Local copies', '本地副本'],
          ['metadata', 'Paper details', '论文详情'],
        ];
        for (const [intent, en, cn] of actions) {
          const button = mount.ownerDocument.createElementNS(H, 'button') as HTMLButtonElement;
          button.type = 'button';
          button.textContent = this.port.language() === 'zh-CN' ? cn : en;
          button.style.cssText = `padding:2px 6px;border:1px solid ${THEME_VARS.border};border-radius:4px;cursor:pointer`;
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (controls.isConnected && context.isCurrent()) this.#openContext(context, intent);
          });
          controls.append(button);
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
        mount.append(controls);
        this.#footers.set(controls, context);
        return () => {
          this.#footers.delete(controls);
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
    const status = element('p', text('Loading references…', '正在加载参考文献…'));
    status.setAttribute('role', 'status');
    const body = element('div');
    const closeButton = element('button', text('Close', '关闭'));
    closeButton.type = 'button';
    root.append(closeButton, status, body);
    const cleanup = new CleanupScope();
    cleanup.add(this.port.themeRoot(root));
    cleanup.add(() => root.remove());
    doc.documentElement.append(root);
    let live = true;
    let composing = false;
    let revision = 0;
    let abort: AbortController | null = null;
    let snapshot: ReaderReferenceSnapshot | null = null;
    let data: ReaderReferenceDocument | null = null;
    let selected: ReaderReferenceEntry | null = null;
    let paper: ScholarlyPaper | null = null;
    const mainWindow = readerMainWindow(this.port.reader);
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
    closeButton.addEventListener('click', () => close(true));
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
    const button = (parent: HTMLElement, label: string, run: () => void): HTMLButtonElement => {
      const node = element('button', label);
      node.type = 'button';
      node.style.cssText = `box-sizing:border-box;white-space:normal;margin:4px 6px 0 0;padding:4px 6px;border:1px solid ${THEME_VARS.border};border-radius:4px;text-align:left;cursor:pointer`;
      node.addEventListener('click', () => {
        if (node.isConnected && current()) run();
      });
      parent.append(node);
      return node;
    };
    const go = (render: () => void): void => {
      const ownsFocus = body.contains(doc.activeElement);
      stop();
      status.textContent = '';
      body.replaceChildren();
      if (ownsFocus) root.focus();
      render();
      place();
    };
    const jump = (location: ReaderReferenceLocation): void => {
      const token = revision;
      void validated()
        .then((valid) => {
          if (!valid || revision !== token) return;
          if (access.jump(location)) close(true);
          else
            status.textContent = text(
              'Navigation unavailable for this location.',
              '无法跳转到此位置。',
            );
        })
        .catch((error: unknown) => {
          if (current() && revision === token) status.textContent = message(error);
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
          if (current() && revision === token) status.textContent = message(error);
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
    const catalogScene = (): void =>
      go(() => {
        body.append(element('h3', text('Bibliography', '参考文献')));
        const search = element('input');
        search.type = 'search';
        search.placeholder = text('Filter bibliography', '筛选参考文献');
        search.setAttribute('aria-label', search.placeholder);
        const list = element('div');
        body.append(search, list);
        const render = (): void => {
          list.replaceChildren();
          const term = search.value.trim().toLocaleLowerCase();
          for (const entry of data?.entries ?? [])
            if (!term || `${entry.label} ${entry.text}`.toLocaleLowerCase().includes(term)) {
              const row = button(list, `${entry.label} ${entry.text}`, () => {
                selected = entry;
                paper = null;
                targetScene();
              });
              row.style.display = 'block';
              row.style.width = '100%';
            }
          if (!list.children.length)
            list.append(element('p', text('No matching references.', '没有匹配的参考文献。')));
        };
        search.addEventListener('input', (event) => {
          if (!composing && !(event as InputEvent).isComposing) render();
        });
        search.addEventListener('compositionend', render);
        render();
        if (doc.activeElement === root) search.focus();
        if (data?.bibliographyCoverage === 'partial')
          status.textContent = text(
            'Bibliography is partial; other entries may be missing.',
            '参考文献列表不完整，可能仍有遗漏。',
          );
      });
    const targetScene = (): void =>
      go(() => {
        if (!selected) {
          body.append(
            element(
              'p',
              text('No reference identified at this position.', '此位置未识别到参考文献。'),
            ),
          );
          button(body, text('Search bibliography', '搜索参考文献'), catalogScene);
          return;
        }
        const entry = selected;
        body.append(element('h3', entry.label), element('p', entry.text));
        button(body, text('Jump to bibliography', '跳转到参考文献'), () => jump(entry.location));
        button(body, text('Recognized local mentions', '已识别的本地引用位置'), mentionsScene);
        button(body, text('Find local matches', '查找本地匹配'), localScene);
        button(body, text('Paper details', '论文详情'), metadataScene);
        if (entry.doi)
          button(body, text('Open DOI', '打开 DOI'), () =>
            safeOpen(`https://doi.org/${entry.doi}`),
          );
        if (entry.arxivID)
          button(body, text('Open arXiv', '打开 arXiv'), () =>
            safeOpen(`https://arxiv.org/abs/${entry.arxivID}`),
          );
        button(body, text('Search web', '网页搜索'), () =>
          safeOpen(`https://scholar.google.com/scholar?q=${encodeURIComponent(entry.text)}`),
        );
        button(body, text('Search bibliography', '搜索参考文献'), catalogScene);
      });
    const mentionsScene = (): void =>
      go(() => {
        const occurrences =
          data?.occurrences.filter((item) => selected && item.referenceIDs.includes(selected.id)) ??
          [];
        body.append(
          element(
            'h3',
            text(
              `Recognized local mentions (${occurrences.length})`,
              `已识别的本地引用位置（${occurrences.length}）`,
            ),
          ),
        );
        if (selected) body.append(element('p', selected.text));
        if (!occurrences.length)
          body.append(
            element(
              'p',
              text(
                'No local mentions were recognized; this does not establish that the reference is uncited.',
                '未识别到本地引用位置；这并不代表该文献未被引用。',
              ),
            ),
          );
        for (const occurrence of occurrences)
          button(
            body,
            `${text('Page', '第')} ${occurrence.location.pageIndex + 1}: ${occurrence.context || occurrence.text}`,
            () => jump(occurrence.location),
          );
        button(body, text('Back', '返回'), targetScene);
      });
    const openMatch = (match: ReferenceLocalMatch): void => {
      if (!match.attachmentID || !opening?.viewAttachment) {
        status.textContent = text('No local PDF available.', '没有可用的本地 PDF。');
        return;
      }
      const viewAttachment = opening.viewAttachment;
      const token = revision;
      void validated()
        .then((valid) =>
          valid && revision === token ? viewAttachment(match.attachmentID!) : undefined,
        )
        .catch((error: unknown) => {
          if (current() && revision === token) status.textContent = message(error);
        });
    };
    const localScene = (): void =>
      go(() => {
        if (!selected) return;
        body.append(element('h3', text('Local library candidates', '本地文库候选')));
        const initial = paper
          ? {
              text: paper.title,
              ...(paper.doi ? { doi: paper.doi } : {}),
              ...(paper.arxivID ? { arxivID: paper.arxivID } : {}),
            }
          : queryFor(selected);
        const input = element('input');
        input.type = 'search';
        input.value = initial.text;
        input.setAttribute(
          'aria-label',
          text('Local title, DOI or arXiv ID', '本地标题、DOI 或 arXiv ID'),
        );
        body.append(input);
        const results = element('div');
        body.append(results);
        const search = (): void => {
          stop();
          const submitted = input.value === initial.text ? initial : queryFromInput(input.value);
          if (!submitted.text) {
            results.textContent = text(
              'Enter a title, DOI or arXiv ID.',
              '请输入标题、DOI 或 arXiv ID。',
            );
            return;
          }
          if (libraryID === null) {
            results.textContent = text('Library unavailable.', '文库不可用。');
            return;
          }
          const token = revision;
          results.textContent = text('Searching…', '正在查找…');
          void validated()
            .then((valid) =>
              valid && revision === token ? findReferenceItems(submitted, libraryID) : null,
            )
            .then(async (matches) => {
              if (!matches || revision !== token || !(await validated()) || revision !== token)
                return;
              results.replaceChildren();
              if (!matches.length)
                results.textContent = text('No local matches.', '没有本地匹配。');
              for (const match of matches)
                button(results, `${match.title}${match.attachmentID ? ' (PDF)' : ''}`, () =>
                  openMatch(match),
                );
            })
            .catch((error: unknown) => {
              if (current() && revision === token) results.textContent = message(error);
            });
        };
        button(body, text('Find in library', '在文库中查找'), search);
        input.addEventListener('input', () => {
          stop();
          results.replaceChildren();
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !compositionOwnsKey(event, composing)) {
            event.preventDefault();
            search();
          }
        });
        button(body, text('Back', '返回'), targetScene);
        search();
        if (doc.activeElement === root) input.focus();
      });
    const metadataScene = (): void =>
      go(() => {
        if (!selected) return;
        const entry = selected;
        body.append(element('h3', text('Scholarly metadata', '学术元数据')));
        const input = element('input');
        input.type = 'search';
        input.value = entry.text;
        input.setAttribute('aria-label', text('Reference search query', '参考文献搜索词'));
        body.append(input);
        const result = element('div');
        result.tabIndex = -1;
        body.append(result);
        const showPaper = (value: ScholarlyPaper): void => {
          const ownsFocus = result.contains(doc.activeElement);
          stop();
          paper = value;
          result.replaceChildren();
          result.append(
            element(
              'p',
              `${value.title} — ${value.authors.join(', ')}${value.year ? ` (${value.year})` : ''}`,
            ),
            element('p', `${value.source} · ${value.retrievedAt}`),
            element('p', `${text('Publication', '出版信息')}: ${value.venue ?? '—'}`),
            element('p', `DOI: ${value.doi ?? '—'} · arXiv: ${value.arxivID ?? '—'}`),
            element(
              'p',
              `${text('API references', 'API 参考文献数')}: ${value.referenceCount ?? '—'} · ${text('API citations', 'API 引用数')}: ${value.citationCount ?? '—'}`,
            ),
            element('h4', text('Original abstract', '原始摘要')),
            element(
              'p',
              value.abstract || text('No abstract provided by source.', '来源未提供摘要。'),
            ),
          );
          if (value.url)
            button(result, text('Open source', '打开来源'), () => safeOpen(value.url!));
          if (value.pdfURL)
            button(result, text('Open source PDF', '打开来源 PDF'), () => safeOpen(value.pdfURL!));
          button(result, text('Add to Zotero', '添加到 Zotero'), () => {
            if (libraryID === null) {
              status.textContent = text('Library unavailable.', '文库不可用。');
              return;
            }
            const token = revision;
            status.textContent = text('Adding…', '正在添加…');
            void addReferencePaper(
              value,
              libraryID,
              async () => (await validated()) && revision === token,
            )
              .then(async (match) => {
                if (revision === token && (await validated()) && revision === token)
                  status.textContent = `${text('Available in Zotero', '已在 Zotero 中可用')}: ${match.title}`;
              })
              .catch((error: unknown) => {
                if (current() && revision === token) status.textContent = message(error);
              });
          });
          if (ownsFocus) result.focus();
          place();
        };
        const search = (): void => {
          stop();
          const token = revision;
          const submitted =
            input.value === entry.text ? queryFor(entry) : queryFromInput(input.value);
          paper = null;
          if (!submitted.text) {
            result.textContent = text(
              'Enter a title, DOI or arXiv ID.',
              '请输入标题、DOI 或 arXiv ID。',
            );
            return;
          }
          const controller = createReferenceAbortController();
          abort = controller;
          result.textContent = text('Querying…', '正在查询…');
          void validated()
            .then((valid) =>
              valid && revision === token
                ? this.#metadata.lookup(submitted, controller.signal)
                : null,
            )
            .then(async (value) => {
              if (!value || revision !== token || !(await validated()) || revision !== token)
                return;
              result.replaceChildren();
              if (value.kind === 'found') showPaper(value.paper);
              else if (value.kind === 'not-found')
                result.textContent = text('No metadata found.', '未找到元数据。');
              else {
                result.append(
                  element('p', text('Choose a matching record:', '请选择匹配的记录：')),
                );
                for (const candidate of value.papers)
                  button(
                    result,
                    `${candidate.title} — ${candidate.authors.join(', ')} ${candidate.year ?? ''}`,
                    () => {
                      stop();
                      const token = revision;
                      void validated()
                        .then((valid) => {
                          if (valid && revision === token) showPaper(candidate);
                        })
                        .catch((error: unknown) => {
                          if (current() && revision === token) result.textContent = message(error);
                        });
                    },
                  );
              }
            })
            .catch((error: unknown) => {
              if (current() && revision === token) result.textContent = message(error);
            });
        };
        button(body, text('Search metadata', '搜索元数据'), search);
        input.addEventListener('input', () => {
          stop();
          paper = null;
          result.replaceChildren();
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !compositionOwnsKey(event, composing)) {
            event.preventDefault();
            search();
          }
        });
        button(body, text('Back', '返回'), targetScene);
        if (paper) showPaper(paper);
        else search();
        if (doc.activeElement === root) input.focus();
      });
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
        } else if (candidates.length > 1)
          go(() => {
            body.append(element('p', text('Choose a reference:', '请选择参考文献：')));
            for (const entry of candidates)
              button(body, `${entry.label} ${entry.text}`, () => {
                selected = entry;
                presentTarget();
              });
            button(body, text('Search bibliography', '搜索参考文献'), catalogScene);
          });
        else targetScene();
      })
      .catch((error: unknown) => {
        if (current()) status.textContent = message(error);
      });
  }
}
