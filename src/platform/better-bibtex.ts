type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : null;
}

/** Returns an item's native or Better BibTeX cached citation key. */
export function citationKey(item: Zotero.Item): string {
  let nativeKey = '';
  try {
    nativeKey = String(item.getField('citationKey') ?? '').trim();
  } catch {
    // Zotero without Better BibTeX may not expose the custom field.
  }
  if (nativeKey) return nativeKey;

  const globals = record(globalThis);
  const zotero = record(globals?.Zotero);
  const betterBibTeX = zotero?.BetterBibTeX;
  const keyManager = record(record(betterBibTeX)?.KeyManager);
  const get = keyManager?.get;
  if (typeof get !== 'function') return '';
  const cachedKey = record(get.call(keyManager, item.id))?.citationKey;
  return typeof cachedKey === 'string' ? cachedKey : '';
}
