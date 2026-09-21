import { isSingleKeyCharacter } from './key-sequence';

export interface KeyEventLike {
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
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

  const printable = isSingleKeyCharacter(key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  // Printable keys already encode Shift in event.key (D, ?, etc.). Named keys
  // such as Tab/ArrowDown do not, so retain Shift explicitly for those.
  if (event.shiftKey && !printable) parts.push('shift');
  parts.push(printable ? key : key.toLowerCase());
  return parts.join('+');
}
