import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { extractLinks, openSafeURI, parseSafeURI } from '../../src/toolkit/uri';

afterEach(() => vi.unstubAllGlobals());

describe('content links', () => {
  it('hits Markdown labels and bare URLs without including adjacent punctuation', () => {
    const text =
      '中文[原始文献](https://example.org/Topic_(math))，裸链（http://example.org/路径）；' +
      '从 [zotero://select/library/items/ABCDEF12] 打开。Read https://example.org/a?x=1, then https://example.org/end.';
    const links = extractLinks(text);
    expect(links.map(({ start, end, uri }) => [text.slice(start, end), uri])).toEqual([
      ['原始文献', { kind: 'external', href: 'https://example.org/Topic_(math)' }],
      [
        'http://example.org/路径',
        { kind: 'external', href: 'http://example.org/%E8%B7%AF%E5%BE%84' },
      ],
      [
        'zotero://select/library/items/ABCDEF12',
        { kind: 'zotero', href: 'zotero://select/library/items/ABCDEF12' },
      ],
      ['https://example.org/a?x=1', { kind: 'external', href: 'https://example.org/a?x=1' }],
      ['https://example.org/end', { kind: 'external', href: 'https://example.org/end' }],
    ]);
  });

  it('does not discard balanced delimiters or IPv6 brackets inside bare URLs', () => {
    const text = 'Read (https://[::1]/Topic_(math)).';
    expect(extractLinks(text).map(({ start, end }) => text.slice(start, end))).toEqual([
      'https://[::1]/Topic_(math)',
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/doc',
    'chrome://zotero/content/zoteroPane.xhtml',
    'zotero://attachment/library/items/ABCDEF12',
    'zotero://select@elsewhere/library/items/ABCDEF12',
    'zotero://open-pdf:80/library/items/ABCDEF12',
    'https:///example.org',
    'https://example.org\\@elsewhere',
    'https://\texample.org',
  ])('refuses %s', (uri) => {
    expect(parseSafeURI(uri)).toBeNull();
    expect(extractLinks(`[not clickable](${uri})`)).toEqual([]);
  });

  it('uses the owning Zotero pane for authorized internal actions, never the OS launcher', () => {
    const launchURL = vi.fn();
    const pane = { loadURI: vi.fn() };
    vi.stubGlobal('Zotero', { launchURL });
    const owner = { ZoteroPane: pane } as unknown as MainWindow;
    const internal = parseSafeURI('ZOTERO://OPEN-PDF/library/items/ABCDEF12?page=4')!;
    expect(openSafeURI(internal, owner)).toBe(true);
    expect(pane.loadURI).toHaveBeenCalledWith('zotero://open-pdf/library/items/ABCDEF12?page=4');
    expect(openSafeURI(internal, {} as MainWindow)).toBe(false);
    expect(launchURL).not.toHaveBeenCalled();

    expect(openSafeURI(parseSafeURI('http://example.org/resource')!, owner)).toBe(true);
    expect(launchURL).toHaveBeenCalledExactlyOnceWith('http://example.org/resource');
    expect(openSafeURI({ kind: 'external', href: 'file:///tmp/doc' }, owner)).toBe(false);
    expect(launchURL).toHaveBeenCalledTimes(1);
  });
});
