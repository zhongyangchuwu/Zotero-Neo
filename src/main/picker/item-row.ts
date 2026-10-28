import type { PickerItem } from './model';

export function itemRowText(item: PickerItem): string {
  const metadata = `${item.title || '(untitled)'}${
    item.author ? ` — ${item.author}${item.year ? `, ${item.year}` : ''}` : ''
  }`;
  return item.citekey ? `@${item.citekey}  ${metadata}` : metadata;
}
