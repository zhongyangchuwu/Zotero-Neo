import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ACTION_LABELS } from '../../src/input/actions';
import { DEFAULT_BINDINGS } from '../../src/input/bindings';

interface LegacyContract {
  readonly counts: {
    readonly bindings: number;
    readonly actionLabels: number;
    readonly zhActionLabels: number;
  };
  readonly bindings: Readonly<Record<string, string>>;
  readonly actionLabels: Readonly<Record<string, string>>;
  readonly zhActionLabels: Readonly<Record<string, string>>;
}

const legacyContract = JSON.parse(
  readFileSync('tests/fixtures/legacy-contract.json', 'utf8'),
) as LegacyContract;

describe('frozen legacy input contract', () => {
  it('preserves every default binding and the recorded binding count', () => {
    expect(Object.keys(DEFAULT_BINDINGS)).toHaveLength(legacyContract.counts.bindings);
    expect(DEFAULT_BINDINGS).toEqual(legacyContract.bindings);
  });

  it('preserves English action labels and their recorded count', () => {
    const englishLabels = Object.fromEntries(
      Object.entries(ACTION_LABELS).map(([action, labels]) => [action, labels.en]),
    );

    expect(Object.keys(englishLabels)).toHaveLength(legacyContract.counts.actionLabels);
    expect(englishLabels).toEqual(legacyContract.actionLabels);
  });

  it('preserves Chinese action labels and their recorded count', () => {
    const chineseLabels = Object.fromEntries(
      Object.entries(ACTION_LABELS).map(([action, labels]) => [action, labels['zh-CN']]),
    );

    expect(Object.keys(chineseLabels)).toHaveLength(legacyContract.counts.zhActionLabels);
    expect(chineseLabels).toEqual(legacyContract.zhActionLabels);
  });
});
