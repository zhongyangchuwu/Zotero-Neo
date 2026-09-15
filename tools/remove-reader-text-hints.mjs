import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing refactor anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Ambiguous refactor anchor: ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function replaceRegexOnce(source, pattern, after, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1)
    throw new Error(`Expected one regex anchor for ${label}, found ${matches.length}`);
  return source.replace(pattern, after);
}

const controllerPath = 'src/reader/controller.ts';
let controller = fs.readFileSync(controllerPath, 'utf8');

controller = replaceOnce(
  controller,
  "import { ReaderTextHints } from './text-hints';\n",
  '',
  'ReaderTextHints import',
);
controller = replaceOnce(
  controller,
  '  readonly #textHints: ReaderTextHints;\n',
  '',
  'ReaderTextHints field',
);
controller = replaceOnce(
  controller,
  `    this.#textHints = new ReaderTextHints({\n      activePdfWindow: () => this.state.activePdfWindow,\n      clearLinkHints: () => this.clearLinkHints(),\n      setMode: (mode) => this.setMode(mode),\n      setVisualAnchor: (pointer) => {\n        this.state.visualAnchor = pointer;\n      },\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      updateVisualCursor: (pdfWindow, autoPan) => this.updateVisualCursor(pdfWindow, autoPan),\n    });\n`,
  '',
  'ReaderTextHints construction',
);
controller = replaceOnce(
  controller,
  `    this.state.indicator = null;\n    this.#textHints.clear();\n    this.clearLinkHints();\n`,
  `    this.state.indicator = null;\n    this.clearLinkHints();\n`,
  'dispose text hints',
);
controller = replaceOnce(
  controller,
  '        if (this.#textHints.active) this.#textHints.reposition(pdfWindow);\n',
  '',
  'scroll text hints',
);
controller = replaceOnce(
  controller,
  '        this.#textHints.reposition(pdfWindow);\n',
  '',
  'resize text hints',
);
controller = replaceOnce(
  controller,
  `    if (this.#textHints.active) {\n      this.#textHints.handleKey(event, pdfWindow);\n      return;\n    }\n`,
  '',
  'text hint key interception',
);
controller = replaceOnce(
  controller,
  '      this.#textHints.active ||\n',
  '',
  'readerConsumesKey text hints',
);
controller = replaceOnce(
  controller,
  "    if (mode !== 'visual' && mode !== 'cursor') this.#textHints.clear();\n",
  '',
  'mode cleanup text hints',
);
controller = replaceOnce(
  controller,
  `  private enterVisual(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    this.state.visualAnchor = null;\n    this.setMode('visual');\n    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {\n      this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };\n      this.updateVisualCursor(pdfWindow, true);\n      return;\n    }\n    this.#textHints.show(pdfWindow, 'visual');\n  }\n\n  private enterCursor(pdfWindow: PdfWindow): void {\n    this.state.visualAnchor = null;\n    this.state.cursorPreferredX = null;\n    this.setMode('cursor');\n    this.#textHints.show(pdfWindow, 'cursor');\n  }\n`,
  `  private enterVisual(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    this.state.visualAnchor = null;\n    this.setMode('visual');\n    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {\n      this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };\n      this.updateVisualCursor(pdfWindow, true);\n      return;\n    }\n    if (!this.ensureCursor(pdfWindow)) {\n      this.showStatus('✗ no selectable text', 1500);\n      this.setMode('normal');\n      return;\n    }\n    const caret = pdfWindow.getSelection();\n    if (caret && isTextNode(caret.anchorNode))\n      this.state.visualAnchor = { textNode: caret.anchorNode, offset: caret.anchorOffset };\n    this.updateVisualCursor(pdfWindow, true);\n  }\n\n  private enterCursor(pdfWindow: PdfWindow): void {\n    this.state.visualAnchor = null;\n    this.state.cursorPreferredX = null;\n    this.setMode('cursor');\n    if (!this.ensureCursor(pdfWindow)) {\n      this.showStatus('✗ no selectable text', 1500);\n      this.setMode('normal');\n      return;\n    }\n    this.updateVisualCursor(pdfWindow, true);\n  }\n`,
  'Cursor/Visual entry without legacy hints',
);
controller = replaceOnce(
  controller,
  `  private showLinkHints(pdfWindow: PdfWindow): void {\n    this.#textHints.clear();\n    this.clearLinkHints();\n`,
  `  private showLinkHints(pdfWindow: PdfWindow): void {\n    this.clearLinkHints();\n`,
  'Follow Link text hint cleanup',
);

fs.writeFileSync(controllerPath, controller);

for (const path of ['src/reader/text-hints.ts', 'tests/unit/reader-text-navigation.test.ts']) {
  if (!fs.existsSync(path)) throw new Error(`Expected legacy hint file: ${path}`);
  fs.unlinkSync(path);
}

const guidePath = 'docs/USER_GUIDE.md';
let guide = fs.readFileSync(guidePath, 'utf8');
guide = replaceRegexOnce(
  guide,
  /### Cursor mode\n\nEnter Cursor mode[\s\S]*?#### Caret movement/g,
  `### Cursor mode\n\nEnter Cursor mode with \`c\` from Normal mode. The legacy sentence/word hint\npicker has been removed in preparation for Flash-style text targeting. Until\nFlash lands, entering Cursor mode keeps an existing collapsed caret when\npossible and otherwise places the caret at the first selectable text position\nin the active PDF view.\n\n#### Caret movement`,
  'Cursor guide legacy hint section',
);
guide = replaceOnce(
  guide,
  '| `a..z` (hint) | Pick a sentence hint, then a word hint inside it to place the caret |\n',
  '',
  'Cursor hint mode-switch row',
);
guide = replaceRegexOnce(
  guide,
  /### Visual mode\n\nEnter Visual mode[\s\S]*?#### Selection movement/g,
  `### Visual mode\n\nEnter Visual mode with \`v\` from Normal mode. If a text selection already\nexists, its anchor is reused. Otherwise, until Flash-style targeting lands,\nVisual mode starts from the first selectable text position in the active PDF\nview.\n\n#### Selection movement`,
  'Visual guide legacy hint section',
);
guide = replaceRegexOnce(
  guide,
  /2\. Press the hint label shown at the desired sentence start — optionally\n   refine with a second \(word-level\) label to anchor at an exact word —\n   or press `j`\/`k` to begin from the current position\./g,
  '2. Until Flash-style targeting lands, Visual mode starts from the first selectable text position when there is no existing selection.',
  'annotation workflow hint step',
);
fs.writeFileSync(guidePath, guide);
