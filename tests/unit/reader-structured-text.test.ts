import { describe, expect, it, vi } from 'vitest';
import { ReaderStructuredText } from '../../src/modules/reader-selection/structured-text';
import type { ReaderDocumentSnapshot } from '../../src/reader/document-cache';
import type { PdfWindow } from '../../src/reader/types';

describe('structured motion source lifetime', () => {
  const focus = { textNode: {} as Text, offset: 0 };
  it('contains a late source after cache replacement and does not publish it to a later invocation', async () => {
    const pending = Promise.withResolvers<ReaderDocumentSnapshot | null>();
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(null);
    const text = new ReaderStructuredText(read);
    const old = text.paragraphs({} as PdfWindow, focus, () => true);
    text.invalidate();
    pending.resolve(null);
    expect(await old).toBeNull();
    expect(await text.paragraphs({} as PdfWindow, focus, () => true)).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not read source nodes after view retirement and rejects a changed PDF before mapping', async () => {
    const valid = vi.fn(async () => false),
      text = new ReaderStructuredText(
        async () => ({ isCurrent: valid }) as unknown as ReaderDocumentSnapshot,
      );
    expect(await text.paragraphs({} as PdfWindow, focus, () => false)).toBeNull();
    expect(valid).not.toHaveBeenCalled();
    await expect(text.paragraphs({} as PdfWindow, focus, () => true)).rejects.toThrow(
      'source changed',
    );
    expect(valid).toHaveBeenCalledOnce();
  });
});
