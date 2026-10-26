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

In Reader Normal, `y` (`copyTarget`) shows hints for copyable targets in the active PDF view; `f` (`followLink`) shows hints for recognized DOI, arXiv, and HTTP(S) text as well as native PDF links. Neither action requires a text selection or a selected annotation.

Copy hints keep each target as a separate intent:

| Hint label | Copied value |
| --- | --- |
| `Excerpt` | The annotation's excerpt text. |
| `Comment` | The annotation's comment. |
| `DOI` / `arXiv` | The bare identifier; arXiv versions such as `v2` are retained. |
| `URL` | The full HTTP(S) URL. |
| `Link` | The native external-link destination. A destination recognized as a DOI or arXiv identifier is copied as that bare identifier. |

An annotation with both an excerpt and a comment gets separate adjacent labels grouped together; an empty role is omitted. A DOI in an excerpt remains a separate target, so you can copy either the whole excerpt or just the DOI. Neo does not combine excerpt and comment text.

Hints use visible targets and supported geometry in the current PDF view. Annotation candidates respect Zotero's annotation visibility, hidden state, and active filter; unsupported or off-screen geometry is omitted. Text matching uses visible PDF text only: it does not guess ambiguous cross-line joins or use OCR.

The prompt identifies the action as `Copy target · Esc cancels` or `Follow link · Esc cancels`. Type a displayed hint to act immediately; no Enter is needed. Backspace removes the last label character, Escape cancels, and repeated key events are ignored so holding a key cannot confirm a target. If there is no copy target, Neo reports that and leaves the clipboard unchanged.

Following a bare DOI or arXiv identifier opens its resolver URL. A visible HTTP(S) target keeps its original destination; native PDF links keep Zotero's existing internal, citation, or external-link behavior. `f` does not include annotation excerpts or comments.

Reader Normal `Y` still copies the selected annotation's comment. To copy the selected annotation's excerpt directly instead of choosing a visible target, run the unbound `yankAnnotation` action from the Command Palette.

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