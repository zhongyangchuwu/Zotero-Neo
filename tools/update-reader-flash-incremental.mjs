import { readFile, writeFile } from 'node:fs/promises';

async function replaceExactly(path, before, after) {
  const source = await readFile(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: expected text not found`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`${path}: expected text is not unique`);
  await writeFile(path, source.replace(before, after));
}

await replaceExactly(
  'docs/USER_GUIDE.md',
  `Press \`s\`, type an ASCII/Latin literal query, then press \`Enter\` to freeze the current visible
matches and show stable hint labels. Type a displayed label to choose the target. \`Backspace\` edits
the query; after labels appear, an empty label buffer plus \`Backspace\` returns to query editing.
\`Escape\` cancels. Matching uses NFKC normalization, collapsed whitespace, and smartcase: lowercase
queries ignore case while any ASCII uppercase letter makes the query case-sensitive. There is no
fuzzy search or regex interpretation in this first version.

In Normal mode the target becomes a collapsed caret, so \`s … Enter …\`, then \`v\`, can start a
selection from that location. In Cursor mode Flash moves the caret and remains in Cursor mode. In
Visual mode it moves only the selection focus and preserves the Visual anchor, so a practical range
workflow is \`s\` to place the start, \`v\`, then \`s\` to place the other end; \`o\` still swaps the ends.
Only text currently visible in the active primary or split PDF view is indexed. Scrolling, resizing,
or replacing that view cancels Flash rather than reusing stale PDF.js text nodes.`,
  `Press \`s\` and type an ASCII/Latin literal query. Flash updates the visible match count on every
keystroke. When at most 48 targets remain, labels appear immediately; larger result sets show the
count plus \`type more\` and deliberately skip per-target geometry and badge rendering until the query
narrows. Label first letters are chosen so none can be the next character of any current match. This
keeps search and jump input unambiguous: a character that can extend the query keeps searching, while
a displayed label key starts label selection immediately. Multi-character labels use fixed-width
prefixes; \`Backspace\` backs out of label input or edits the query, \`Enter\` chooses the nearest
currently labelled target, and \`Escape\` cancels. Matching uses NFKC normalization, collapsed
whitespace, and smartcase; there is no fuzzy or regex interpretation in this first version.

In Normal mode the target becomes a collapsed caret, so \`s … label\`, then \`v\`, can start a
selection from that location. In Cursor mode Flash moves the caret and remains in Cursor mode. In
Visual mode it moves only the selection focus and preserves the Visual anchor, so a practical range
workflow is \`s\` to place the start, \`v\`, then \`s\` to place the other end; \`o\` still swaps the ends.
Only text currently visible in the active primary or split PDF view is indexed. Scrolling, resizing,
or replacing that view cancels Flash rather than reusing stale PDF.js text nodes.`,
);

await replaceExactly(
  'docs/DEVELOPMENT.md',
  `\`ReaderFlash\` owns one active visible-text invocation: the PDF view, literal query, normalized text
index, query/label stage, stable hint labels, prompt DOM, and cleanup. \`ReaderSessionState\` must not
mirror any Flash state. The session only resolves the \`flashText\` action and applies the selected
source pointer according to the current mode. Normal places a collapsed caret, Cursor moves its
caret and keeps Cursor mode, and Visual moves only the focus while preserving the existing anchor.

The v1 index includes only currently visible \`.textLayer span\` text from the active PDF view. It
normalizes NFKC and whitespace, supports literal cross-node matching with ASCII smartcase, ranks
labels by distance from the current caret/focus (or viewport center), and never jumps merely because
a query has one match. Enter freezes the current matches and their labels; an explicit label selects
the target. Scroll, resize, split-view replacement, blur, mode change, and disposal cancel the
invocation instead of live-reindexing stale PDF.js text. Fuzzy search, regex, whole-document indexing,
and CJK/IME composition are intentionally outside v1.`,
  `\`ReaderFlash\` owns one active visible-text invocation: the PDF view, literal query, normalized text
index, stable label reuse, label buffer, prompt/badge DOM, and cleanup. \`ReaderSessionState\` must not
mirror any Flash state. The session only resolves the \`flashText\` action and applies the selected
source pointer according to the current mode. Normal places a collapsed caret, Cursor moves its
caret and keeps Cursor mode, and Visual moves only the focus while preserving the existing anchor.

The v1 index includes only currently visible \`.textLayer span\` text from the active PDF view. It
normalizes NFKC and whitespace, supports literal cross-node matching with ASCII smartcase, and ranks
labels by distance from the current caret/focus (or viewport center). Incremental query updates first
run the cheap in-memory matcher. When more than \`FLASH_TARGET_LIMIT\` (48) matches remain, Flash
updates only the prompt and intentionally performs no Range geometry or per-target DOM rendering.
At or below that limit it measures visible targets and reuses stable labels where possible.

The first character of every rendered label is excluded from the set of letters that can extend any
current match by one character. This mirrors Flash.nvim's continuation-safe label idea: continuing the
search and starting a jump cannot compete for the same key. Multi-character labels use a fixed width
after their safe first character. Enter selects the nearest currently labelled target; Flash never
auto-jumps merely because only one text match remains. Scroll, resize, split-view replacement, blur,
mode change, and disposal cancel the invocation instead of live-reindexing stale PDF.js text. Fuzzy
search, regex, whole-document indexing, and CJK/IME composition are intentionally outside v1.`,
);
