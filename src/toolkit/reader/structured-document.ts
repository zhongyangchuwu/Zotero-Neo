type RecordValue = Readonly<Record<string, unknown>>;
function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : null;
}

/** Full native analysis is requested explicitly; stale results never advance to later SDK stages. */
export async function structuredDocumentData(
  itemID: number | undefined,
  isCurrent: () => boolean,
): Promise<{
  readonly metadata: unknown;
  readonly catalog: unknown;
  readonly blocks: readonly unknown[];
} | null> {
  const reader = await structuredReader(itemID, isCurrent);
  if (
    !reader ||
    typeof reader.getMetadata !== 'function' ||
    typeof reader.getCatalog !== 'function'
  )
    return null;
  const metadata: unknown = await reader.getMetadata();
  if (!isCurrent()) return null;
  const catalog: unknown = await reader.getCatalog();
  if (!isCurrent()) return null;
  const blocks = await readBlocks(reader, isCurrent);
  return blocks ? { metadata, catalog, blocks } : null;
}

async function structuredReader(
  itemID: number | undefined,
  isCurrent: () => boolean,
): Promise<RecordValue | null> {
  const sdk = typeof Zotero === 'undefined' ? null : record(Reflect.get(Zotero, 'SDT'));
  const getReader = sdk?.getReader;
  if (typeof getReader !== 'function' || !itemID || !isCurrent()) return null;
  const reader = record(await getReader.call(sdk, itemID));
  return isCurrent() &&
    reader &&
    typeof reader.getTopLevelBlockCount === 'function' &&
    typeof reader.getBlocks === 'function'
    ? reader
    : null;
}

async function readBlocks(
  reader: RecordValue,
  isCurrent: () => boolean,
): Promise<readonly unknown[] | null> {
  if (
    !isCurrent() ||
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

/** Native extraction cannot be cancelled; stop requesting later stages after retirement. */
export async function structuredDocumentBlocks(
  itemID: number | undefined,
  isCurrent: () => boolean,
): Promise<readonly unknown[] | null> {
  const reader = await structuredReader(itemID, isCurrent);
  return reader ? readBlocks(reader, isCurrent) : null;
}
