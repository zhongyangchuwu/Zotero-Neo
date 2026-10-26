# Troubleshooting

Use the symptom to find a recovery step.

## A key does nothing

1. Click the area you want to control: the item list or collection tree for Main, the PDF page for Reader, or the note editor for Note. Text fields, search boxes, and Zotero controls may receive the key instead.
2. If a PDF just opened, wait for it to load, click the page, and try again.
3. Open **Settings → Keybindings** with `<Space>ps`. Select the current context and search the action or key. Check whether the action is **Default**, **Custom**, or **Unbound**, and remove a conflicting remap if needed.
4. Check the related setting: **Text Select mode** enables Reader `v`; **Annotation comment editing** enables Reader Normal `i` / `Enter` for a selected comment; **Vim-style note editing** enables Note commands.

Native text fields, Zotero shortcuts, and IME composition keep their own input. The [Settings guide](SETTINGS_GUIDE.md) explains remapping and the [How Neo works](CONCEPTS.md) page explains focus.

## Settings will not apply a keybinding

Remove an exact duplicate, choose a key that is not reserved for Zotero or text editing, or select a context that supports the action. If one sequence is the start of another, Settings warns that the shorter command may wait; that prefix pair is allowed.

## The Notes chooser is empty or missing notes

Choose **Browse library** to search notes across the same Zotero library. Choose **Current item** to return to notes belonging to the item that opened the chooser. Capture to note adds text to an existing note; it does not create one.

## Flash does not find a phrase

Search for a short phrase that you can see and select in the PDF. A scanned page needs a readable text layer for a text match.

## Enter or Escape does not act like a Neo command

Finish or cancel the active IME composition, then press the command again. While composition is active, Enter and Escape belong to the input method.

## Enter adds a line in a comment, or Escape saves it

That is the annotation comment editor's behavior: Enter inserts a newline and ordinary Escape saves and closes the editor. Escape does not discard a draft; comment edits autosave after two seconds. Escape during IME composition remains with the IME.

## Translate or citekey copy is unavailable

In Reader Select, open Selection Actions to check for **Translate**; it appears when **Translate for Zotero** is installed. For `<Space>yy`, install **Better BibTeX** and use a target with a citekey. If any target or citekey is unavailable, Neo refuses the copy and leaves the clipboard unchanged.

## Plugin Manager cannot find or install a plugin

Press `<Space>pp` to inspect plugins already installed and known to Zotero. The manager does not install, update, remove, or discover plugins. Use Zotero's native **Plugins** screen for plugin installation and updates, removal, or disabling Neo.

## First heading or figure navigation takes a while

Let the first request finish. Zotero may need to analyze the PDF locally; later requests can reuse the result. Some PDFs have no usable headings, figures, or tables. See the [PDF Reader guide](READER_GUIDE.md) for the navigation controls.
