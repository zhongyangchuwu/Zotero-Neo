import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  const text = fs.readFileSync(path, 'utf8');
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate anchor: ${label}`);
  fs.writeFileSync(path, text.slice(0, first) + to + text.slice(first + from.length));
}

replaceOnce(
  'src/reader/controller.ts',
  `  private updateVisualCursor(pdfWindow: PdfWindow, autoPan: boolean): void {\n    this.removeVisualCursor(pdfWindow);\n    if (this.state.mode !== 'visual') return;\n    const selection = pdfWindow.getSelection();`,
  `  private updateVisualCursor(pdfWindow: PdfWindow, autoPan: boolean): void {\n    this.removeVisualCursor(pdfWindow);\n    if (this.state.mode !== 'visual') return;\n    const document = pdfWindow.document;\n    let style = document.querySelector<HTMLStyleElement>('style[data-zv-select-selection]');\n    if (!style) {\n      style = document.createElement('style');\n      style.dataset.zvSelectSelection = '1';\n      // Zotero/PDF.js makes ordinary desktop DOM selection transparent. Mirror the\n      // Reader's own native-selection blue only while Neo Select owns the range.\n      style.textContent =\n        ':root[data-zv-select-active] .textLayer ::selection { background-color: rgb(66, 133, 244); }';\n      document.documentElement.appendChild(style);\n    }\n    document.documentElement.setAttribute('data-zv-select-active', '');\n    const selection = pdfWindow.getSelection();`,
  'Select appearance activation',
);

replaceOnce(
  'src/reader/controller.ts',
  `  private removeVisualCursor(pdfWindow: PdfWindow): void {\n    const cursors = Array.from(\n      pdfWindow.document.querySelectorAll('[data-zv-cursor]'),\n    ) as HTMLElement[];\n    for (const cursor of cursors) cursor.remove();\n  }`,
  `  private removeVisualCursor(pdfWindow: PdfWindow): void {\n    pdfWindow.document.documentElement.removeAttribute('data-zv-select-active');\n    const cursors = Array.from(\n      pdfWindow.document.querySelectorAll('[data-zv-cursor]'),\n    ) as HTMLElement[];\n    for (const cursor of cursors) cursor.remove();\n  }`,
  'Select appearance cleanup',
);

replaceOnce(
  'src/reader/controller.ts',
  `  private copySelection(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    if (selection && !selection.isCollapsed) {\n      let copiedNatively = false;\n      try {\n        copiedNatively = pdfWindow.document.execCommand?.('copy') === true;\n      } catch {\n        // Fall back to Neo clipboard handling if the host blocks programmatic native copy.\n      }\n      if (!copiedNatively) this.copyText(selectionClipboardText(selection.toString()));\n    }\n    this.setMode('normal');\n    selection?.removeAllRanges();\n    pdfWindow.focus();\n  }`,
  `  private copySelection(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    if (selection && !selection.isCollapsed)\n      this.copyText(selectionClipboardText(selection.toString()));\n    this.setMode('normal');\n    selection?.removeAllRanges();\n    pdfWindow.focus();\n  }`,
  'Select copy host boundary',
);

replaceOnce(
  'src/reader/selection-text.ts',
  `/** Plain-text fallback for PDF selections when Zotero's native copy command is unavailable. */`,
  `/** Clipboard text for Neo-owned PDF DOM selections; PDF layout whitespace is not semantic. */`,
  'selection text comment',
);

replaceOnce(
  'docs/USER_GUIDE.md',
  `Press \`s\` to use Flash for the other endpoint. Neo deliberately leaves the PDF selection appearance\nto Zotero, so keyboard Select and ordinary mouse selection look the same. The persistent \`SELECT\`\nindicator remains the mode cue and shows the selected character count plus direct-action hints.`,
  `Press \`s\` to use Flash for the other endpoint. Desktop Zotero keeps ordinary DOM selection\ntransparent because its mouse-selection renderer is driven by private semantic ranges. While Select\nowns a keyboard-created DOM range, Neo enables the same blue selection colour used by Zotero/PDF.js\nfor native text selection, without adding a second endpoint caret. The persistent \`SELECT\` indicator\nremains the mode cue and shows the selected character count plus direct-action hints.`,
  'user guide Select appearance',
);

replaceOnce(
  'docs/USER_GUIDE.md',
  `Select \`y\` first asks Zotero's own PDF copy handler to write the clipboard, preserving Zotero's text\nextraction behavior across wrapped PDF lines. If that native path is unavailable, Neo falls back to plain\ntext and converts PDF layout line breaks/whitespace to ordinary spaces before copying.`,
  `Select \`y\` copies the Neo-owned DOM range directly. Desktop Zotero's native copy handler reads a\nseparate private semantic-range model, so invoking it for a keyboard-only DOM range would fail. Neo\ntherefore normalizes the selected text itself, converting PDF layout line breaks and other whitespace to\nordinary spaces before writing the clipboard.`,
  'user guide Select copy',
);

replaceOnce(
  'docs/DEVELOPMENT.md',
  `Select intentionally does not inject a custom \`::selection\` rule or endpoint caret into PDF.js.\nZotero owns selection rendering for both mouse and keyboard-created ranges; Neo owns only range\nmanipulation, mode indication, Flash targeting, and actions. Select \`y\` prefers \`document.execCommand('copy')\`\ninside the trusted key event so Zotero's own PDF copy listener can serialize its semantic selection ranges.\nThe fallback clipboard path is used only when that host command is unavailable and collapses layout\nwhitespace to spaces. Keep direct high-frequency actions on bindings instead of duplicating every command\nin Selection Actions; the palette is primarily for low-frequency and externally registered operations.`,
  `Desktop Zotero has two distinct text-selection models. Its PDF stylesheet makes ordinary DOM\n\`::selection\` transparent, while mouse selection is rendered from the private PDFView\n\`_selectionRanges\` model. Neo currently owns a DOM range for keyboard Select and must not pretend that\nrange has been synchronized into Zotero's semantic model. While Select is active, a narrowly scoped\n\`::selection\` rule mirrors Zotero/PDF.js's native-selection blue; it is inactive outside Select and does\nnot add an endpoint caret.\n\nFor the same reason, Select \`y\` must not call \`document.execCommand('copy')\`: Zotero's capture-phase\ncopy handler reads \`PDFView._selectionRanges\`, and a Neo-only DOM range leaves that array empty. Neo\ncopies its DOM Selection directly and collapses PDF layout whitespace to ordinary spaces. A future host\nbridge may synchronize semantic ranges, but it must be implemented and verified explicitly rather than\nassuming DOM Selection is authoritative. Keep direct high-frequency actions on bindings instead of\nduplicating every command in Selection Actions; the palette is primarily for low-frequency and externally\nregistered operations.`,
  'development Select host boundary',
);

console.log('Select host-boundary fix applied');
