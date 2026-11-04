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
import { readReaderReferenceDocument, readerMainWindow } from '../toolkit/reader';
import { launchMainURL, mainItemOpening } from '../toolkit/main';
import { createReferenceMetadataService } from './metadata';
import { addReferencePaper, findReferenceItems } from '../operations/references';
import { createReferenceAbortController } from '../platform/reference-http';
import { THEME_VARS } from '../ui/theme';
import { compositionOwnsKey } from '../input/composition';

const H = 'http://www.w3.org/1999/xhtml';

/** A panel and all of its work belong to one captured Reader view. */
export class ReferenceController {
  readonly #metadata: ReferenceMetadataService = createReferenceMetadataService();
  #close: (() => void) | null = null;
  #window: Window | null = null;
  #root: HTMLElement | null = null;

  constructor(private readonly port: ReferenceReaderPort) {}

  ownsTarget(target: EventTarget | null): boolean {
    return !!target && 'nodeType' in target && !!this.#root && this.#root.contains(target as Node);
  }

  /** Native PDF key handling yields while this exact presentation owns dialog focus. */
  isInputFocused(window: Window | undefined): boolean {
    return !!window && this.#window === window && this.ownsTarget(window.document.activeElement);
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
    this.#metadata.dispose();
  }

  open(): void {
    this.close();
    const access = this.port.captureView();
    if (!access || !access.isCurrent()) return;
    this.#show(access);
  }

