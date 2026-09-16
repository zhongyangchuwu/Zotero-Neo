import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, text) {
  fs.writeFileSync(path, text);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function removeExpected(text, value, expected, label) {
  let count = 0;
  let from = 0;
  while (true) {
    const index = text.indexOf(value, from);
    if (index < 0) break;
    count += 1;
    from = index + value.length;
  }
  if (count !== expected) throw new Error(`${label}: expected ${expected}, found ${count}`);
  return text.split(value).join('');
}

{
  const path = 'src/reader/controller.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    "import { ReaderSelectionActionRegistry, ReaderSelectionActions } from './selection-actions';\n",
    "import { ReaderSelectionActionRegistry, ReaderSelectionActions } from './selection-actions';\nimport { selectionClipboardText } from './selection-text';\n",
    'selection text import',
  );
  text = removeExpected(
    text,
    '    this.injectSelectionStyle(this.state.activePdfWindow);\n',
    1,
    'startup selection style call',
  );
  text = removeExpected(
    text,
    '      this.injectSelectionStyle(pdfWindow);\n',
    1,
    'view selection style call',
  );
  text = replaceOnce(
    text,
    `  private injectSelectionStyle(pdfWindow: PdfWindow): void {\n    const document = pdfWindow.document;\n    if (document.getElementById('zv-sel-css')) return;\n    const style = document.createElement('style');\n    style.id = 'zv-sel-css';\n    style.textContent =\n      '.textLayer,.textLayer span{user-select:text!important;-moz-user-select:text!important}.textLayer span{cursor:text!important}.textLayer ::selection{background:rgba(0,82,220,.82)!important;color:#fff!important;text-shadow:0 0 1px rgba(0,0,0,.45)!important}';\n    (document.head ?? document.documentElement).appendChild(style);\n  }\n\n`,
    '',
    'selection style method',
  );
  text = replaceOnce(
    text,
    `    const cursor = pdfWindow.document.createElement('span');\n    cursor.dataset.zvCursor = '1';\n    cursor.style.cssText = \`position:fixed;left:\${rect.left}px;top:\${rect.top}px;height:\${Math.max(12, rect.height)}px;width:3px;background:#0057d9;z-index:99997;pointer-events:none;box-shadow:0 0 0 1px #fff,0 0 0 2px #0057d9;border-radius:1px;\`;\n    pdfWindow.document.body?.appendChild(cursor);\n`,
    '',
    'custom Select endpoint caret',
  );
  text = replaceOnce(
    text,
    '      indicator.textContent = `SELECT · ${selected.length} chars · Enter actions · s Flash · Esc cancel${pending ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : \'\'}`;\n',
    '      indicator.textContent = `SELECT · ${selected.length} chars · y copy · Enter actions · s Flash · Esc cancel${pending ? `  ${this.state.countBuffer}${this.state.keyBuffer}` : \'\'}`;\n',
    'Select indicator direct copy hint',
  );
  text = replaceOnce(
    text,
    `    addBuiltIn('neo.highlight-yellow', 'highlightYellow');\n    addBuiltIn('neo.underline', 'underlineSelection');\n    addBuiltIn('neo.add-note', 'addNote');\n    addBuiltIn('neo.highlight-red', 'highlightRed');\n    addBuiltIn('neo.highlight-green', 'highlightGreen');\n    addBuiltIn('neo.highlight-blue', 'highlightBlue');\n    addBuiltIn('neo.highlight-purple', 'highlightPurple');\n    addBuiltIn('neo.copy', 'copySelection');\n    addBuiltIn('neo.search', 'searchSelection');\n`,
    `    addBuiltIn('neo.underline', 'underlineSelection');\n    addBuiltIn('neo.add-note', 'addNote');\n`,
    'compact Selection Actions builtins',
  );
  text = replaceOnce(
    text,
    `  private copySelection(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    if (selection && !selection.isCollapsed) this.copyText(annotationText(selection.toString()));\n    this.setMode('normal');\n    selection?.removeAllRanges();\n    pdfWindow.focus();\n  }\n`,
    `  private copySelection(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    if (selection && !selection.isCollapsed) {\n      let copiedNatively = false;\n      try {\n        copiedNatively = pdfWindow.document.execCommand?.('copy') === true;\n      } catch {\n        // Fall back to Neo clipboard handling if the host blocks programmatic native copy.\n      }\n      if (!copiedNatively) this.copyText(selectionClipboardText(selection.toString()));\n    }\n    this.setMode('normal');\n    selection?.removeAllRanges();\n    pdfWindow.focus();\n  }\n`,
    'native-first Select copy',
  );
  write(path, text);
}

write(
  'src/reader/selection-text.ts',
  `/** Plain-text fallback for PDF selections when Zotero's native copy command is unavailable. */\nexport function selectionClipboardText(value: string): string {\n  return value.normalize('NFC').replace(/\\s+/gu, ' ').trim();\n}\n`,
);

