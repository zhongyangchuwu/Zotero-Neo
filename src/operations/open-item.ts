export interface ItemOpenHost {
  viewAttachment?(itemID: number): void | Promise<void>;
  openNote?(itemID: number): void | Promise<void>;
  loadURI?(uri: string): void | Promise<void>;
}

/** Open exactly one explicit item through Zotero, preserving navigation rollback on host failure. */
export async function openItem(
  item: Zotero.Item,
  host: ItemOpenHost | undefined,
  beforeNavigate?: () => void | (() => void),
): Promise<string | null> {
  const navigate = async (run: () => void | Promise<void>): Promise<void> => {
    const rollback = beforeNavigate?.();
    try {
      await run();
    } catch (error) {
      rollback?.();
      throw error;
    }
  };

  if (item.isAttachment()) {
    const viewAttachment = host?.viewAttachment;
    if (!viewAttachment) return 'Attachment viewer is unavailable';
    await navigate(() => viewAttachment.call(host, item.id));
    return null;
  }
  if (item.isNote()) {
    const openNote = host?.openNote;
    if (!openNote) return 'Note viewer is unavailable';
    await navigate(() => openNote.call(host, item.id));
    return null;
  }

  let attachment: Zotero.Item | undefined = (await item.getBestAttachment?.()) || undefined;
  if (!attachment) {
    for (const id of item.getAttachments()) {
      const candidate = Zotero.Items.get(id);
      if (
        candidate !== false &&
        candidate.isAttachment() &&
        candidate.attachmentContentType === 'application/pdf'
      ) {
        attachment = candidate;
        break;
      }
    }
  }
  if (attachment) {
    const viewAttachment = host?.viewAttachment;
    if (!viewAttachment) return 'Attachment viewer is unavailable';
    await navigate(() => viewAttachment.call(host, attachment.id));
    return null;
  }

  const doi = item.getField('DOI');
  const url =
    item.getField('url') ||
    (doi ? `https://doi.org/${Zotero.Utilities.cleanDOI?.(doi) ?? doi}` : '');
  if (!url) return 'No attachment';
  const loadURI = host?.loadURI;
  if (!loadURI) return 'URI navigation is unavailable';
  await navigate(() => loadURI.call(host, url));
  return null;
}
