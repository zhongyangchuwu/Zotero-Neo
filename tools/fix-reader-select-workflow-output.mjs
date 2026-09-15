import fs from 'node:fs';

function patchFile(path, patches) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of patches) {
    const first = text.indexOf(from);
    if (first < 0) throw new Error(`missing post-migration anchor: ${label}`);
    if (text.indexOf(from, first + from.length) >= 0)
      throw new Error(`duplicate post-migration anchor: ${label}`);
    text = text.slice(0, first) + to + text.slice(first + from.length);
  }
  fs.writeFileSync(path, text);
}

patchFile('src/reader/controller.ts', [
  [
    '      actions: (context) => this.selectionActionDefinitions(context, this.activePdfWindow()),\n',
    '      actions: (context, pdfWindow) => this.selectionActionDefinitions(context, pdfWindow),\n',
    'selection palette owner view',
  ],
  [
    "      const selected = annotationText(this.activePdfWindow().getSelection()?.toString() ?? '');\n",
    "      const selected = annotationText(this.activePdfWindow()?.getSelection()?.toString() ?? '');\n",
    'Select indicator nullable view',
  ],
  [
    `    const pdfWindow = this.activePdfWindow();\n    const selection = pdfWindow.getSelection();\n    if (!selection || selection.isCollapsed) return null;\n`,
    `    const pdfWindow = this.activePdfWindow();\n    if (!pdfWindow) return null;\n    const selection = pdfWindow.getSelection();\n    if (!selection || selection.isCollapsed) return null;\n`,
    'selection snapshot nullable view',
  ],
]);

patchFile('tests/unit/input.test.ts', [
  [
    `  it('provides reader-only native history and follow-link defaults that remain remappable', () => {\n    expect(DEFAULT_BINDINGS['normal:ctrl+o']).toBe('historyBack');\n    expect(DEFAULT_BINDINGS['normal:ctrl+i']).toBe('historyForward');\n    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');\n    expect(DEFAULT_BINDINGS['normal:s']).toBe('flashText');\n    expect(DEFAULT_BINDINGS['visual:s']).toBe('flashText');\n    expect(DEFAULT_BINDINGS['cursor:s']).toBe('flashText');\n`,
    `  it('provides native history, Follow Link, and Select-first Flash defaults that remain remappable', () => {\n    expect(DEFAULT_BINDINGS['normal:ctrl+o']).toBe('historyBack');\n    expect(DEFAULT_BINDINGS['normal:ctrl+i']).toBe('historyForward');\n    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');\n    expect(DEFAULT_BINDINGS['normal:v']).toBe('enterVisual');\n    expect('normal:s' in DEFAULT_BINDINGS).toBe(false);\n    expect(DEFAULT_BINDINGS['visual:s']).toBe('flashText');\n    expect(DEFAULT_BINDINGS['visual:enter']).toBe('openSelectionActions');\n    expect(Object.keys(DEFAULT_BINDINGS).some((key) => key.startsWith('cursor:'))).toBe(false);\n`,
    'input default Select workflow assertions',
  ],
]);
