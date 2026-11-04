import { describe, expect, it } from 'vitest';
import { parseReaderAIOutput } from '../../src/reader-ai/output';
import type { ReaderAIEvidence } from '../../src/reader-ai/contracts';

const evidence: ReaderAIEvidence[] = [
  {
    id: 'figure-1',
    kind: 'figure',
    title: 'Figure',
    text: 'Caption',
    format: 'text',
    pageLabel: '1',
    precision: 'region',
    location: null,
    nativePosition: null,
  },
];
describe('reader AI output', () => {
  it('accepts supported references and an uncited refusal', () => {
    const output = {
      paragraphs: [{ text: 'Insufficient evidence', evidenceIDs: [] }],
      guide: [{ evidenceID: 'figure-1', role: 'result', reason: 'Shows a result' }],
    };
    expect(parseReaderAIOutput(output, evidence)).toEqual(output);
  });
  it('rejects unknown paragraph and guide IDs, unsupported roles, and malformed output', () => {
    for (const output of [
      { paragraphs: [{ text: 'Claim', evidenceIDs: ['unknown'] }], guide: [] },
      {
        paragraphs: [{ text: 'Claim', evidenceIDs: [] }],
        guide: [{ evidenceID: 'unknown', role: 'result', reason: 'why' }],
      },
      {
        paragraphs: [{ text: 'Claim', evidenceIDs: [] }],
        guide: [{ evidenceID: 'figure-1', role: 'invented', reason: 'why' }],
      },
      { paragraphs: [], guide: [] },
    ])
      expect(() => parseReaderAIOutput(output, evidence)).toThrow('invalid-output');
  });
});
