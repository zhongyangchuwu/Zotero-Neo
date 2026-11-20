import { reportDiagnosticError, type Logger } from '../core/logging';
import type { BatchOutcome } from '../i18n/batch-result';
import { isSourceNoteIdentity } from '../platform/note-relations';
import { executeCollectionTransaction } from '../toolkit/main/collection-transactions';

/** Only the same live, editable item from the surface's target set may be changed. */
export function isWritableTagItem(item: Zotero.Item): boolean {
  if (
    !Number.isSafeInteger(item.id) ||
    item.id <= 0 ||
    Zotero.Items.get(item.id) !== item ||
    item.deleted ||
    item.isFeedItem ||
    !(item.isRegularItem() || item.isNote() || item.isAttachment())
  )
    return false;
  const library = Zotero.Libraries.get(item.libraryID);
  return (
    !!library &&
    library.editable &&
    !library.archived &&
    library.libraryType !== 'feed' &&
    item.isEditable()
  );
}

/** Apply one tag-presence operation, committing or restoring each item independently. */
export async function setItemTag(
  items: readonly Zotero.Item[],
  tag: string,
  present: boolean,
  request: { readonly isCurrent: () => boolean; readonly logger: Logger },
): Promise<BatchOutcome> {
  const name = tag.trim().normalize();
  if (!name) throw new Error('Tag name is empty');
  if (isSourceNoteIdentity(name)) throw new Error('Neo-managed tag cannot be edited');

  const result: BatchOutcome = { done: 0 };
  for (const item of items) {
    const { id, libraryID } = item;
    let previousType: number | null | undefined;
    let wasClean = false;
    let committed = false;
    try {
      if (!request.isCurrent() || !isWritableTagItem(item)) {
        result.unavailable = (result.unavailable ?? 0) + 1;
        continue;
      }
      const outcome = await executeCollectionTransaction<'done' | 'unchanged' | 'unavailable'>(
        async () => {
          // The native transaction can queue behind other writes.
          if (!request.isCurrent() || item.id !== id || item.libraryID !== libraryID)
            return 'unavailable';
          if (!isWritableTagItem(item)) return 'unavailable';
          const hadTag = item.hasTag(name);
          if (hadTag === present) return 'unchanged';
          wasClean = !item.hasChanged();
          previousType = hadTag ? (item.getTagType(name) ?? 0) : null;
          const db = Zotero.DB as unknown as {
            addCurrentCallback(type: 'commit', callback: () => void): void;
          };
          db.addCurrentCallback('commit', () => {
            committed = true;
          });
          const changed = present ? item.addTag(name, 0) : item.removeTag(name);
          if (!changed) return 'unchanged';
          await item.save();
          return 'done';
        },
        {
          reportCommittedError: true,
          onRollback: async () => {
            if (previousType === undefined) return;
            try {
              if (Zotero.Items.get(id) !== item) return;
              // Native save can load staged data before SQL rolls back. Reload
              // that baseline before reversing any cache mutation still visible.
              try {
                if (wasClean) await item.reload(['primaryData', 'tags'], true);
              } finally {
                if (Zotero.Items.get(id) === item) {
                  if (previousType === null) {
                    if (item.hasTag(name)) item.removeTag(name);
                  } else if (!item.hasTag(name)) {
                    item.addTag(name, previousType);
                  }
                }
              }
            } catch (error) {
              reportDiagnosticError(request.logger, `Tag rollback failed for item ${id}`, error);
            }
          },
        },
      );
      result[outcome] = (result[outcome] ?? 0) + 1;
    } catch (error) {
      if (committed) {
        result.done++;
        reportDiagnosticError(request.logger, `Tag saved for item ${id}; refresh failed`, error);
      } else {
        result.failed = (result.failed ?? 0) + 1;
        reportDiagnosticError(request.logger, `Tag save failed for item ${id}`, error);
      }
    }
  }
  return result;
}
