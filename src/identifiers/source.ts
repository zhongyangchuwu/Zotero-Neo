const OPENING_BRACKET: Readonly<Record<string, string>> = {
  ')': '(',
  ']': '[',
  '}': '{',
  '>': '<',
  "'": "'",
};

export function hasSourceStart(text: string, start: number): boolean {
  return start === 0 || !/[\p{L}\p{N}_.\/@%+-]/u.test(text[start - 1]);
}

/** Exclude sentence punctuation and external wrappers, keeping balanced brackets. */
export function sourceEnd(text: string, start: number, end: number): number {
  let prefixStart = start;
  while (prefixStart > 0 && !/\s/.test(text[prefixStart - 1])) prefixStart--;
  let prefix = text.slice(prefixStart, start);
  while (end > start) {
    while (end > start && /[.,]/.test(text[end - 1])) end--;
    const closing = text[end - 1];
    const opening = OPENING_BRACKET[closing];
    if (!opening) break;
    const openingIndex = prefix.lastIndexOf(opening);
    if (openingIndex < 0) break;
    if (opening !== closing) {
      if (openingIndex < prefix.lastIndexOf(closing)) break;
      let balance = 0;
      for (let index = start; index < end; index++) {
        if (text[index] === opening) balance++;
        else if (text[index] === closing) balance--;
      }
      if (balance >= 0) break;
    }
    prefix = prefix.slice(0, openingIndex) + prefix.slice(openingIndex + 1);
    end--;
  }
  return end;
}
