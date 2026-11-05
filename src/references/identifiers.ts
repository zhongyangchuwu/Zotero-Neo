export function normalizeDOI(value: string | null | undefined): string | null {
  const match = value
    ?.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    .replace(/^doi:\s*/iu, '')
    .match(/^10\.\d{4,9}\/\S+$/iu);
  return match ? match[0].toLowerCase() : null;
}

export function normalizeArxiv(value: string | null | undefined): string | null {
  const id = value
    ?.trim()
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//iu, '')
    .replace(/^arxiv:\s*/iu, '')
    .replace(/\.pdf$/iu, '');
  return id && /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})(?:v\d+)?$/iu.test(id)
    ? id.toLowerCase()
    : null;
}
