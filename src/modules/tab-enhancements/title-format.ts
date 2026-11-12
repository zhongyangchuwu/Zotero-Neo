import type { TabTitleFields } from '../../toolkit/main/tab-enhancements-types';

type Token = 'title' | 'citekey' | 'author' | 'year' | 'filename';
type Part = { text: string } | { token: Token };
const tokens: Record<Token, true> = {
  title: true,
  citekey: true,
  author: true,
  year: true,
  filename: true,
};

function parse(template: string): Part[] {
  const parts: Part[] = [];
  let text = '';
  for (let i = 0; i < template.length; i++) {
    const char = template[i];
    if ((char === '{' || char === '}') && template[i + 1] === char) {
      text += char;
      i++;
    } else if (char === '{') {
      const end = template.indexOf('}', i + 1);
      if (end < 0) throw new Error('Unclosed title placeholder');
      const token = template.slice(i + 1, end);
      if (!Object.prototype.hasOwnProperty.call(tokens, token))
        throw new Error(`Unknown title placeholder: ${token}`);
      if (text) parts.push({ text });
      text = '';
      parts.push({ token: token as Token });
      i = end;
    } else if (char === '}') {
      throw new Error('Unmatched closing brace in title format');
    } else {
      text += char;
    }
  }
  if (text) parts.push({ text });
  return parts;
}

let cachedTemplate: string | undefined;
let cachedParts: readonly Part[] = [];
let cachedError: string | null = null;
function compiled(template: string): readonly Part[] {
  if (cachedTemplate !== template) {
    cachedTemplate = template;
    try {
      cachedParts = parse(template);
      cachedError = null;
    } catch (error) {
      cachedParts = [];
      cachedError = error instanceof Error ? error.message : 'Invalid title format';
    }
  }
  if (cachedError) throw new Error(cachedError);
  return cachedParts;
}

export function validateTabTitleFormat(template: string): string | null {
  try {
    compiled(template);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid title format';
  }
}

export function formatTabTitle(template: string, fields: TabTitleFields): string {
  let parts: readonly Part[];
  try {
    parts = compiled(template);
  } catch {
    return fields.nativeTitle;
  }
  let hasValue = false;
  let hasToken = false;
  let result = '';
  for (const part of parts) {
    if ('text' in part) result += part.text;
    else {
      hasToken = true;
      const value = fields[part.token];
      if (value.trim()) hasValue = true;
      result += value;
    }
  }
  return (hasToken ? hasValue : result.length > 0) ? result : fields.nativeTitle;
}
