# Select text and annotate a PDF

Use Reader Select to find a passage, adjust its endpoints, then copy, search, or mark it in the PDF. Click the page text before starting so the PDF—not a search field, comment, or sidebar—owns the keyboard.

## Try it

1. Open a PDF in Zotero and click its page text. Press `v`, type a word or phrase visible on the page, then choose its hint. `Enter` chooses the nearest match.
2. With the text selected, press `z` and then `y` (`zy`) to create a yellow highlight.

## What you should see

The matching PDF text becomes the active selection. After `zy`, Zotero shows a yellow highlight annotation on that text. Press `Escape` during Flash to cancel without replacing the current selection.

## Find a passage and refine its range

In Reader Normal, press `v` to enter Select and use Flash to find text. If a native PDF text selection is already active, Neo can adopt it when available. Type a literal phrase from the document, then choose a letter hint; `Enter` chooses the nearest match. If Flash finds no match, try a shorter phrase that appears on the page. `Escape` cancels the Flash stage and preserves the active selection.

Once the text is selected, adjust the moving endpoint with `h` / `l` by character, `j` / `k` by line, `w` / `b` by word, and `0` / `$` to a line boundary. Use `)` / `(` for sentence boundaries and `}` / `{` for paragraph boundaries. Press `o` to swap which endpoint moves. To reach a distant endpoint, press `s`, search for another phrase, and choose its hint; the first endpoint stays in place.

## Use the selected text

- Press `y` to copy the selected text, with PDF line breaks and whitespace normalized. Press `#` to search for that text in the PDF.
- Press `zy`, `zr`, `zg`, `zb`, or `zp` to create a yellow, red, green, blue, or purple highlight.
- Press `a` or `Enter` to open Selection Actions. Choose **Underline** to underline the range or **Add note** to create an annotation and open its comment editor.
- Choose **Capture to note** to append the passage to an existing Zotero note. This is different from **Add note**, which creates an annotation comment. See [Capture a passage in an existing note](CAPTURE_GUIDE.md#try-it).

## Find and manage existing annotations

In Reader Normal, press `[a` / `]a` to select the previous or next annotation. Open the native Annotations panel with `<Space>ra` to browse its rows. With an annotation selected, `Y` copies its comment. Normal `y` opens the visible-target copy hints instead; to copy the selected annotation's excerpt directly, run the unbound `yankAnnotation` action from the Command Palette. Use `Zy`, `Zr`, `Zg`, `Zb`, or `Zp` to filter the panel by annotation color, and `Za` to clear the filter.

Give colors a consistent purpose in your reading: for example, yellow for main claims, blue for methods, and purple for questions to follow up. To change an existing annotation, select it and use `zy`, `zr`, `zg`, `zb`, or `zp` to recolor it. Later, filter the Annotations panel to one color to review the same kind of evidence across the paper, then clear the filter with `Za`.

To permanently delete the selected annotation, press `dd` and confirm. **Deletion cannot be undone.** Press `Escape` at the confirmation to leave the annotation in place.

## Edit an annotation comment

With an annotation selected, press `i` or `Enter` to open its comment editor when **Annotation comment editing** is enabled in [Settings](SETTINGS_GUIDE.md#try-it). Ordinary typing and IME input enter the comment; `Enter` inserts a newline. During an active IME composition, the IME handles `Escape` first.

Edits autosave two seconds after the last input while the editor stays open. `Escape` saves the final draft and closes the editor. Neo also saves and closes it when Reader interaction is deactivated or input is handed to a native editor.

Press `Escape` to save before closing a view or Reader. Disposal itself does not save pending text or cancel an already-started native save.

`za` / `i` in Reader Select creates an annotation and opens its comment editor. It does not capture text into an existing Zotero note.

## When an annotation cannot be placed

Neo can position an annotation only when it can map the selected range to one page or two adjacent pages. A longer, non-adjacent, or incomplete PDF range cannot create a partial annotation. The selected text remains available after that rejection: narrow the range to one page or two neighboring pages and retry the highlight, underline, or annotation. If you only need the passage as text, use `y`, `#`, or [Capture to note](CAPTURE_GUIDE.md#try-it).

For Reader navigation and panels, see [Read and navigate a PDF](READER_GUIDE.md#try-it). The [Command Reference: Reader Select](COMMAND_REFERENCE.md#reader-select-and-annotation-actions) lists all current selection and annotation actions.