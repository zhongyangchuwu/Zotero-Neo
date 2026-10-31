import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentAttachments } from '../../src/operations/document-attachments';
import { resolveReaderDocumentAttachments } from '../../src/reader/item-target';
import { resolveMainDocumentAttachments } from '../../src/main/main-item-target';

const main = vi.hoisted(() => ({ effective: vi.fn() }));
vi.mock('../../src/main/action-targets', () => ({ resolveMainEffectiveTargets: main.effective }));
function item(id: number, pdf: boolean, attachments: number[] = []) {
  return {
    id,
    libraryID: 1,
    key: `AAAAAAA${id}`,
    deleted: false,
    isPDFAttachment: () => pdf,
    isRegularItem: () => !pdf,
    getAttachments: () => attachments,
    getField: () => `Item ${id}`,
  } as unknown as Zotero.Item;
}
afterEach(() => vi.unstubAllGlobals());
describe('preparation attachment targets', () => {
  it('expands regular Main items and deduplicates PDFs while preserving an explicitly selected child', () => {
    const a = item(1, true),
      b = item(2, true),
      parent = item(3, false, [1, 2]);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => [a, b, parent].find((i) => i.id === id) },
    });
    main.effective.mockReturnValue({ items: [a] });
    expect(resolveMainDocumentAttachments({} as never, null).map((t) => t.itemID)).toEqual([1]);
    main.effective.mockReturnValue({ items: [parent, b] });
    expect(resolveMainDocumentAttachments({} as never, null).map((t) => t.itemID)).toEqual([1, 2]);
  });
  it('Reader captures its exact PDF and never expands the parent or uses Main selection', () => {
    const a = item(1, true),
      b = item(2, true),
      parent = item(3, false, [1, 2]);
    vi.stubGlobal('Zotero', {
      Items: { get: (id: number) => [a, b, parent].find((i) => i.id === id) },
    });
    main.effective.mockClear();
    expect(resolveReaderDocumentAttachments({ itemID: 2 }).map((t) => t.itemID)).toEqual([2]);
    expect(main.effective).not.toHaveBeenCalled();
    expect(documentAttachments([parent], false)).toEqual([]);
  });
});
