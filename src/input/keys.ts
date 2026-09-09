export interface KeyEventLike {
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

const MODIFIER_KEY: Readonly<Record<string, true>> = {
  Control: true,
  Alt: true,
  Meta: true,
  Shift: true,
  CapsLock: true,
};

export function keyString(event: KeyEventLike): string {
  const key = event.key;
  if (!key || key === 'Dead' || key === 'Unidentified') return '';
  if (MODIFIER_KEY[key]) return '';

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  parts.push(key.length === 1 ? key : key.toLowerCase());
  return parts.join('+');
}
