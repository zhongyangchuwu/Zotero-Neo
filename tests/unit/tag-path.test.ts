import { describe, expect, it } from 'vitest';

import { suggestTagPaths } from '../../src/main/tag-path';

describe('tag path suggestions', () => {
  const tags = [
    'method/diffusion-transformer',
    'method/diffusion-policy',
    'method/flow-matching',
    'dataset/libero',
    'status/to-read',
    'flat-tag',
  ];

  it('suggests a namespace from a partial root segment', () => {
    const suggestions = suggestTagPaths(tags, 'me', '/');
    expect(suggestions[0]).toMatchObject({
      kind: 'namespace',
      insertText: 'method/',
      count: 3,
    });
  });

  it('suggests children within an accepted namespace', () => {
    const suggestions = suggestTagPaths(tags, 'method/di', '/');
    expect(suggestions.map((suggestion) => suggestion.insertText)).toEqual([
      'method/diffusion-policy',
      'method/diffusion-transformer',
    ]);
    expect(suggestions.every((suggestion) => suggestion.kind === 'tag')).toBe(true);
  });

  it('supports a custom separator', () => {
    const suggestions = suggestTagPaths(['method:diffusion', 'method:flow'], 'me', ':');
    expect(suggestions[0]).toMatchObject({ kind: 'namespace', insertText: 'method:' });
  });

  it('stays completely flat when the separator is empty', () => {
    const suggestions = suggestTagPaths(tags, 'diff', '');
    expect(suggestions.some((suggestion) => suggestion.kind === 'namespace')).toBe(false);
    expect(suggestions[0]?.insertText).toBe('method/diffusion-policy');
  });
});
