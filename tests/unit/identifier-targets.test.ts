import { describe, expect, it } from 'vitest';
import { recognizeIdentifiers } from '../../src/identifiers';
import { identifierOpenURL } from '../../src/reader/identifier-targets';

describe('identifier follow destinations', () => {
  it.each([
    'HTTPS://DOI.ORG/10.1000/Alpha?download=1#Part',
    'https://arxiv.org/pdf/2301.01234v2.pdf?download=1#page=3',
  ])('opens an existing resolver URL without replacing its path, query or fragment: %s', (url) => {
    const [match] = recognizeIdentifiers(url);
    expect(identifierOpenURL(match!)).toBe(url);
  });

  it('constructs resolver destinations only for bare identifiers, preserving versions and DOI punctuation', () => {
    const [doi, arxiv] = recognizeIdentifiers('10.1000/A?B#C hep-th/9901001v3');
    expect(identifierOpenURL(doi!)).toBe('https://doi.org/10.1000/A%3FB%23C');
    expect(identifierOpenURL(arxiv!)).toBe('https://arxiv.org/abs/hep-th/9901001v3');
  });
});
