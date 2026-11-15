import { describe, expect, it } from 'vitest';
import {
  parseLocalRuleProfile,
  resolveLocalRuleProfile,
} from '../../src/document-analysis/local-rules/profile';

describe('local rule profile identity', () => {
  it('uses the effective configuration rather than JSON property order or omitted defaults', () => {
    const standard = resolveLocalRuleProfile();
    const explicit = {
      association: { ...standard.association },
      rules: {
        compoundPanels: { ...standard.rules.compoundPanels },
        ruledTables: { ...standard.rules.ruledTables },
        graphicLabels: { ...standard.rules.graphicLabels },
        unruledTables: { ...standard.rules.unruledTables },
      },
      version: 1,
    };
    expect(parseLocalRuleProfile(JSON.stringify(explicit)).fingerprint).toBe(standard.fingerprint);
    expect(parseLocalRuleProfile('  ').fingerprint).toBe(standard.fingerprint);
    expect(resolveLocalRuleProfile({}).fingerprint).toBe(standard.fingerprint);
  });

  it('separates a changed rule selection and a changed geometric threshold', () => {
    const original = resolveLocalRuleProfile();
    const disabled = resolveLocalRuleProfile({ rules: { unruledTables: { enabled: false } } });
    const threshold = resolveLocalRuleProfile({ association: { maxDistanceLines: 2 } });
    expect(new Set([original.fingerprint, disabled.fingerprint, threshold.fingerprint]).size).toBe(
      3,
    );
  });

  it('snapshots caller configuration so later mutation cannot change a running profile', () => {
    const options = { rules: { unruledTables: { enabled: false, minRows: 5 } } };
    const profile = resolveLocalRuleProfile(options);
    const identity = profile.fingerprint;
    options.rules.unruledTables.enabled = true;
    options.rules.unruledTables.minRows = 9;
    expect(profile.rules.unruledTables.enabled).toBe(false);
    expect(profile.rules.unruledTables.minRows).toBe(5);
    expect(profile.fingerprint).toBe(identity);
    expect(() => {
      Object.assign(profile.rules.unruledTables, { enabled: true });
    }).toThrow(TypeError);
  });
});

describe('local rule profile rejection', () => {
  it('reports malformed JSON rather than quietly selecting a different profile', () => {
    expect(() => parseLocalRuleProfile('{rules:')).toThrow('valid JSON');
  });

  it.each([
    ['null', 'localRules'],
    ['[]', 'localRules'],
    ['{"version":2}', 'version'],
    ['{"rulez":{}}', 'rulez'],
    ['{"rules":{"unruledTable":{}}}', 'unruledTable'],
    ['{"rules":{"graphicLabels":{"maxGap":1}}}', 'maxGap'],
    ['{"rules":{"unruledTables":{"enabled":"false"}}}', 'enabled'],
    ['{"rules":{"unruledTables":{"minRows":1}}}', 'minRows'],
    ['{"rules":{"unruledTables":{"minRows":2.5}}}', 'minRows'],
    ['{"rules":{"unruledTables":{"minColumns":0}}}', 'minColumns'],
    ['{"rules":{"compoundPanels":{"minOverlapRatio":1.1}}}', 'minOverlapRatio'],
    ['{"association":{"maxDistanceLines":-1}}', 'maxDistanceLines'],
    ['{"association":{"minWidthEm":"3"}}', 'minWidthEm'],
  ])('rejects %s with an actionable parameter path', (text, parameter) => {
    expect(() => parseLocalRuleProfile(text)).toThrow(parameter);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite programmatic values: %s', (value) => {
    expect(() => resolveLocalRuleProfile({ association: { minHeightEm: value } })).toThrow(
      'minHeightEm',
    );
  });
});

it.each([false, 1, null, {}])('rejects a non-string native preference: %s', (value) => {
  expect(() => parseLocalRuleProfile(value as unknown as string)).toThrow('JSON string');
});
