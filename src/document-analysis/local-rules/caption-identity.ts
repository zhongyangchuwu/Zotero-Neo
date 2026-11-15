const CHINESE = '[零〇一二三四五六七八九十百千万两]+';
const NUMBER = `(?:[A-Z][.]?)?\\d+(?:[.-]\\d+)*|${CHINESE}(?:[.．-]${CHINESE})*`;
const END = '(?=$|[\\s:：.．、,，)\\]】\\-–—\\u3400-\\u9fff])';
const FIGURE = new RegExp(
  `^\\s*(?:fig(?:ure)?\\.?\\s*|图\\s*)(${NUMBER})(\\s*\\([a-z]\\)|[a-z])?${END}`,
  'iu',
);
const TABLE = new RegExp(`^\\s*(?:table\\s*|表\\s*)(${NUMBER})${END}`, 'iu');
// Roman labels are uppercase and canonical, not words such as "mix" or "civil".
const ROMAN_TABLE = /^\s*(?:table\s*|表\s*)([IVXLCDM]+)(?=$|[\s:：.．、,，)\]】\-–—])/u;
const ROMAN = /^(?=[IVXLCDM]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u;

export interface DocumentCaptionIdentity {
  readonly kind: 'figure' | 'table';
  readonly label: string;
}

/** Share authored caption identity across backend regions and native Outline entries. */
export function documentCaptionIdentity(title: string): DocumentCaptionIdentity | null {
  const figure = FIGURE.exec(title);
  if (figure) return { kind: 'figure', label: figure[1]! + (figure[2]?.trim() ?? '') };
  const table = TABLE.exec(title);
  if (table) return { kind: 'table', label: table[1]! };
  const roman = ROMAN_TABLE.exec(title.replace(/^\s*table/iu, 'table'));
  return roman && ROMAN.test(roman[1]!) ? { kind: 'table', label: roman[1]! } : null;
}
