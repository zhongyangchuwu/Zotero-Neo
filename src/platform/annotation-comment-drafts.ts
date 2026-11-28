import { PREFERENCE_PREFIX } from '../core/preferences';

const DRAFT_PREFIX = `${PREFERENCE_PREFIX}.annotationComment.drafts.`;
const BACKUP_NAME = 'zotero-neo-annotation-comment-drafts';

function readUserDraft(prefs: nsIPrefBranch, key: string): string | undefined {
  // A locked preference can expose the default rather than the stored user value.
  if (prefs.prefHasUserValue(key) && !prefs.prefIsLocked(key) && prefs.getPrefType(key) === 32) {
    // getCharPref exposes the original bytes as Latin-1 code units, unlike getStringPref.
    return prefs.getCharPref(key);
  }
}

async function publishBackup(path: string, directory: string, bytes: Uint8Array): Promise<void> {
  const staging = await IOUtils.createUniqueFile(directory, `.${BACKUP_NAME}.tmp`, 0o600);
  try {
    await IOUtils.write(staging, bytes, { flush: true });
    await IOUtils.move(staging, path, { noOverwrite: true });
  } catch (error) {
    await IOUtils.remove(staging).catch(() => {});
    throw error;
  }
}

async function verifyBackup(path: string, expected: Uint8Array): Promise<void> {
  const actual = await IOUtils.read(path, { maxBytes: expected.length + 1 });
  if (actual.length !== expected.length || actual.some((byte, i) => byte !== expected[i])) {
    throw new Error('Draft backup readback did not match');
  }
}

/** Rescue local legacy drafts once. A rejected notice leaves the original prefs available. */
export async function rescueAnnotationCommentDrafts(
  notify: (backupPath: string) => void | Promise<void>,
): Promise<void> {
  try {
    const prefs = Services.prefs;
    const drafts: [key: string, raw: string][] = [];
    for (const key of prefs.getChildList(DRAFT_PREFIX)) {
      const raw = readUserDraft(prefs, key);
      if (raw !== undefined) drafts.push([key, raw]);
    }
    if (!drafts.length) return;

    if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
    // The bootstrap sandbox does not have DOM constructors; the notice also needs a live window.
    type EncodingHost = Pick<typeof globalThis, 'TextDecoder' | 'TextEncoder' | 'btoa'>;
    const window = Zotero.getMainWindow() as unknown as EncodingHost | null;
    if (!window) throw new Error('No main window available for draft rescue');
    const decoder = new window.TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const entries = drafts.map(([key, raw]) => {
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      try {
        return { key, raw: decoder.decode(bytes) };
      } catch {
        // Retain even invalid UTF-8 exactly; malformed JSON needs no special treatment.
        return { key, rawBase64: window.btoa(raw) };
      }
    });
    const text = JSON.stringify({ drafts: entries }, null, 2) + '\n';
    const bytes = new window.TextEncoder().encode(text);

    const profile = Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
    const destination = profile.clone();
    destination.append(`${BACKUP_NAME}-${Zotero.Utilities.randomString(16)}.json`);
    const path = destination.path;
    await publishBackup(path, profile.path, bytes);
    await verifyBackup(path, bytes);
    await notify(path);
    // The notice can yield to users/events that move or modify the backup.
    await verifyBackup(path, bytes);

    for (const [key, raw] of drafts) {
      if (readUserDraft(prefs, key) === raw) prefs.clearUserPref(key);
    }
  } catch {
    // Never expose source values or untrusted platform/notice errors to startup logging.
    throw new Error('Could not safely rescue legacy annotation comment drafts');
  }
}
