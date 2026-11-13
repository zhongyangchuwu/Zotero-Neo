/** Match analysisPDF's file digest against bytes already loaded by the native PDF engine. */
export function pdfBytesFingerprint(bytes: Uint8Array): string {
  const classes = Components.classes as unknown as Record<
    string,
    { createInstance(iid: unknown): unknown }
  >;
  const hash = classes['@mozilla.org/security/hash;1'].createInstance(
    Components.interfaces.nsICryptoHash,
  ) as nsICryptoHash;
  hash.initWithString('md5');
  hash.update(bytes, bytes.byteLength);
  const digest = hash.finish(false);
  let hex = '';
  for (let index = 0; index < digest.length; index += 1)
    hex += digest.charCodeAt(index).toString(16).padStart(2, '0');
  return hex;
}
