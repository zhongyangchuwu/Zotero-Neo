# Read and navigate a PDF

Open an attachment in Zotero's Reader and click the PDF page before using Reader commands. That puts keyboard focus on the document instead of a search box, comment editor, or sidebar.

## Try it

1. Open a PDF in Reader and click its page area.
2. Press and release `Space`, then `-` to split the Reader horizontally into top and bottom panes.
3. Click the top pane and press `Ctrl+j` to focus the bottom pane. Use `j` / `k` to move that view; click the bottom pane and press `Ctrl+k` to return focus to the top, then move it separately.

## What you should see

Both panes show the PDF at separate reading positions. `Ctrl+j` / `Ctrl+k` changes which pane receives Reader commands; moving one view does not move the other.

## Move through a paper

Use `j` / `k` to scroll and `h` / `l` to turn to the previous or next PDF page. `Ctrl+d` / `Ctrl+u` move by half a view; `Ctrl+f` / `Ctrl+b` move by a full view. Counts repeat supported steps, so `3j` scrolls three configured steps and `3l` repeats the next-page action.

Use `gg` to go to the document's first-page start and uncounted `G` to move to the bottom. A positive count with `gg` or `G` targets that one-based page when Zotero supports direct page navigation—for example, `5G` targets page 5. If direct page navigation is unavailable, these commands scroll to the top or bottom instead.

Adjust the view with `+` / `zI` to zoom in and `-` / `zO` to zoom out. Press `=` / `z0` to reset to fit page width. Scrolling and zooming change the view, not Reader's shared Back/Forward history.

For a wide figure or table, zoom in and use `zh` / `zl` to pan left or right without changing zoom. Choose Step, Constant, or Accelerating scrolling in [Settings](SETTINGS_GUIDE.md) to match the way you move through dense text or large pages.

## Find a passage and inspect document structure

Press `/` to open Zotero's PDF search, enter a phrase, then use `n` / `N` for the next or previous result. `Escape` clears or closes the search. For a paper's structure, open or focus the native Outline with `<Space>ro`; use Zotero's Outline rows to browse its headings. `j` / `k` move through a focused Reader panel, and `Escape` leaves its local interaction. Repeating a panel-focus command keeps that panel focused rather than closing it.

Use `[s` / `]s` for the previous or next heading, `[f` / `]f` for a figure, and `[t` / `]t` for a table. Headings come from the PDF Outline; figure and table navigation uses available document structure and captions. The first request can take time while Zotero analyses the document. If the PDF has no usable structural targets, use page navigation or text search.

Other native Reader panels are available with `<Space>rm` for Bookmarks, `<Space>ra` for Annotations, and `<Space>rt` for Thumbnails. Each command opens or focuses its panel; use `j` / `k` to move among panel rows.

## Copy or follow visible targets

In Reader Normal, use `y` to copy a visible target or `f` to follow a link. Neither action requires a text selection or a selected annotation. If a text selection has put Reader in Select, press Escape to return to Normal first; Select `y` continues to copy that selection.

1. Click the PDF pane you want to use, keeping the target visible, then press `y` or `f`.
2. Read the letter sequence beside the target. For example, `A Excerpt` and `S Comment` beside one highlight are two separate choices. Type only the letters, in either case—not the caption. Letters are assigned for each invocation and may be longer on a crowded page.
3. Confirmation acts immediately and closes the hints; no Enter is needed. Even a single target needs confirmation. Escape cancels without copying or opening anything.

For copy hints, the caption identifies the payload:

| Target caption | Copied value |
| --- | --- |
| `Excerpt` | The annotation's excerpt text. |
| `Comment` | The annotation's comment, without first opening its editor. |
| `DOI` / `arXiv` | The bare identifier; arXiv versions such as `v2` are retained. |
| `URL` | The full HTTP(S) URL. |
| `Link` | A native external-link destination that is not recognized as an identifier or HTTP(S) URL. |

An annotation with both an excerpt and a comment gets adjacent labels in one group; an empty role is omitted. A DOI in an excerpt remains a separate target, so you can copy either the whole excerpt or just the DOI. Neo does not combine excerpt and comment text.

