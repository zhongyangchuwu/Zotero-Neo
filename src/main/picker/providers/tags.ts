import { suggestTagPaths } from '../../tag-path';
import { isSourceNoteIdentity } from '../../../platform/note-relations';
import { t, type AppLanguage } from '../../../i18n';
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
  readonly language?: AppLanguage;
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
    meta,
  };
}

function namespaceItem(
  label: string,
  insertText: string,
  count: number,
  language: AppLanguage,
): PickerItem {
  return {
    id: `namespace:${insertText}`,
    title: label,
    search: insertText,
    tagName: insertText,
    tagCandidate: 'namespace',
    meta: t(count === 1 ? 'picker.oneTag' : 'picker.tagCount', language).replace(
      '{count}',
      String(count),
    ),
  };
}

function createItem(name: string, language: AppLanguage): PickerItem {
  return {
    id: `create:${name}`,
    title: t('picker.createTag', language).replace('{tag}', () => name),
    search: name,
    tagName: name,
    tagCandidate: 'create',
    meta: t('picker.newTag', language),
  };
}

/**
 * Builds a pure tag candidate source. It may project virtual path namespaces and a create
 * candidate, but it never mutates filters or item tags.
 */
export function createTagCandidateProvider(options: TagCandidateSourceOptions): PickerProvider {
  const language = options.language ?? 'en';
  return {
    title: options.title,
    placeholder: options.placeholder,
    async load() {
      const byName = new Map<string, TagRecord>();
      for (const record of await options.loadTags()) {
        if (isSourceNoteIdentity(record.tag)) continue;
        if (!byName.has(record.tag)) byName.set(record.tag, record);
      }
      return [...byName.values()].map((record) => tagItem(record, options.describe?.(record.tag)));
    },
    filterItems(items, query) {
      const records = items
        .filter(
          (item) =>
            item.tagCandidate === 'tag' && item.tagName && !isSourceNoteIdentity(item.tagName),
        )
        .map((item) => ({
          item,
          name: item.tagName!,
        }));
      const names = records.map((record) => record.name);
      const byName = new Map(records.map((record) => [record.name, record.item]));
      const suggestions = suggestTagPaths(names, query, options.separator);
      const projected = suggestions.map((suggestion) => {
        if (suggestion.kind === 'namespace')
          return namespaceItem(suggestion.label, suggestion.insertText, suggestion.count, language);
        return byName.get(suggestion.insertText) ?? tagItem({ tag: suggestion.insertText });
      });
      const trimmed = query.trim();
      const exact = names.some((name) => sameTag(name, trimmed));
      const canCreate =
        options.allowCreate === true &&
        !!trimmed &&
        !exact &&
        !isSourceNoteIdentity(trimmed) &&
        (!options.separator || !trimmed.endsWith(options.separator));
      return canCreate ? [createItem(trimmed, language), ...projected] : projected;
    },
    refineQuery(item) {
      return item.tagCandidate === 'namespace' ? (item.tagName ?? null) : null;
    },
    rowText(item) {
      if (item.tagCandidate === 'namespace')
        return `› ${item.title}${item.meta ? ` · ${item.meta}` : ''}`;
      return `${item.title}${item.meta ? ` · ${item.meta}` : ''}`;
    },
    preview(item) {
      if (item.tagCandidate === 'namespace') {
        return {
          title: item.title,
          body: [
            t('picker.tagNamespace', language),
            item.meta,
            t('picker.narrowTagQuery', language),
          ]
            .filter(Boolean)
            .join('\n'),
        };
      }
      return {
        title: item.tagName ?? item.title,
        body: [
          t(item.tagCandidate === 'create' ? 'picker.newTag' : 'picker.existingTag', language),
          item.meta ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    },
    emptyText: (query) =>
      query
        ? t('picker.noMatchingTags', language).replace('{query}', () => query)
        : t('picker.noTags', language),
  };
}
