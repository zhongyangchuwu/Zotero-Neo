import type {
  OutlineNode,
  OutlineSourceNode,
  OutlineState,
  PdfDocumentRuntime,
  PdfWindow,
  ReaderRuntime,
  ReaderTimer,
} from './types';

export type { OutlineState } from './types';
export interface OutlineHost {
  readonly schedule: (delay: number, task: () => void) => ReaderTimer;
  readonly clearTimer: (timer: ReaderTimer | null) => void;
  readonly log: (message: string) => void;
  readonly setModeNormal: () => void;
}

interface PdfLinkService {
  getDestinationHash?(destination: unknown): string;
  setHash?(hash: string): void;
  goToDestination?(destination: unknown): Promise<unknown>;
  navigateTo?(destination: unknown): Promise<unknown>;
}

export class ReaderOutline {
  readonly #host: OutlineHost;

  constructor(host: OutlineHost) {
    this.#host = host;
  }

  async toggle(state: OutlineState, reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {
    if (state.open) {
      this.close(state, pdfWindow);
      return;
    }
    state.open = true;
    this.createOverlay(state, pdfWindow);
    this.render(state);
    state.overlay?.focus();
    await this.load(state, reader, pdfWindow);
  }

  async focus(state: OutlineState, reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {
    if (!state.open) {
      await this.toggle(state, reader, pdfWindow);
      return;
    }
    state.overlay?.focus();
    if (!state.visible.length && !state.loading) await this.load(state, reader, pdfWindow);
  }

  close(state: OutlineState, pdfWindow?: PdfWindow): void {
    state.open = false;
    state.loading = false;
    this.clearBuffers(state);
    state.overlay?.remove();
    state.overlay = null;
    state.list = null;
    state.status = null;
    state.visible = [];
    state.selected = 0;
    if (pdfWindow) this.#host.schedule(30, () => pdfWindow.focus());
  }

  handleKey(
    state: OutlineState,
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    event: KeyboardEvent,
  ): boolean {
    const key = this.key(event);
    if (!key) return false;
    const consume = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (key === 'g') {
      consume();
      if (state.commandBuffer === 'g') {
        this.selectBoundary(state, false);
        this.clearCommand(state);
      } else {
        state.commandBuffer = 'g';
        this.#host.clearTimer(state.commandTimer);
        state.commandTimer = this.#host.schedule(700, () => this.clearCommand(state));
        this.setStatus(state, 'g … (gg top)');
      }
      return true;
    }
    const direct: Readonly<Record<string, () => void>> = {
      G: () => this.selectBoundary(state, true),
      j: () => this.move(state, 1),
      k: () => this.move(state, -1),
      l: () => this.toggleNode(state, true),
      h: () => this.toggleNode(state, false),
      R: () => this.expandAll(state, true),
      M: () => this.expandAll(state, false),
      'ctrl+d': () => this.move(state, this.fastStep(state)),
      'ctrl+u': () => this.move(state, -this.fastStep(state)),
      escape: () => this.close(state, pdfWindow),
    };
    const action = direct[key];
    if (action) {
      consume();
      action();
      return true;
    }
    if (key === 'enter' || key === 'return') {
      consume();
      void this.activate(state, reader, pdfWindow);
      return true;
    }
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      /^[a-z0-9]$/.test(key) &&
      this.hintAlphabet().includes(key)
    ) {
      consume();
      this.applyHint(state, key);
      return true;
    }
    return false;
  }

  private async load(
    state: OutlineState,
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
  ): Promise<void> {
    state.loading = true;
    this.render(state);
    try {
      if (!state.tree) state.tree = await this.fetchTree(reader, pdfWindow);
      this.refresh(state);
      this.selectCurrent(state, pdfWindow);
      if (!state.visible.length) this.setStatus(state, 'No outline available');
    } catch (error) {
      state.tree = [];
      this.refresh(state);
      this.setStatus(state, 'Error loading outline');
      this.#host.log(`outline load failed: ${String(error)}`);
    } finally {
      state.loading = false;
      this.render(state);
    }
  }

  private createOverlay(state: OutlineState, pdfWindow: PdfWindow): void {
    const document = pdfWindow.document;
    const root = document.body ?? document.documentElement;
    const overlay = document.createElement('div');
    overlay.id = 'zv-outline-explorer';
    overlay.tabIndex = -1;
    overlay.style.cssText =
      'position:fixed;top:0;left:0;bottom:0;width:320px;z-index:99998;background:rgba(24,24,37,.96);color:#cdd6f4;border-right:1px solid #313244;display:flex;flex-direction:column;box-shadow:12px 0 40px rgba(0,0,0,.35);font:13px/1.35 monospace;';
    const title = document.createElement('div');
    title.style.cssText =
      'padding:12px 14px;border-bottom:1px solid #313244;font-weight:bold;letter-spacing:.04em;';
    title.textContent = 'Outline Explorer';
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow:auto;padding:8px 0;';
    const status = document.createElement('div');
    status.style.cssText =
      'padding:6px 12px;border-top:1px solid #313244;color:#6c7086;font-size:11px;';
    status.textContent =
      'j/k move · Ctrl+d/u fast · gg/G top/bottom · R/M expand/collapse all · Enter jump';
    overlay.append(title, list, status);
    root.appendChild(overlay);
    state.overlay = overlay;
    state.list = list;
    state.status = status;
  }

  private render(state: OutlineState): void {
    const list = state.list;
    if (!list) return;
    list.replaceChildren();
    const document = list.ownerDocument;
    if (state.loading) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px 14px;color:#6c7086;';
      row.textContent = 'Loading outline...';
      list.appendChild(row);
      return;
    }
    if (!state.visible.length) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:12px 14px;color:#6c7086;';
      row.textContent = 'No outline available';
      list.appendChild(row);
      return;
    }
    const fragment = document.createDocumentFragment();
    state.visible.forEach((node, index) => {
      const row = document.createElement('div');
      const selected = index === state.selected;
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 12px 6px ${12 + node.depth * 16}px;cursor:pointer;border-left:3px solid ${selected ? '#89b4fa' : 'transparent'};background:${selected ? '#313244' : 'transparent'};`;
      const indicator = node.children.length ? (node.expanded ? '▾' : '▸') : '·';
      row.textContent = `${node.hint.padEnd(2)} ${indicator} ${node.title}`;
      row.addEventListener('click', () => {
        state.selected = index;
        this.render(state);
      });
      fragment.appendChild(row);
    });
    list.appendChild(fragment);
    list.children[state.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private async fetchTree(reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<OutlineNode[]> {
    const pdfDocument = pdfWindow.PDFViewerApplication?.pdfDocument;
    let source = (await pdfDocument?.getOutline?.()) ?? null;
    if (!source?.length) source = this.readDomOutline(reader, pdfWindow);
    if (!source?.length) return [];
    let nextID = 0;
    const build = async (
      nodes: readonly OutlineSourceNode[],
      depth: number,
      parentID: string | null,
    ): Promise<OutlineNode[]> =>
      Promise.all(
        nodes.map(async (sourceNode) => {
          const node: OutlineNode = {
            id: `outline-${++nextID}`,
            parentID,
            depth,
            title:
              String(sourceNode.title ?? sourceNode.label ?? '(untitled)')
                .replace(/\s+/g, ' ')
                .trim() || '(untitled)',
            dest: sourceNode.dest ?? null,
            url: sourceNode.url ?? null,
            pageIndex: typeof sourceNode.pageIndex === 'number' ? sourceNode.pageIndex : null,
            expanded: depth === 0,
            children: [],
            hint: '',
          };
          node.pageIndex = await this.resolvePageIndex(node, node.dest, pdfDocument);
          node.children = await build(
            sourceNode.items ?? sourceNode.children ?? [],
            depth + 1,
            node.id,
          );
          return node;
        }),
      );
    return build(source, 0, null);
  }

  private readDomOutline(reader: ReaderRuntime, pdfWindow: PdfWindow): OutlineSourceNode[] {
    const document = reader._iframeWindow?.document ?? pdfWindow.document;
    const root = document.querySelector('#outlineView, [role="tree"], .outline, .outlineView');
    if (!root) return [];
    const anchors = Array.from(root.querySelectorAll('a')) as HTMLAnchorElement[];
    return anchors
      .filter((anchor) => anchor.textContent?.trim())
      .map((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const page = /(?:^|[&?#])page=(\d+)/i.exec(href.replace(/^[^#]*#?/, ''));
        return {
          title: anchor.textContent?.trim(),
          url: href || undefined,
          pageIndex: page?.[1] ? Number(page[1]) - 1 : undefined,
          items: [],
        };
      });
  }

  private refresh(state: OutlineState): void {
    const visible: OutlineNode[] = [];
    const visit = (nodes: readonly OutlineNode[]): void => {
      for (const node of nodes) {
        visible.push(node);
        if (node.expanded) visit(node.children);
      }
    };
    visit(state.tree ?? []);
    state.visible = visible;
    state.selected = Math.max(0, Math.min(state.selected, Math.max(0, visible.length - 1)));
    const hints = this.buildHints(visible.length);
    visible.forEach((node, index) => {
      node.hint = hints[index] ?? '';
    });
  }

  private move(state: OutlineState, direction: number): void {
    if (!state.visible.length) return;
    this.clearBuffers(state);
    state.selected = Math.max(0, Math.min(state.visible.length - 1, state.selected + direction));
    this.render(state);
  }

  private toggleNode(state: OutlineState, expand: boolean): void {
    const node = state.visible[state.selected];
    if (!node) return;
    if (expand) node.expanded = true;
    else if (node.expanded) node.expanded = false;
    else if (node.parentID) {
      const parent = state.visible.findIndex((candidate) => candidate.id === node.parentID);
      if (parent >= 0) state.selected = parent;
    }
    this.refresh(state);
    this.render(state);
  }

  private expandAll(state: OutlineState, expand: boolean): void {
    const walk = (nodes: readonly OutlineNode[]): void => {
      for (const node of nodes) {
        node.expanded = expand;
        walk(node.children);
      }
    };
    walk(state.tree ?? []);
    this.refresh(state);
    this.render(state);
    this.setStatus(state, expand ? 'Expanded all' : 'Collapsed all');
  }

  private selectBoundary(state: OutlineState, bottom: boolean): void {
    if (!state.visible.length) return;
    this.clearBuffers(state);
    state.selected = bottom ? state.visible.length - 1 : 0;
    this.render(state);
    this.setStatus(state, bottom ? 'Bottom' : 'Top');
  }

  private async activate(
    state: OutlineState,
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
  ): Promise<void> {
    const node = state.visible[state.selected];
    if (!node) return;
    if (await this.goTo(reader, pdfWindow, node)) {
      this.close(state, pdfWindow);
      this.#host.setModeNormal();
    } else {
      this.setStatus(state, 'Jump failed');
    }
  }

  private async goTo(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    node: OutlineNode,
  ): Promise<boolean> {
    const application = pdfWindow.PDFViewerApplication;
    const link = application?.pdfLinkService;
    try {
      if (this.setHash(link, node.dest)) return true;
      if (node.url && link?.setHash) {
        link.setHash(node.url.replace(/^[^#]*#?/, ''));
        return true;
      }
      if (node.dest && (await this.navigate(link, node.dest))) return true;
      const page = await this.resolvePageIndex(node, node.dest, application?.pdfDocument);
      if (page !== null && reader._internalReader?.navigate) {
        reader._internalReader.navigate({ pageIndex: page });
        return true;
      }
    } catch (error) {
      this.#host.log(`outline navigation failed: ${String(error)}`);
    }
    return false;
  }

  private setHash(link: PdfLinkService | undefined, destination: unknown): boolean {
    if (!destination || !link?.getDestinationHash || !link.setHash) return false;
    const hash = link.getDestinationHash(destination);
    if (!hash) return false;
    link.setHash(hash.replace(/^#/, ''));
    return true;
  }

  private async navigate(link: PdfLinkService | undefined, destination: unknown): Promise<boolean> {
    if (link?.goToDestination) {
      await link.goToDestination(destination);
      return true;
    }
    if (link?.navigateTo) {
      await link.navigateTo(destination);
      return true;
    }
    return false;
  }

  private async resolvePageIndex(
    node: OutlineNode,
    destination: unknown,
    pdfDocument: PdfDocumentRuntime | undefined,
  ): Promise<number | null> {
    if (node.pageIndex !== null) return node.pageIndex;
    const page = /(?:^|[&?])page=(\d+)/i.exec(node.url?.replace(/^[^#]*#?/, '') ?? '');
    if (page?.[1]) return Number(page[1]) - 1;
    let resolved = destination;
    if (typeof resolved === 'string') resolved = await pdfDocument?.getDestination?.(resolved);
    if (Array.isArray(resolved) && resolved.length) {
      const first = resolved[0];
      if (typeof first === 'number') return first;
      if (first && pdfDocument?.getPageIndex) return pdfDocument.getPageIndex(first);
    }
    return null;
  }

  private applyHint(state: OutlineState, key: string): void {
    const next = `${state.hintBuffer}${key}`;
    const matches = state.visible
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.hint.startsWith(next));
    if (!matches.length) {
      state.hintBuffer = '';
      this.setStatus(state, 'Hint not found');
      return;
    }
    state.hintBuffer = next;
    this.#host.clearTimer(state.hintTimer);
    state.hintTimer = this.#host.schedule(1200, () => this.clearHint(state));
    const exact = matches.find(({ node }) => node.hint === next);
    if (exact) {
      state.selected = exact.index;
      this.render(state);
      this.clearHint(state, false);
      this.setStatus(state, `Selected ${exact.node.hint} · Enter jump`);
      return;
    }
    this.setStatus(state, `Hint: ${next}`);
  }

  private clearBuffers(state: OutlineState): void {
    this.clearHint(state);
    this.clearCommand(state);
  }

  private clearHint(state: OutlineState, resetStatus = true): void {
    state.hintBuffer = '';
    this.#host.clearTimer(state.hintTimer);
    state.hintTimer = null;
    if (resetStatus)
      this.setStatus(state, 'j/k move · l expand · h collapse · Enter jump · Esc close');
  }

  private clearCommand(state: OutlineState): void {
    state.commandBuffer = '';
    this.#host.clearTimer(state.commandTimer);
    state.commandTimer = null;
  }

  private selectCurrent(state: OutlineState, pdfWindow: PdfWindow): void {
    const page = Math.max(
      0,
      (pdfWindow.PDFViewerApplication?.pdfViewer?.currentPageNumber ?? 1) - 1,
    );
    const matching = state.visible.reduce<number>(
      (best, node, index) => (node.pageIndex !== null && node.pageIndex <= page ? index : best),
      -1,
    );
    if (matching >= 0) state.selected = matching;
  }

  private buildHints(count: number): string[] {
    const alphabet = this.hintAlphabet();
    if (count <= alphabet.length) return [...alphabet.slice(0, count)];
    return Array.from(
      { length: count },
      (_, index) =>
        `${alphabet[Math.floor(index / alphabet.length)] ?? ''}${alphabet[index % alphabet.length] ?? ''}`,
    );
  }

  private hintAlphabet(): string {
    return 'asdfqwertyuiopzxcvbnm1234567890';
  }

  private fastStep(state: OutlineState): number {
    return Math.max(5, Math.floor(state.visible.length / 10) || 10);
  }

  private key(event: KeyboardEvent): string {
    if (!event.key || event.key === 'Dead' || event.key === 'Unidentified') return '';
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    parts.push(event.key.length === 1 ? event.key : event.key.toLowerCase());
    return parts.join('+');
  }

  private setStatus(state: OutlineState, text: string): void {
    if (state.status) state.status.textContent = text;
  }
}