The prompt distinguishes copying from following. Backspace edits the typed label prefix; an invalid prefix resets it without acting. Repeated letter-key events cannot confirm a target. Clicking or changing focus retires Neo's hints while native clicks and text controls retain their normal behavior. Text input and IME keep ownership in editors.

Following a bare DOI or arXiv identifier opens its resolver URL. An existing HTTP(S) URL keeps its path, query, fragment, and letter case; native PDF links retain Zotero's internal, citation, or external-link behavior. `f` does not include ordinary annotation excerpts or comments, and neither action adds an item to the Library.

### Visibility and recovery

- Candidates belong to the active PDF view, including in split or standalone Reader. Annotation candidates respect Zotero's visibility and filter state and need a visible anchor; their comment editor can remain closed.
- Only supported rectangle-based annotation geometry is used. Ink and rotated free-text anchors are omitted rather than guessed. Text matching uses visible same-line PDF text; it does not guess ambiguous cross-line joins or use OCR. A scanned PDF can still offer native links or positioned annotations even when it has no text matches.
- Hidden containing PDF frames are not targets, including the base PDF retained by Zotero's Reading Mode. Hiding a view after hints open also invalidates its copy/follow confirmations; Neo does not discover targets from Reading Mode's replacement content.
- Changed annotation content, position, filter, or view invalidates its old labels. If a target disappears, reopen hints rather than trying to confirm its old label. No candidate or cancellation leaves the clipboard unchanged.
- If a very small or crowded pane cannot fit the labels safely, the whole hint interaction is cancelled. Enlarge the pane or zoom in to reduce visible targets, then reopen hints.

Normal `Y` still directly copies the current annotation's comment. The direct excerpt action `yankAnnotation` is available in the Command Palette without a default key. Custom bindings—including an explicitly unbound `y`—take precedence over the new default; inspect Settings → Keybindings if your keys behave differently.

## Add a referenced paper

To add a referenced paper by DOI or another identifier, press `<Space>ai` in Reader Normal or choose **Add Item by Identifier** in its Command Palette. Neo brings the associated Library window forward, keeps its current collection scope, and focuses Zotero's native entry. See [Add items by identifier](MAIN_GUIDE.md#add-items-by-identifier) for batch input, submission keys, and writable-library requirements.

## Compare two places in split Reader

Press `Space`, then `-` for a horizontal split or `Space`, then `|` for a vertical split. Each pane can show a different PDF position. Use `Ctrl+h` / `Ctrl+l` to focus the nearest pane to the left or right, and `Ctrl+j` / `Ctrl+k` for down or up. Then navigate the focused view independently. Focus commands move to an existing supported pane; use the split command to create the comparison layout.

Back/Forward restores available PDF positions while leaving the current zoom and split layout unchanged.

## Mark a place and return to it

Set a Reader mark with `m` followed by a lowercase letter or digit; press backtick followed by that label to return. `[m` / `]m` visits marks in document order and `<Space>rm` opens Bookmarks. Use `dm` followed by a label to remove a mark, or `dM` to clear them. Turn on **Persist marks** in [Settings](SETTINGS_GUIDE.md) to keep marks after restarting Zotero.

Use `Ctrl+o` and `Ctrl+i` to move through recorded destinations. [Shared history](SEARCH_GUIDE.md#shared-back-and-forward-history) explains how Reader jumps connect to Library and Note navigation.

## A practical reading loop

Start at fit width, skim pages with `h` / `l` or browse the Outline, then use `/` or heading, figure, and table navigation to return to evidence. Mark an important passage before moving on. When comparing sections, split the Reader and move each pane independently; use the mark or shared history to return to a previous place. To preserve a passage, continue with [Select text and annotate](SELECTION_GUIDE.md#try-it), then [Capture to a note](CAPTURE_GUIDE.md#try-it).

The [Command Reference](COMMAND_REFERENCE.md#reader-normal) lists Reader bindings and their exact behavior.