write(
  'tests/unit/selection-text.test.ts',
  `import { describe, expect, it } from 'vitest';\n\nimport { selectionClipboardText } from '../../src/reader/selection-text';\n\ndescribe('selectionClipboardText', () => {\n  it('turns PDF layout line breaks and other whitespace into ordinary spaces', () => {\n    expect(selectionClipboardText('first line\\r\\nsecond\\u2028line\\tend')).toBe(\n      'first line second line end',\n    );\n  });\n\n  it('composes canonical Unicode without compatibility-folding selected text', () => {\n    expect(selectionClipboardText('Cafe\\u0301  text')).toBe('Café text');\n  });\n});\n`,
);

{
  const path = 'docs/USER_GUIDE.md';
  let text = read(path);
  text = replaceOnce(
    text,
    `Once Select is active, \`h/l/w/b/j/k/0/$/(/)/{/}\` refine the range and \`o\` swaps the active end.\nPress \`s\` to use Flash for the other endpoint. The selection and active endpoint use high-contrast\nvisuals, and the persistent \`SELECT\` indicator shows the selected character count and action hints.\n`,
    `Once Select is active, \`h/l/w/b/j/k/0/$/(/)/{/}\` refine the range and \`o\` swaps the active end.\nPress \`s\` to use Flash for the other endpoint. Neo deliberately leaves the PDF selection appearance\nto Zotero, so keyboard Select and ordinary mouse selection look the same. The persistent \`SELECT\`\nindicator remains the mode cue and shows the selected character count plus direct-action hints.\n`,
    'Select appearance guide',
  );
  text = replaceOnce(
    text,
    `Selection Actions is a keyboard palette over the current range. It includes highlights, underline,\nadd note, copy, and search. If **Translate for Zotero** is installed, **Translate** appears automatically\nand uses that plugin's public translation API; its result stays in the palette and can be copied with\n\`y\`. Other plugins can add actions through \`Zotero.Neo.reader.registerSelectionAction(...)\`, while\ncustom scripts such as Actions & Tags can read \`Zotero.Neo.reader.getSelection()\`.\n`,
    `Selection Actions is a keyboard palette for lower-frequency or extensible operations rather than a\nduplicate of every Select shortcut. Built-ins currently keep **Underline** and **Add note** in the palette;\ncoloured highlights stay on \`zy/zr/zg/zb/zp\`, copy stays on \`y\`, and search stays on \`#\`. If\n**Translate for Zotero** is installed, **Translate** appears automatically and uses that plugin's public\ntranslation API; its result stays in the palette and can be copied with \`y\`. Other plugins can add\nactions through \`Zotero.Neo.reader.registerSelectionAction(...)\`, while custom scripts such as\nActions & Tags can read \`Zotero.Neo.reader.getSelection()\`.\n\nSelect \`y\` first asks Zotero's own PDF copy handler to write the clipboard, preserving Zotero's text\nextraction behavior across wrapped PDF lines. If that native path is unavailable, Neo falls back to plain\ntext and converts PDF layout line breaks/whitespace to ordinary spaces before copying.\n`,
    'Selection Actions guide',
  );
  write(path, text);
}

{
  const path = 'docs/DEVELOPMENT.md';
  let text = read(path);
  text = replaceOnce(
    text,
    `The v1 index includes only currently visible \`.textLayer span\` text from the active PDF view. It\n`,
    `Select intentionally does not inject a custom \`::selection\` rule or endpoint caret into PDF.js.\nZotero owns selection rendering for both mouse and keyboard-created ranges; Neo owns only range\nmanipulation, mode indication, Flash targeting, and actions. Select \`y\` prefers \`document.execCommand('copy')\`\ninside the trusted key event so Zotero's own PDF copy listener can serialize its semantic selection ranges.\nThe fallback clipboard path is used only when that host command is unavailable and collapses layout\nwhitespace to spaces. Keep direct high-frequency actions on bindings instead of duplicating every command\nin Selection Actions; the palette is primarily for low-frequency and externally registered operations.\n\nThe v1 index includes only currently visible \`.textLayer span\` text from the active PDF view. It\n`,
    'Select native appearance development note',
  );
  text = replaceOnce(
    text,
    `The session only resolves the \`flashText\` action and applies the selected\nsource pointer according to the current mode. Normal places a collapsed caret, Cursor moves its\ncaret and keeps Cursor mode, and Visual moves only the focus while preserving the existing anchor.\n\n`,
    `The session only resolves Flash as Select-start or Select-end targeting. Normal \`v\` either adopts an\nexisting native selection or uses Flash to create the initial range; Select \`s\` moves the far endpoint\nwhile preserving the anchor. There is no separate Cursor user mode.\n\n`,
    'remove stale Cursor architecture text',
  );
  text = replaceOnce(
    text,
    `Non-vertical Cursor/Visual motions clear that preferred X. This keeps\n`,
    `Non-vertical Select motions clear that preferred X. This keeps\n`,
    'Select vertical motion wording',
  );
  write(path, text);
}
