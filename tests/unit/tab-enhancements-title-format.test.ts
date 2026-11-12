import { describe, expect, it } from 'vitest';
import {
  formatTabTitle,
  validateTabTitleFormat,
} from '../../src/modules/tab-enhancements/title-format';

const fields = {
  nativeTitle: 'Native PDF',
  title: 'A paper',
  citekey: 'Smith2024',
  author: 'Smith',
  year: '2024',
  filename: 'paper.pdf',
};

describe('tab title formats', () => {
  it('renders real metadata and escaped braces', () => {
    expect(formatTabTitle('{{{citekey}}} {author} ({year}): {title} [{filename}]', fields)).toBe(
      '{Smith2024} Smith (2024): A paper [paper.pdf]',
    );
  });
  it('does not invent a citation key and falls back when all dynamic values are absent', () => {
    expect(formatTabTitle('{citekey}', { ...fields, citekey: '' })).toBe('Native PDF');
    expect(formatTabTitle('{citekey} - {title}', { ...fields, citekey: '' })).toBe(' - A paper');
    expect(formatTabTitle('literal {{text}}', fields)).toBe('literal {text}');
  });
  it('rejects unknown and unbalanced placeholders', () => {
    for (const template of ['{itemKey}', '{title', 'title}', '{title{year}}']) {
      expect(validateTabTitleFormat(template)).not.toBeNull();
      expect(formatTabTitle(template, fields)).toBe('Native PDF');
    }
    expect(validateTabTitleFormat('{{{title}}}')).toBeNull();
  });
});
