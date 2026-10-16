# How Neo works

Neo chooses a command from the Zotero area that has focus. The same key can therefore do different things in the Library, PDF Reader, and note editor.

## The same key can have different jobs

For example, `j` moves through Main item rows, scrolls a Reader PDF, or moves within a Note when Vim-style note editing is on. A search box, comment field, or other text input receives ordinary typing instead of Neo commands.

## Main, Reader, and Note

- **Main** is Zotero's Library window. Its View is the current library or collection and any active search or filters; that scope determines which items appear. In the item list, `j` and `k` move the Cursor. `v` starts a temporary range across visible item rows, not collections.
- **Reader** is for PDFs, text selection, and annotations. Select works on an eligible PDF text selection. An annotation's comment editor is a text field, separate from Reader navigation.
- **Note** is a Zotero note editor. With **Vim-style note editing** enabled, Normal keys move and edit; `i` enters Insert. Text entry and IME composition remain native to the editor.

For a guided task, continue with the [Library](MAIN_GUIDE.md#try-it), [PDF Reader](READER_GUIDE.md#try-it), or [Notes](NOTE_GUIDE.md#try-it) workflow.

## Moving from commands to text entry

Click the area you want to use: the item list for Main commands, the PDF page for Reader commands, or the note editor for Note commands. Click a search field or text editor to type there. Finish or cancel an IME composition before using a command key again.

On startup with Main active, Neo focuses the item list and places the Cursor on the first visible item in the current View. An empty View receives list focus without selecting an item. This does not override deliberate search or text input, and returning from Reader does not reset the Cursor.

In Reader Normal, `i` or `Enter` opens the selected annotation's comment editor when **Annotation comment editing** is on; Reader Select's **Add note** is a separate action. Enter inserts a line there; ordinary Escape saves and closes it. In Note, `i` enters Insert and Escape returns to Normal when Vim-style note editing is on.

## Cursor and Selection are different

In Main, the **Cursor** is the item row in focus. Moving it does not change the persistent **Selection**, the workset used for group operations. `v` builds a temporary row range; `s` adds or removes its items from the workset. Open the Selection Panel with `<Space>ss` to review the group. See [Library worksets](MAIN_GUIDE.md).

Changing a collection, search, or tag filter changes the **View**, not the workset. Check the Selection before a batch operation so items outside the current view do not surprise you. Reader and Note item actions use their own paper or note context.

Reader marks save PDF positions. They help you return to a passage while Main Selection helps you organize a group of items.

For the shared English and Chinese names, see [Project terminology](INTERACTION_MODEL.md#terminology).
