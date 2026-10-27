import { describe, expect, it } from 'vitest';
import { recognizeIdentifiers } from '../../src/identifiers';

describe('source identifier recognition', () => {
  it('returns every mixed and repeated occurrence in source order', () => {
    const text =
      'DOI 10.1000/Alpha arXiv:2401.01234v2 https://Example.org/A?Q=X#Part 10.1000/Alpha';
    const matches = recognizeIdentifiers(text);
    expect(matches.map(({ kind, value }) => ({ kind, value }))).toEqual([
      { kind: 'doi', value: '10.1000/Alpha' },
      { kind: 'arxiv', value: '2401.01234v2' },
      { kind: 'http', value: 'https://Example.org/A?Q=X#Part' },
      { kind: 'doi', value: '10.1000/Alpha' },
    ]);
    expect(matches[0].start).toBe(text.indexOf('10.1000/Alpha'));
    expect(matches[3].start).toBe(text.lastIndexOf('10.1000/Alpha'));
    for (const match of matches) {
      expect(match.raw).toBe(text.slice(match.start, match.end));
    }
  });

  it('reports original UTF-16 offsets without normalizing Unicode or whitespace', () => {
    const text = '😀 10.1000/é (2401.0123v2) https://EXAMPLE.org/路径?q=😀#X';
    const matches = recognizeIdentifiers(text);
    expect(matches[0]).toEqual({
      kind: 'doi',
      start: 3,
      end: 12,
      raw: '10.1000/é',
      value: '10.1000/é',
    });
    expect(matches[1]).toEqual({
      kind: 'arxiv',
      start: text.indexOf('2401'),
      end: text.indexOf('2401') + '2401.0123v2'.length,
      raw: '2401.0123v2',
      value: '2401.0123v2',
    });
    expect(matches[2].raw).toBe('https://EXAMPLE.org/路径?q=😀#X');
    for (const match of matches) {
      expect(match.raw).toBe(text.slice(match.start, match.end));
    }
    expect(recognizeIdentifiers('１０.１０００/foo 10.1000/\nfoo 2401. 01234')).toEqual([]);
  });

  it('keeps shortDOIs and removes only external wrappers and terminal dots or commas', () => {
    const text = 'doi:10/AbCd (10.1234/thing[part](x)) [10.1234/a,b;c:d(e)[f]{g}] <10/xy> 10/zz.,';
    expect(recognizeIdentifiers(text).map(({ raw, value }) => ({ raw, value }))).toEqual([
      { raw: '10/AbCd', value: '10/AbCd' },
      { raw: '10.1234/thing[part](x)', value: '10.1234/thing[part](x)' },
      { raw: '10.1234/a,b;c:d(e)[f]{g}', value: '10.1234/a,b;c:d(e)[f]{g}' },
      { raw: '10/xy', value: '10/xy' },
      { raw: '10/zz', value: '10/zz' },
    ]);
    expect(recognizeIdentifiers('10.1234/a)')[0].value).toBe('10.1234/a)');
  });

  it('preserves SICI punctuation and decodes paired encoded DOI angle brackets', () => {
    const sici = '10.1002/(SICI)1099-0844(199912)17:4<290::AID-CBF849>3.0.CO;2-P';
    const encoded = '10.1000/part%3Cinside%3E';
    const matches = recognizeIdentifiers(`${sici} ${encoded} 10.1000/part%3Cinside`);
    expect(matches.map(({ value }) => value)).toEqual([
      sici,
      '10.1000/part<inside>',
      '10.1000/part%3Cinside',
    ]);
    expect(matches[1].raw).toBe(encoded);
  });

  it('decodes DOI resolver URLs into a single typed full-source candidate', () => {
    const urls = [
      'https://doi.org/10.1000%2FAb%28C%29',
      'http://dx.doi.org/10/AbCd',
      'HTTPS://DOI.ORG/%2810.1234%2Fwrapped%29',
      'https://doi.org/10.1234/part%3Cinside%3E',
    ];
    const matches = recognizeIdentifiers(urls.join(' '));
    expect(matches.map(({ kind, raw, value }) => ({ kind, raw, value }))).toEqual([
      { kind: 'doi', raw: urls[0], value: '10.1000/Ab(C)' },
      { kind: 'doi', raw: urls[1], value: '10/AbCd' },
      { kind: 'doi', raw: urls[2], value: '10.1234/wrapped' },
      { kind: 'doi', raw: urls[3], value: '10.1234/part<inside>' },
    ]);
    for (const match of matches) {
      expect(match.raw).toBe(urls.join(' ').slice(match.start, match.end));
    }
  });

  it('leaves malformed DOI URL escapes intact instead of throwing', () => {
    const raw = 'https://doi.org/10.1234/Bad%ZZ';
    expect(recognizeIdentifiers(raw)).toEqual([
      { kind: 'doi', start: 0, end: raw.length, raw, value: '10.1234/Bad%ZZ' },
    ]);
  });

  it('retains four- and five-digit modern IDs, old archives and every version', () => {
    const ids = ['0706.0044', '2401.01234v2', 'hep-th/9901001v3', 'math.GT/0309136v1'];
    expect(
      recognizeIdentifiers(ids.join(' ')).map(({ kind, raw, value }) => ({ kind, raw, value })),
    ).toEqual(ids.map((id) => ({ kind: 'arxiv', raw: id, value: id })));
    expect(
      recognizeIdentifiers('arXiv:2401.01234v2 2401.01234v2.').map(({ value }) => value),
    ).toEqual(['2401.01234v2', '2401.01234v2']);
  });

  it('recognizes abs and PDF arXiv URLs without overlapping HTTP or inner-ID hints', () => {
    const urls = [
      'https://arxiv.org/abs/2401.01234v2',
      'http://arxiv.org/pdf/0706.0044v1.pdf',
      'https://www.arxiv.org/abs/hep-th/9901001v3?download=1#page=2',
      'https://export.arxiv.org/pdf/math.GT/0309136v2.pdf',
    ];
    const matches = recognizeIdentifiers(urls.join(' '));
    expect(matches.map(({ kind, raw, value }) => ({ kind, raw, value }))).toEqual([
      { kind: 'arxiv', raw: urls[0], value: '2401.01234v2' },
      { kind: 'arxiv', raw: urls[1], value: '0706.0044v1' },
      { kind: 'arxiv', raw: urls[2], value: 'hep-th/9901001v3' },
      { kind: 'arxiv', raw: urls[3], value: 'math.GT/0309136v2' },
    ]);
  });

  it('keeps generic HTTP spelling, case, punctuation, query and fragment unchanged', () => {
    const url = 'HTTPS://Example.ORG/A(B)/C;D?Token=AbC&next=2401.01234#Part';
    const text = `(${url}), https://example.org/search?doi=10.1234/ABC`;
    const matches = recognizeIdentifiers(text);
    expect(matches).toEqual([
      { kind: 'http', start: 1, end: url.length + 1, raw: url, value: url },
      {
        kind: 'http',
        start: text.indexOf('https://example.org'),
        end: text.length,
        raw: 'https://example.org/search?doi=10.1234/ABC',
        value: 'https://example.org/search?doi=10.1234/ABC',
      },
    ]);
  });

  it('keeps internal URL parentheses when removing wrappers and sentence punctuation', () => {
    const url = 'https://example.org/a(b)';
    for (const text of [`(${url}.)`, `([${url}.]),`, `(${url}.`]) {
      const start = text.indexOf(url);
      expect(recognizeIdentifiers(text)).toEqual([
        { kind: 'http', start, end: start + url.length, raw: url, value: url },
      ]);
    }
  });

  it('keeps literal DOI URL angle brackets as the native cleanup baseline does', () => {
    const value = '10.1000/part<inside>';
    const url = `https://doi.org/${value}`;
    expect(recognizeIdentifiers(`<${url}>`)).toEqual([
      { kind: 'doi', start: 1, end: url.length + 1, raw: url, value },
    ]);
    const sici = '10.1002/(SICI)1099-0844(199912)17:4<290::AID-CBF849>3.0.CO;2-P';
    const raw = `https://doi.org/${sici}`;
    expect(recognizeIdentifiers(raw)).toEqual([
      { kind: 'doi', start: 0, end: raw.length, raw, value: sici },
    ]);
  });

  it('does not extract identifiers from arbitrary websites or unsupported schemes', () => {
    const urls = [
      'https://example.org/10.1234/ABC',
      'https://example.org/abs/2401.01234v2',
      'https://doi.org.example.org/10.1234/ABC',
      'https://arxiv.org.example.org/pdf/hep-th/9901001v2.pdf',
      'https://doi.org/not-a-doi',
      'https://arxiv.org/abs/2401.012345',
    ];
    expect(
      recognizeIdentifiers(urls.join(' ')).map(({ kind, value }) => ({ kind, value })),
    ).toEqual(urls.map((value) => ({ kind: 'http', value })));
    expect(
      recognizeIdentifiers(
        'ftp://doi.org/10.1234/ABC file:///2401.01234v2 mailto:person@example.org javascript:alert(1)',
      ),
    ).toEqual([]);
    expect(recognizeIdentifiers('example.org/10.1234/ABC example.org/1234567')).toEqual([]);
  });

  it('does not mistake years, other identifier types or partial IDs for supported IDs', () => {
    expect(
      recognizeIdentifiers(
        '2024 1999 PMID:12345678 ISBN:9780306406157 2401.012 2401.012345 2401.01234v2x ' +
          'hep-th/99010012 x10.1234/foo 10.123/foo 10.1234/ https://',
      ),
    ).toEqual([]);
  });

  it('has no state shared across calls and retains repeated resolver occurrences', () => {
    const url = 'https://doi.org/10/AbCd';
    expect(recognizeIdentifiers(`${url} ${url}`)).toHaveLength(2);
    expect(recognizeIdentifiers('')).toEqual([]);
    expect(recognizeIdentifiers(url)[0].value).toBe('10/AbCd');
  });
});
