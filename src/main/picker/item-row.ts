import { single } from '../../../vendor/fuzzysort/fuzzysort.js';
import type { PickerItem } from './model';
import type { PickerRowCells } from './react-model';

/** Match only the visible title for presentation; result ranking still uses item.search. */
export function itemRowCells(item: PickerItem, query: string, untitled: string): PickerRowCells {
  return {
    title: item.title || untitled,
    author: item.author || undefined,
    year: item.year || undefined,
    citekey: item.citekey || undefined,
    icon: item.bibliography?.icon,
    detail: item.meta,
    matches: query && item.title ? single(query, item.title)?.indexes : undefined,
  };
}
