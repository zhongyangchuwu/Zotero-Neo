// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReaderOutline } from '../../src/modules/reader-outline';

interface OutlineItem {
  title: string;
  location?: { position?: object; href?: string };
  url?: string;
  items?: OutlineItem[];
  matched?: boolean;
  childMatched?: boolean;
  expanded?: boolean;
}

interface ViewFrame {
  readonly _iframe: HTMLIFrameElement;
  readonly _iframeWindow: Window;
}

let frames: Map<number, FrameRequestCallback>;
let cleanups: (() => void)[];
const reportError = vi.fn<(error: unknown) => void>();

beforeEach(() => {
  frames = new Map();
  cleanups = [];
  reportError.mockClear();
  let next = 0;
  vi.stubGlobal('Components', {
    utils: {
      cloneInto: (value: unknown) => value,
      waiveXrays: (value: unknown) => value,
    },
  });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  document.body.innerHTML = `
    <div id="sidebarContainer">
      <div id="sidebarContent">
        <div class="viewWrapper"><div id="outlineView" role="listbox"></div></div>
      </div>
    </div>`;
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  expect(reportError).not.toHaveBeenCalled();
});

async function flush(): Promise<void> {
  await Promise.resolve();
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}

function viewFrame() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  return { _iframe: iframe, _iframeWindow: iframe.contentWindow! };
}

function printRows(markup: string): void {
  document.getElementById('outlineView')!.innerHTML = `<ul>${markup}</ul>`;
}

function row(id: number, title: string, options: { active?: boolean; children?: string } = {}) {
  return `<li id="outline-${id}" aria-label="${title}">
    <div class="item${options.active ? ' active' : ''}" data-id="${id}">
      <div class="toggle"></div><div class="title">${title}</div>
    </div>${options.children ? `<div class="children"><ul>${options.children}</ul></div>` : ''}
  </li>`;
}

function highlighted(): string[] {
  return Array.from(
    document.querySelectorAll(
      '#outlineView[data-zv-outline-follow] .item[data-zv-outline-current]',
    ),
    (element) => element?.parentElement?.id ?? '',
  );
}

function pdfItem(title: string, pageIndex: number, y?: number): OutlineItem {
  const rects = y === undefined ? [] : [[0, y, 0, y]];
  return { title, location: { position: { pageIndex, rects } } };
}

function reader(primary: ViewFrame, outline: OutlineItem[]) {
  const state = { outline, sidebarOpen: true, sidebarView: 'outline', primary: true };
  const internal = {
    _primaryView: primary,
    _secondaryView: undefined as ViewFrame | undefined,
    _primarySDTView: undefined as ViewFrame | undefined,
    _lastViewPrimary: true,
    _state: state,
  };
  const host = { itemID: 1, _iframeWindow: window, _window: window, _internalReader: internal };
  const dispose = mountReaderOutline(host, reportError);
  cleanups.push(dispose);
  return { internal, state, dispose };
}

function pdfView() {
  const view = viewFrame();
  const container = view._iframeWindow.document.createElement('div');
  view._iframeWindow.document.body.append(container);
  Object.defineProperty(container, 'clientHeight', { value: 500 });
  const pages = [
    {
      id: 1,
      y: 0,
      view: { viewport: { convertToViewportPoint: (x: number, y: number) => [x, 800 - y] } },
    },
    {
      id: 2,
      y: 800,
      view: { viewport: { convertToViewportPoint: (x: number, y: number) => [x, 800 - y] } },
    },
  ];
  Object.assign(view._iframeWindow, {
    PDFViewerApplication: {
      pdfViewer: {
        container,
        pagesCount: pages.length,
        currentPageNumber: 1,
        getPageView: (index: number) => pages[index]?.view,
        _getVisiblePages: () => ({ views: pages }),
      },
    },
  });
  return {
    view,
    scroll(top: number): void {
      container.scrollTop = top;
      container.dispatchEvent(new Event('scroll', { cancelable: true }));
    },
  };
}

