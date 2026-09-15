import fs from 'node:fs';

const path = 'src/reader/controller.ts';
let text = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing post-migration anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0)
    throw new Error(`duplicate post-migration anchor: ${label}`);
  text = text.slice(0, first) + to + text.slice(first + from.length);
}

replaceOnce(
  '      actions: (context) => this.selectionActionDefinitions(context, this.activePdfWindow()),\n',
  '      actions: (context, pdfWindow) => this.selectionActionDefinitions(context, pdfWindow),\n',
  'selection palette owner view',
);
replaceOnce(
  "      const selected = annotationText(this.activePdfWindow().getSelection()?.toString() ?? '');\n",
  "      const selected = annotationText(this.activePdfWindow()?.getSelection()?.toString() ?? '');\n",
  'Select indicator nullable view',
);
replaceOnce(
  `    const pdfWindow = this.activePdfWindow();\n    const selection = pdfWindow.getSelection();\n    if (!selection || selection.isCollapsed) return null;\n`,
  `    const pdfWindow = this.activePdfWindow();\n    if (!pdfWindow) return null;\n    const selection = pdfWindow.getSelection();\n    if (!selection || selection.isCollapsed) return null;\n`,
  'selection snapshot nullable view',
);

fs.writeFileSync(path, text);