  #show(access: ReferenceReaderViewAccess): void {
    const doc = access.window.document;
    const zh = this.port.language() === 'zh-CN';
    const text = (en: string, cn: string): string => (zh ? cn : en);
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      value = '',
    ): HTMLElementTagNameMap[K] => {
      const result = doc.createElementNS(H, tag) as HTMLElementTagNameMap[K];
      result.textContent = value;
      return result;
    };
    const backdrop = element('div');
    backdrop.style.cssText = `position:fixed;inset:0;z-index:2147483645;background:${THEME_VARS.backdrop}`;
    const root = element('section');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', text('References', '引用'));
    root.style.cssText = `position:absolute;inset:6%;display:flex;flex-direction:column;gap:8px;padding:16px;overflow:auto;background:${THEME_VARS.surface};color:${THEME_VARS.text};border:1px solid ${THEME_VARS.border};font:menu`;
    const heading = element('h2', text('References', '引用'));
    const controls = element('div');
    const search = element('input');
    search.type = 'search';
    search.placeholder = text('Filter bibliography', '筛选参考文献');
    search.setAttribute('aria-label', search.placeholder);
    const closeButton = element('button', text('Close', '关闭'));
    closeButton.type = 'button';
    controls.append(search, closeButton);
    const status = element('p', text('Loading references…', '正在加载参考文献…'));
    status.setAttribute('role', 'status');
    const coverage = element('p');
    coverage.setAttribute('role', 'status');
    const content = element('div');
    content.style.cssText = 'display:flex;gap:12px;flex:1;min-height:0';
    const list = element('div');
    list.style.cssText = 'flex:1;overflow:auto;min-width:180px';
    list.setAttribute('aria-label', text('Bibliography', '参考文献列表'));
    const detail = element('div');
    detail.style.cssText = 'flex:2;overflow:auto;min-width:220px';
    content.append(list, detail);
    root.append(heading, controls, status, coverage, content);
    backdrop.append(root);
    const untheme = this.port.themeRoot(backdrop);
    doc.documentElement.append(backdrop);
    let live = true;
    let composing = false;
    let revision = 0;
    let abort: AbortController | null = null;
    let referenceDocument: ReaderReferenceDocument | null = null;
    let referenceSnapshot: ReaderReferenceSnapshot | null = null;
    let selected: ReaderReferenceEntry | null = null;
    let paper: ScholarlyPaper | null = null;
    let libraryID: number | null = null;
    const mainWindow = readerMainWindow(this.port.reader);
    const opening = mainWindow ? mainItemOpening(mainWindow) : null;
    const attachment = this.port.reader.itemID ? Zotero.Items.get(this.port.reader.itemID) : false;
    if (attachment) libraryID = attachment.libraryID;
    const viewCurrent = (): boolean => {
      if (live && !access.isCurrent()) close();
      return live && backdrop.isConnected;
    };
    const current = (): boolean => {
      if (!viewCurrent()) return false;
      if (referenceSnapshot && !referenceSnapshot.isCurrent()) {
        close();
        return false;
      }
      return true;
    };
    const validated = async (): Promise<boolean> => {
      if (!current()) return false;
      if (referenceSnapshot && !(await referenceSnapshot.validate())) {
        close();
        return false;
      }
      return current();
    };
    const stop = (): void => {
      revision++;
      abort?.abort();
      abort = null;
    };
    const onUnload = (): void => close();
    const close = (restore = false): void => {
      if (!live) return;
      live = false;
      stop();
      this.#close = null;
      this.#window = null;
      this.#root = null;
      key.value = '';
      access.window.removeEventListener('unload', onUnload);
      untheme();
      backdrop.remove();
      if (restore && access.isCurrent()) access.restoreFocus();
    };
    this.#window = access.window;
    this.#root = root;
    this.#close = () => close();
    closeButton.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(true);
    });
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
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]',
          ),
        ).filter(
          (node): node is HTMLElement =>
            node?.nodeType === 1 && (node as HTMLElement).getClientRects().length > 0,
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && doc.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last && first) {
          event.preventDefault();
          first.focus();
        }
        event.stopPropagation();
      } else event.stopPropagation();
    });
    access.window.addEventListener('unload', onUnload, { once: true });
    let actions: Promise<void> = Promise.resolve();
    const button = (
      parent: HTMLElement,
      label: string,
      run: () => void,
      requiresSource = true,
    ): HTMLButtonElement => {
      const b = element('button', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (!requiresSource) {
          if (current()) run();
          return;
        }
        actions = actions
          .then(async () => {
            if (!b.isConnected || !current()) return;
            if ((await validated()) && b.isConnected) run();
          })
          .catch((error: unknown) => {
            if (current()) status.textContent = message(error);
          });
      });
      parent.append(b);
      return b;
    };
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
    const queryFor = (entry: ReaderReferenceEntry): ReferenceQuery => ({
      text: entry.text,
      ...(entry.doi ? { doi: entry.doi } : {}),
      ...(entry.arxivID ? { arxivID: entry.arxivID } : {}),
    });
    const safeOpen = (url: string): void => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
          throw new Error('Unsupported URL');
        if (!current() || !launchMainURL(parsed.href))
          throw new Error('URL navigation unavailable');
      } catch (error) {
        if (current()) status.textContent = message(error);
      }
    };
    const rows = new Map<string, HTMLButtonElement>();
    const renderList = (): void => {
      list.replaceChildren();
      rows.clear();
      const term = search.value.trim().toLocaleLowerCase();
      for (const entry of referenceDocument?.entries ?? []) {
        if (term && !`${entry.label} ${entry.text}`.toLocaleLowerCase().includes(term)) continue;
        const item = button(list, `${entry.label} ${entry.text}`, () => select(entry));
        item.style.cssText = 'display:block;text-align:left;width:100%;margin-bottom:4px';
        item.setAttribute('aria-pressed', String(selected?.id === entry.id));
        rows.set(entry.id, item);
      }
      if (!list.children.length)
        list.append(element('p', text('No matching references.', '没有匹配的参考文献。')));
    };
    const openMatch = (match: ReferenceLocalMatch): void => {
      if (!current()) return;
      if (!match.attachmentID || !opening?.viewAttachment) {
        status.textContent = text('No local PDF available.', '没有可用的本地 PDF。');
        return;
      }
      try {
        void Promise.resolve(opening.viewAttachment(match.attachmentID)).catch((error: unknown) => {
          if (current()) status.textContent = message(error);
        });
      } catch (error) {
        status.textContent = message(error);
      }
    };
    const jump = (location: ReaderReferenceLocation): void => {
      if (current() && !access.jump(location))
        status.textContent = text(
          'Navigation unavailable for this location.',
          '无法跳转到此位置。',
        );
    };
    const renderDetail = (): void => {
      detail.replaceChildren();
      if (!selected || !referenceDocument) return;
      const entry = selected;
      detail.append(element('h3', entry.label), element('p', entry.text));
      const queryInput = element('input');
      queryInput.type = 'search';
      queryInput.value = entry.text;
      queryInput.setAttribute('aria-label', text('Reference search query', '参考文献搜索词'));
      detail.append(queryInput);
      const query = (): ReferenceQuery =>
        queryInput.value === entry.text ? queryFor(entry) : { text: queryInput.value };
      button(detail, text('Jump to bibliography', '跳转到参考文献'), () => jump(entry.location));
      if (entry.doi)
        button(detail, text('Open DOI', '打开 DOI'), () =>
          safeOpen(`https://doi.org/${encodeURIComponent(entry.doi!)}`),
        );
      if (entry.arxivID)
        button(detail, text('Open arXiv', '打开 arXiv'), () =>
          safeOpen(`https://arxiv.org/abs/${encodeURIComponent(entry.arxivID!)}`),
        );
      button(detail, text('Search web', '搜索网页'), () =>
        safeOpen(`https://scholar.google.com/scholar?q=${encodeURIComponent(entry.text)}`),
      );
      const occurrences = referenceDocument.occurrences.filter((occurrence) =>
        occurrence.referenceIDs.includes(entry.id),
      );
      detail.append(
        element(
          'h4',
          text(
            `Recognized local mentions (${occurrences.length})`,
            `已识别的本地引用位置（${occurrences.length}）`,
          ),
        ),
      );
      if (!occurrences.length)
        detail.append(
          element(
            'p',
            text(
              'No local mentions were recognized; this does not establish that the reference is uncited.',
              '未识别到本地引用位置；这并不代表该文献未被引用。',
            ),
          ),
        );
      for (const occurrence of occurrences) {
        button(
          detail,
          `${text('Page', '第')} ${occurrence.location.pageIndex + 1}: ${occurrence.context || occurrence.text}`,
          () => jump(occurrence.location),
        );
      }
      detail.append(element('h4', text('Local library', '本地文库')));
      const matches = element('div');
      detail.append(matches);
      button(
        detail,
        text('Find local matches', '查找本地匹配'),
        () => {
          if (libraryID === null) {
            status.textContent = text('Library unavailable.', '文库不可用。');
            return;
          }
          const token = revision;
          matches.textContent = text('Searching…', '正在查找…');
          const destination = libraryID;
          const submitted = paper
            ? {
                text: paper.title,
                ...(paper.doi ? { doi: paper.doi } : {}),
                ...(paper.arxivID ? { arxivID: paper.arxivID } : {}),
              }
            : query();
          void validated()
            .then((valid) => {
              if (!valid || revision !== token) return null;
              return findReferenceItems(submitted, destination);
            })
            .then(async (results) => {
              if (
                !results ||
                !current() ||
                revision !== token ||
                !(await validated()) ||
                revision !== token
              )
                return;
              matches.replaceChildren();
              if (!results.length)
                matches.textContent = text('No local matches.', '没有本地匹配。');
              for (const match of results)
                button(matches, `${match.title}${match.attachmentID ? ' (PDF)' : ''}`, () =>
                  openMatch(match),
                );
            })
            .catch((error: unknown) => {
              if (current() && revision === token) matches.textContent = message(error);
            });
        },
        false,
      );
      detail.append(element('h4', text('Scholarly metadata', '学术元数据')));
      const result = element('div');
      detail.append(result);
      const showPaper = (value: ScholarlyPaper): void => {
        stop();
        const restoreResultFocus = result.contains(doc.activeElement);
        paper = value;
        result.replaceChildren();
        const summary = element(
          'p',
          `${value.title} — ${value.authors.join(', ')}${value.year ? ` (${value.year})` : ''}`,
        );
        summary.tabIndex = -1;
        result.append(summary);
        result.append(element('p', `${value.source} · ${value.retrievedAt}`));
        result.append(element('p', `${text('Publication', '出版信息')}: ${value.venue ?? '—'}`));
        result.append(element('p', `DOI: ${value.doi ?? '—'} · arXiv: ${value.arxivID ?? '—'}`));
        result.append(
          element(
            'p',
            `${text('API references', 'API 参考文献数')}: ${value.referenceCount ?? '—'} · ${text('API citations', 'API 引用数')}: ${value.citationCount ?? '—'}`,
          ),
        );
        result.append(
          element('h5', text('Original abstract', '原始摘要')),
          element(
            'p',
            value.abstract || text('No abstract provided by source.', '来源未提供摘要。'),
          ),
        );
        if (value.url) button(result, text('Open source', '打开来源'), () => safeOpen(value.url!));
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
              if (current() && revision === token && (await validated()) && revision === token)
                status.textContent = `${text('Available in Zotero', '已在 Zotero 中可用')}: ${match.title}`;
            })
            .catch((error: unknown) => {
              if (current() && revision === token) status.textContent = message(error);
            });
        });
        if (restoreResultFocus) summary.focus();
      };
      button(
        detail,
        text('Query metadata', '查询元数据'),
        () => {
          stop();
          const token = revision;
          const submitted = query();
          const controller = createReferenceAbortController();
          abort = controller;
          result.textContent = text('Querying…', '正在查询…');
          void validated()
            .then((valid) => {
              if (!valid || revision !== token) return null;
              return this.#metadata.lookup(submitted, controller.signal);
            })
            .then(async (value) => {
              if (
                !value ||
                !current() ||
                revision !== token ||
                !(await validated()) ||
                revision !== token
              )
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
                    () => showPaper(candidate),
                  );
              }
            })
            .catch(async (error: unknown) => {
              if (current() && revision === token && (await validated()) && revision === token)
                result.textContent = message(error);
            });
        },
        false,
      );
      queryInput.addEventListener('input', () => {
        stop();
        paper = null;
        matches.replaceChildren();
        result.replaceChildren();
      });
    };
    const select = (entry: ReaderReferenceEntry): void => {
      stop();
      selected = entry;
      paper = null;
      for (const [id, row] of rows) row.setAttribute('aria-pressed', String(id === entry.id));
      renderDetail();
    };
    search.addEventListener('input', (event) => {
      if (!composing && !(event as InputEvent).isComposing) renderList();
    });
    search.addEventListener('compositionend', renderList);
    const settings = element('details');
    settings.append(
      element(
        'summary',
        text('Semantic Scholar API key (optional)', 'Semantic Scholar API 密钥（可选）'),
      ),
    );
    const keyState = element('p', text('Key status not checked.', '尚未检查密钥状态。'));
    const key = element('input');
    key.type = 'password';
    key.autocomplete = 'off';
    key.setAttribute('aria-label', text('Semantic Scholar API key', 'Semantic Scholar API 密钥'));
    settings.append(keyState, key);
    settings.addEventListener('toggle', () => {
      if (!settings.open || !current()) return;
      void this.#metadata
        .hasSemanticScholarKey()
        .then((exists) => {
          if (current())
            keyState.textContent = exists
              ? text('Key saved.', '已保存密钥。')
              : text('No key saved; anonymous access is available.', '未保存密钥；仍可匿名访问。');
        })
        .catch((error: unknown) => {
          if (current()) keyState.textContent = message(error);
        });
    });
    button(
      settings,
      text('Save key', '保存密钥'),
      () => {
        const value = key.value.trim();
        if (!value) {
          keyState.textContent = text('Enter a key first.', '请先输入密钥。');
          return;
        }
        void this.#metadata
          .setSemanticScholarKey(value)
          .then(() => {
            key.value = '';
            if (current()) keyState.textContent = text('Key saved.', '已保存密钥。');
          })
          .catch((error: unknown) => {
            if (current()) keyState.textContent = message(error);
          });
      },
      false,
    );
    button(
      settings,
      text('Forget key', '忘记密钥'),
      () => {
        void this.#metadata
          .setSemanticScholarKey(null)
          .then(() => {
            key.value = '';
            if (current()) keyState.textContent = text('Key forgotten.', '已忘记密钥。');
          })
          .catch((error: unknown) => {
            if (current()) keyState.textContent = message(error);
          });
      },
      false,
    );
    root.insertBefore(settings, content);
    search.focus();
    void readReaderReferenceDocument(this.port.reader, viewCurrent, access.window)
      .then(async (snapshot) => {
        if (!current()) return;
        referenceSnapshot = snapshot;
        if (!(await validated())) return;
        const value = snapshot.document;
        referenceDocument = value;
        coverage.textContent =
          value.bibliographyCoverage === 'partial'
            ? text(
                'Bibliography is partial; other entries may be missing.',
                '参考文献列表不完整，可能仍有遗漏。',
              )
            : '';
        status.textContent = value.entries.length
          ? text(
              `${value.entries.length} references recognized`,
              `已识别 ${value.entries.length} 条参考文献`,
            )
          : text('No references recognized in this document.', '未识别到参考文献。');
        renderList();
        if (value.entries[0]) select(value.entries[0]);
      })
      .catch((error: unknown) => {
        if (current()) status.textContent = message(error);
      });
  }
}
