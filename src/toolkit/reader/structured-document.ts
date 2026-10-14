type RecordValue = Readonly<Record<string, unknown>>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : null;
}

/** Native extraction cannot be cancelled; stop requesting later stages after retirement. */
export async function structuredDocumentBlocks(
  itemID: number | undefined,
  isCurrent: () => boolean,
): Promise<readonly unknown[] | null> {
  const sdk = typeof Zotero === 'undefined' ? null : record(Reflect.get(Zotero, 'SDT'));
  const getReader = sdk?.getReader;
  if (typeof getReader !== 'function' || !itemID || !isCurrent()) return null;
  const reader = record(await getReader.call(sdk, itemID));
  if (
    !isCurrent() ||
    !reader ||
    typeof reader.getTopLevelBlockCount !== 'function' ||
    typeof reader.getBlocks !== 'function'
  )
    return null;
  const count: unknown = await reader.getTopLevelBlockCount();
  if (!isCurrent() || typeof count !== 'number' || !Number.isInteger(count) || count < 0)
    return null;
  const blocks: unknown = count ? await reader.getBlocks(0, count - 1) : [];
  return isCurrent() && Array.isArray(blocks) ? blocks : null;
}