describe('reader outline following', () => {
  it('uses the reading line within a PDF page, falls back to the page for no Y, and leaves native state alone', async () => {
    const pdf = pdfView();
    const items = [
      pdfItem('Page 1', 0),
      pdfItem('Introduction', 0, 700),
      pdfItem('Methods', 0, 500),
      pdfItem('Page 2', 1),
      pdfItem('Bogus Y', 1, NaN),
      pdfItem('Bogus page', 10),
      { title: 'Outside', url: 'https://example.com/' },
    ];
    const nativeStyle = document.createElement('style');
    nativeStyle.textContent = '.outline-view .item.active > .title { outline: 3px solid blue; }';
    document.head.append(nativeStyle);
    cleanups.push(() => nativeStyle.remove());
    const outline = document.getElementById('outlineView')!;
    outline.className = 'outline-view';
    outline.tabIndex = 0;
    outline.setAttribute('aria-activedescendant', 'outline-0');
    printRows(items.map((item, index) => row(index, item.title, { active: !index })).join(''));
    const nativeTitle = outline.querySelector<HTMLElement>('.active > .title')!;
    const host = reader(pdf.view, items);
    outline.focus();
    await flush();
    expect(highlighted()).toEqual(['outline-0']);

    pdf.scroll(40);
    await flush();
    expect(highlighted()).toEqual(['outline-1']);
    expect(getComputedStyle(nativeTitle)?.outline).toBe('none');
    expect(outline.querySelectorAll('.active')).toHaveLength(1);
    expect(outline.getAttribute('aria-activedescendant')).toBe('outline-0');
    expect(document.activeElement).toBe(outline);

    pdf.scroll(250);
    await flush();
    expect(highlighted()).toEqual(['outline-2']);
    pdf.scroll(750);
    await flush();
    expect(highlighted()).toEqual(['outline-3']);

    host.dispose();
    pdf.scroll(30);
    await flush();
    expect(highlighted()).toEqual([]);
    expect(outline.querySelector('[data-zv-outline-current]')).toBeNull();
    expect(getComputedStyle(nativeTitle)?.outline).toBe('3px solid blue');
  });

  it('does not steal sidebar scrolling or block synchronous native arrow-key reveals', async () => {
    const pdf = pdfView();
    const items = [pdfItem('Page', 0), pdfItem('One', 0, 700), pdfItem('Two', 0, 500)];
    printRows(row(0, 'Page', { active: true }) + row(1, 'One') + row(2, 'Two'));
    const outline = document.getElementById('outlineView')!;
    const sidebar = document.getElementById('sidebarContainer')!;
    const scroller = document.getElementById('sidebarContent')!;
    const item = (index: number) => document.querySelector<HTMLElement>(`#outline-${index} .item`)!;
    const nativeReveal = vi.fn();
    Object.defineProperty(item(0), 'scrollIntoView', {
      configurable: true,
      value: nativeReveal,
    });
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 300 },
    });
    vi.spyOn(item(0), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 10, 100, 20));
    vi.spyOn(item(1), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 130, 100, 20));
    vi.spyOn(item(2), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 150, 100, 20));
    const hover = vi.spyOn(sidebar, 'matches').mockReturnValue(true);
    const host = reader(pdf.view, items);
    await flush();

    pdf.scroll(40);
    await flush();
    expect(highlighted()).toEqual(['outline-1']);
    expect(scroller.scrollTop).toBe(0);

    const nearest = { block: 'nearest', inline: 'nearest' } as const;
    item(0).scrollIntoView(nearest);
    expect(nativeReveal).not.toHaveBeenCalled();
    outline.addEventListener('keydown', () => item(0).scrollIntoView(nearest), { once: true });
    outline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(nativeReveal).toHaveBeenCalledExactlyOnceWith(nearest);

    hover.mockReturnValue(false);
    pdf.scroll(250);
    await flush();
    expect(highlighted()).toEqual(['outline-2']);
    expect(scroller.scrollTop).toBe(70);
    host.dispose();
    expect(Object.getOwnPropertyDescriptor(item(0), 'scrollIntoView')).toEqual({
      configurable: true,
      enumerable: false,
      writable: false,
      value: nativeReveal,
    });
  });

  it('tracks the deepest displayed ancestor on fold and respects IDs renumbered by fold and search', async () => {
    const pdf = pdfView();
    const child = {
      ...pdfItem('Child', 0, 760),
      items: [pdfItem('Target', 0, 720)],
      expanded: false,
    };
    const parent = { ...pdfItem('Parent', 0, 780), items: [child], expanded: false };
    const items = [
      { ...pdfItem('Filtered', 1), matched: false, childMatched: false },
      parent,
      pdfItem('Target', 1),
    ];
    printRows(row(1, 'Parent') + row(2, 'Target', { active: true }));
    const host = reader(pdf.view, items);
    await flush();
    expect(highlighted()).toEqual(['outline-1']);

    parent.expanded = true;
    host.state.outline = [...items];
    printRows(row(1, 'Parent', { children: row(2, 'Child') }) + row(3, 'Target', { active: true }));
    await flush();
    expect(highlighted()).toEqual(['outline-2']);

    child.expanded = true;
    host.state.outline = [...items];
    printRows(
      row(1, 'Parent', { children: row(2, 'Child', { children: row(3, 'Target') }) }) +
        row(4, 'Target', { active: true }),
    );
    await flush();
    expect(highlighted()).toEqual(['outline-3']);

    parent.expanded = false;
    host.state.outline = [...items];
    printRows(row(1, 'Parent') + row(2, 'Target', { active: true }));
    await flush();
    expect(highlighted()).toEqual(['outline-1']);
  });

  it('follows Snapshot positions in the active split and retires queued work from a hidden view', async () => {
    const first = viewFrame();
    const second = viewFrame();
    const items = ['one', 'two'].map((title) => ({
      title,
      location: { position: { type: 'CssSelector', value: `#${title}` } },
    }));
    function snapshot(view: ViewFrame, tops: number[]) {
      const window = view._iframeWindow;
      const document = window.document;
      document.body.innerHTML = '<h1 id="one">one</h1><h2 id="two">two</h2>';
      Object.defineProperty(window, 'innerHeight', { value: 500 });
      Object.assign(view, {
        toDisplayedRange(position: { value: string }): Range | null {
          const index = items.findIndex((item) => item.location.position.value === position.value);
          const target = document.querySelector(position.value);
          if (!target || index === -1) return null;
          const range = document.createRange();
          range.selectNode(target);
          range.getBoundingClientRect = () => new DOMRect(0, tops[index]!, 100, 20);
          return range;
        },
      });
    }
    snapshot(first, [-20, 120]);
    snapshot(second, [-200, 60]);
    printRows(row(0, 'one', { active: true }) + row(1, 'two'));
    const { internal } = reader(first, items);
    internal._secondaryView = second;
    await flush();
    expect(highlighted()).toEqual(['outline-0']);

    internal._lastViewPrimary = false;
    vi.advanceTimersByTime(250);
    await flush();
    expect(highlighted()).toEqual(['outline-1']);

    second._iframeWindow.dispatchEvent(new Event('resize'));
    second._iframe.style.visibility = 'hidden';
    await flush();
    expect(highlighted()).toEqual([]);
  });

  it('follows the Reading Mode outline in the overlay rather than the hidden base PDF', async () => {
    const pdf = pdfView();
    const overlay = viewFrame();
    const viewWindow = overlay._iframeWindow;
    Object.defineProperty(viewWindow, 'innerHeight', { value: 500 });
    const overlayDocument = viewWindow.document;
    overlayDocument.body.innerHTML = `
      <main id="sdt-content"><div id="sdt-0">one</div><div id="sdt-1">two</div></main>`;
    const first = overlayDocument.getElementById('sdt-0')!;
    const second = overlayDocument.getElementById('sdt-1')!;
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, -20, 100, 20));
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 100, 20));
    const items = [
      { title: 'one', location: { href: '#sdt-0' } },
      { title: 'two', location: { href: '#sdt-1' } },
    ];
    printRows(row(0, 'one', { active: true }) + row(1, 'two'));
    const { internal } = reader(pdf.view, items);
    pdf.view._iframe.style.visibility = 'hidden';
    internal._primarySDTView = overlay;
    await flush();
    expect(highlighted()).toEqual(['outline-1']);

    viewWindow.dispatchEvent(new Event('scroll'));
    overlay._iframe.remove();
    vi.advanceTimersByTime(250);
    await flush();
    expect(highlighted()).toEqual([]);
  });

  it('orders EPUB href targets against the native flow range, falling back to the section start', async () => {
    const view = viewFrame();
    const epub = view._iframeWindow.document;
    epub.body.innerHTML = `<div class="section-container" data-section-index="0" id="section">
      <h1 id="first">first</h1><p id="reading">text</p><h2 id="later">later</h2>
    </div>`;
    const section = epub.getElementById('section')!;
    const range = epub.createRange();
    range.setStart(epub.getElementById('reading')!.firstChild!, 1);
    range.collapse(true);
    const flow = { startRange: range as Range | null, startSection: { index: 0 } };
    Object.assign(view, {
      flow,
      _getHrefTarget: (href: string) => epub.getElementById(href.split('#')[1] ?? '') ?? section,
    });
    const items = [
      { title: 'Section', location: { href: 'section.xhtml' } },
      { title: 'First', location: { href: 'section.xhtml#first' } },
      { title: 'Later', location: { href: 'section.xhtml#later' } },
      { title: 'Missing', location: { href: 'section.xhtml#missing' } },
    ];
    printRows(items.map((item, index) => row(index, item.title)).join(''));
    reader(view, items);
    await flush();
    expect(highlighted()).toEqual(['outline-1']);

    flow.startRange = null;
    view._iframeWindow.dispatchEvent(new Event('resize'));
    await flush();
    expect(highlighted()).toEqual(['outline-0']);
  });
});
