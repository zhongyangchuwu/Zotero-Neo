import { installNoteLinks, installReaderCommentLinks } from '../../toolkit';
import type { ReaderRuntime, SafeURI } from '../../toolkit';

export function mountReaderCommentLinks(
  reader: ReaderRuntime,
  open: (uri: SafeURI) => boolean,
): () => void {
  return installReaderCommentLinks(reader, open);
}

export function mountNoteLinks(window: Window, open: (uri: SafeURI) => boolean): () => void {
  return installNoteLinks(window, open);
}
