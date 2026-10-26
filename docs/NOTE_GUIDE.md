# Find and edit Zotero notes

Open a paper's existing notes from its Library item, or browse the same library for a note attached to another paper or a standalone note. Neo opens the note in Zotero's editor; changes use Zotero's normal note-saving behavior.

## Try it

1. Click a paper in Zotero's Library item list. Press and release `Space`, then `f`, then `n` to open the note chooser for that paper.
2. Choose an existing note with the arrow keys and press `Enter`. To look beyond this paper's notes, choose **Browse library** and select another existing note.
3. Click inside the note editor. If **Vim-style note editing** is enabled, press `i` to type and `Escape` when you want the navigation keys again. If the setting is off, type as usual in Zotero's editor.

## What you should see

The chosen note opens with its existing contents. Its preview identifies the parent paper or standalone note and shows the body. To start a new note, create it in Zotero and then open it from the chooser.

## Find the right note

Use `<Space>fn` for the current paper's notes. Choose **Browse library** for other papers' notes and standalone notes in the same library, or **Current item** to return. Check the preview's parent item and contents when titles are similar.

After [capturing a PDF passage](CAPTURE_GUIDE.md#try-it), open the selected destination note from the Library or use the note chooser to find it. If it belongs to another item, use **Browse library**. The quote and available page label are appended to the existing note; the earlier contents remain.

## Move and edit in Normal mode

Enable **Vim-style note editing** in [Settings](SETTINGS_GUIDE.md#try-it) to navigate and edit with Note Normal commands. Enter Insert to type with Zotero's editor and IME. With the setting off, use Zotero's normal editing shortcuts directly.

Move with `h` / `j` / `k` / `l`; use `w` / `b` to move by word, `0` / `$` to reach a line boundary, and `gg` / `G` to move to the start or end of the note. Press `i` to type at the caret, `a` to type after it, or `A` / `I` to insert at the line end or start. Press `o` / `O` to open a line below or above and begin typing there. `Escape` returns to Note Normal.

For a small correction, `x` deletes the character at the caret; `dd` deletes a line and `dw` deletes through a word motion. To replace the current word, use `ciw`, type the replacement, then press `Escape`. Use `u` / `Ctrl+r` for this note editor's undo and redo history; they do not undo unrelated Zotero actions.

Yank with `yy` for a line, `yw` for a word, or `yiw` for the current word. A yank copies to both the system clipboard and Neo's Note register. `p` / `P` put the Note register after or before the caret; delete and change commands also replace that register. To bring text from another application or paste into a different note, enter Insert with `i` and use Zotero's normal paste shortcut (`Ctrl+V`, or `Command+V` on macOS).

Zotero's note editor handles saving. The [Command Reference: Note editor](COMMAND_REFERENCE.md#note-editor) lists all supported Note motions and editing actions.

## Develop a note as you read

Use a paper's own note for a running summary: capture a passage, write what it means in your own words, and add questions for the next reading pass. Put the caret after a quote, press `o` to open a new line, and type your explanation. Return to Normal with `Escape` when you want to move or revise the text.

For a synthesis across papers, create a topic note in the same library and find it with **Browse library**. Collect related excerpts with [Capture to note](CAPTURE_GUIDE.md#use-capture-to-note-for-literature-review), then organize your comparisons into arguments, agreements, and open questions. Use the quote's page label to check its context in the PDF.

When reorganizing a paragraph, yank or delete a line and put it at the new position with `p` / `P`. For a wording change, use `ciw` on the current word; use the note editor's `u` / `Ctrl+r` to revise the edit.

## Continue from the note to its paper

For a note attached to a paper, press `<Space>o` in Note Normal to open that item's PDF. If the note belongs to another item, the same command uses that note's item context. A standalone note has no paper attachment to open; return to the Library to choose a paper instead.

When a note has a parent item, `<Space>ta` / `<Space>tr` start adding or removing tags for that item, and `<Space>yy` copies its citekey when available. `Ctrl+o` / `Ctrl+i` also move Back and Forward through supported Neo history locations; see [Shared Back and Forward history](SEARCH_GUIDE.md#shared-back-and-forward-history) for how that history works across surfaces.