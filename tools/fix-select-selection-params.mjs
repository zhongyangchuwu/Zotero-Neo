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

{
  const path = 'src/reader/controller.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `    const selection = pdfWindow.getSelection();\n    if (!selection) return;\n    this.state.visualPreferredX = null;\n    if (intent === 'visual-start') {`,
    `    const selection = pdfWindow.getSelection();\n    if (!selection) return;\n    // Flash replaces the native range, so any cached Zotero popup geometry now targets old text.\n    this.state.selectionParams = null;\n    this.state.visualPreferredX = null;\n    if (intent === 'visual-start') {`,
    'Flash range invalidation',
  );
  text = replaceOnce(
    text,
    `  ): void {\n    this.state.visualPreferredX = null;\n    this.ensureVisualAnchor(pdfWindow);\n    pdfWindow.getSelection()?.modify('extend', direction, granularity);`,
    `  ): void {\n    this.state.visualPreferredX = null;\n    this.ensureVisualAnchor(pdfWindow);\n    this.state.selectionParams = null;\n    pdfWindow.getSelection()?.modify('extend', direction, granularity);`,
    'selection modify invalidation',
  );
  text = replaceOnce(
    text,
    `    const target = verticalTextPosition(pdfWindow, pointer, direction, this.state.visualPreferredX);\n    if (!target) return;\n    this.state.visualPreferredX = target.preferredX;\n    selection.setBaseAndExtent(`,
    `    const target = verticalTextPosition(pdfWindow, pointer, direction, this.state.visualPreferredX);\n    if (!target) return;\n    this.state.selectionParams = null;\n    this.state.visualPreferredX = target.preferredX;\n    selection.setBaseAndExtent(`,
    'vertical selection invalidation',
  );
  text = replaceOnce(
    text,
    `  private extendLineBoundary(pdfWindow: PdfWindow, end: boolean): void {\n    this.state.visualPreferredX = null;\n    this.ensureVisualAnchor(pdfWindow);\n    pdfWindow.getSelection()?.modify('extend', end ? 'forward' : 'backward', 'lineboundary');`,
    `  private extendLineBoundary(pdfWindow: PdfWindow, end: boolean): void {\n    this.state.visualPreferredX = null;\n    this.ensureVisualAnchor(pdfWindow);\n    this.state.selectionParams = null;\n    pdfWindow.getSelection()?.modify('extend', end ? 'forward' : 'backward', 'lineboundary');`,
    'line boundary invalidation',
  );
  write(path, text);
}

{
  const path = 'tests/unit/reader-controller.test.ts';
  let text = read(path);
  const anchor = `describe('native reader history', () => {`;
  const test = `describe('Select range freshness', () => {\n  it('drops cached native popup geometry before a local motion changes the selection', () => {\n    const created = createHistorySession();\n    const node = {\n      nodeType: 3,\n      data: 'abcdef',\n      length: 6,\n      isConnected: true,\n    } as unknown as Text;\n    const modify = vi.fn();\n    Reflect.set(created.pdfWindow, 'getSelection', () => ({\n      anchorNode: node,\n      anchorOffset: 1,\n      focusNode: node,\n      focusOffset: 3,\n      isCollapsed: false,\n      modify,\n    }));\n    created.session.state.mode = 'visual';\n    created.session.state.visualAnchor = { textNode: node, offset: 1 };\n    created.session.state.selectionParams = {\n      annotation: { text: 'old selection' },\n      onAddAnnotation: {},\n    };\n    Reflect.set(created.session, 'updateVisualCursor', vi.fn());\n    const selectable = created.session as unknown as {\n      modifySelection(\n        pdfWindow: PdfWindow,\n        direction: 'forward' | 'backward',\n        granularity: 'character' | 'word' | 'sentence' | 'paragraph',\n      ): void;\n    };\n\n    selectable.modifySelection(created.pdfWindow, 'forward', 'character');\n\n    expect(modify).toHaveBeenCalledWith('extend', 'forward', 'character');\n    expect(created.session.state.selectionParams).toBeNull();\n    created.session.dispose();\n  });\n});\n\n`;
  text = replaceOnce(text, anchor, `${test}${anchor}`, 'Select range freshness test');
  write(path, text);
}
