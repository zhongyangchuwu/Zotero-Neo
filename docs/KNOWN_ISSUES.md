# Known Issues

## ZV-004 — Restored readers can ignore motions while PDF content loads

**Status:** Shelved; inherited behavior, not yet confirmed as a Neo regression.

After Zotero restarts with restored PDF tabs, `hjkl` can appear unresponsive
until PDF.js finishes loading. Reader injection itself occurs during startup;
the remaining delay appears after injection, when scroll actions have no visible
PDF document yet.

Investigate on the latest stable Zotero:

- whether the loading status proves key capture during the delay;
- whether the early iframe is replaced during `_createView`;
- focus location while the document loads;
- reader forwarding and the 250 ms view resynchronization path.

## ZV-002 — Note editor `o` / `O` may split text at the caret

**Status:** Shelved.

In some contenteditable structures, Normal-mode `o` or `O` moves trailing text
to the new line instead of creating a clean sibling line. Reproduce with the
caret in the middle of a populated line.

Future work should inspect the real editor DOM, selection anchors, normalized
post-mutation structure, and any editor-native transaction API. Avoid synthetic
fallbacks that turn the command into a caret-position paragraph split.

## ZV-001 — Collections tree `za` / `zo` / `zc` can lose focus

**Status:** Shelved.

Collection-tree expand/collapse commands can return focus to the item list and
then affect the wrong view. Investigate the active element, collection selection,
resolved row type, and panel-detection state before and after the action. A
post-action focus lock is acceptable only when the command originated in the
collections tree.

## Resolved reference: marks persistence

Marks persist through the parent bibliographic item's `Extra` field, namespaced
per attachment, with a local-preference fallback. Attachments do not support
`Extra` directly, and child notes cannot be parented to attachments. This is a
maintenance constraint, not an open issue.
