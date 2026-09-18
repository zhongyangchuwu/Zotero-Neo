import { suggestTagPaths } from '../../tag-path';
import type { PickerItem } from '../model';
import type { PickerProvider } from '../types';

export type TagRecord = { readonly tag: string; readonly type?: number };

export interface TagCandidateSourceOptions {
  readonly title: string;
  readonly placeholder: string;
  readonly separator: string;
  readonly allowCreate?: boolean;
  readonly loadTags: () => Promise<readonly TagRecord[]>;
  readonly describe?: (tag: string) => string | undefined;
}

function sameTag(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function tagItem(record: TagRecord, meta?: string): PickerItem {
  return {
    id: `tag:${record.tag}`,
    title: record.tag,
    search: record.tag,
    tagName: record.tag,
    tagCandidate: 'tag',
    tagType: record.type === 1 ? 'automatic' : 'manual',
    meta,
  };
}

function namespaceItem(label: string, insertText: string, count: number): PickerItem {
  return {
    id: `namespace:${insertText}`,
    title: label,
    search: insertText,
    tagName: insertText,
    tagCandidate: 'namespace',
    meta: `${count} tag${count === 1 ? '' : 's'}`,
  };
}

function createItem(name: string): PickerItem {
  return {
    id: `create:${name}`,
    title: `+ Create “${name}”`,
    search: name,
    tagName: name,
    tagCandidate: 'create',
    meta: 'New tag',
  };
}

/**
 * Builds a pure tag candidate source. It may project virtual path namespaces and a create
 * candidate, but it never mutates filters or item tags.
 */
export function createTagCandidateProvider(options: TagCandidateSourceOptions): PickerProvider {
  return {
    title: options.title,
    placeholder: options.placeholder,
    async load() {
      const byName = new Map<string, TagRecord>();
      for (const record of await options.loadTags()) {
        const existing = byName.get(record.tag);
        if (!existing || (existing.type === 1 && record.type !== 1)) byName.set(record.tag, record);
      }
      return [...byName.values()].map((record) => tagItem(record, options.describe?.(record.tag)));
    },
    filterItems(items, query) {
      const records = items
        .filter((item) => item.tagCandidate === 'tag' && item.tagName)
        .map((item) => ({
          item,
          name: item.tagName!,
        }));
      const names = records.map((record) => record.name);
      const byName = new Map(records.map((record) => [record.name, record.item]));
      const suggestions = suggestTagPaths(names, query, options.separator);
      const projected = suggestions.map((suggestion) => {
        if (suggestion.kind === 'namespace')
          return namespaceItem(suggestion.label, suggestion.insertText, suggestion.count);
        return byName.get(suggestion.insertText) ?? tagItem({ tag: suggestion.insertText });
      });
      const trimmed = query.trim();
      const exact = names.some((name) => sameTag(name, trimmed));
      const canCreate =
        options.allowCreate === true &&
        !!trimmed &&
        !exact &&
        (!options.separator || !trimmed.endsWith(options.separator));
      return canCreate ? [createItem(trimmed), ...projected] : projected;
    },
    refineQuery(item) {
      return item.tagCandidate === 'namespace' ? (item.tagName ?? null) : null;
    },
    rowText(item) {
      if (item.tagCandidate === 'namespace')
        return `› ${item.title}${item.meta ? ` · ${item.meta}` : ''}`;
      return `${item.title}${item.tagType ? ` · ${item.tagType}` : ''}${
        item.meta ? ` · ${item.meta}` : ''
      }`;
    },
    preview(item) {
      if (item.tagCandidate === 'namespace') {
        return {
          title: item.title,
          body: ['Tag namespace', item.meta, 'Enter to narrow the query']
            .filter(Boolean)
            .join('\n'),
        };
      }
      return {
        title: item.tagName ?? item.title,
        body: [
          item.tagCandidate === 'create' ? 'New tag' : 'Existing tag',
          item.tagType ? `Type: ${item.tagType}` : '',
          item.meta ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    },
    emptyText: (query) => (query ? `No tags match “${query}”` : 'No tags available'),
  };
}
