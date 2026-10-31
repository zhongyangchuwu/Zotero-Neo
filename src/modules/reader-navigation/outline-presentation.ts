import { documentCaptionIdentity } from '../../document-analysis/caption-identity';

const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)*)(?:[.)、])?\s+\S/;

const MEANINGFUL_TITLE = /\p{L}/u;

export function outlineEntryKind(
  title: string,
  depth: number,
): 'figure' | 'table' | 'section' | 'subsection' | null {
  const caption = documentCaptionIdentity(title);
  if (caption) return caption.kind;

  if (!MEANINGFUL_TITLE.test(title)) return null;
  const numberedHeading = NUMBERED_HEADING.exec(title);
  if (numberedHeading) return numberedHeading[1].includes('.') ? 'subsection' : 'section';
  return depth > 0 ? 'subsection' : 'section';
}
