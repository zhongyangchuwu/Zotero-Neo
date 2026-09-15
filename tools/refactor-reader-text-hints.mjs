import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing refactor anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Ambiguous refactor anchor: ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function replaceRegexOnce(source, pattern, after, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one ${label}, found ${matches.length}`);
  return source.replace(pattern, after);
}

const controllerPath = 'src/reader/controller.ts';
let controller = fs.readFileSync(controllerPath, 'utf8');

controller = replaceOnce(
  controller,
  "import { ReaderMarksExplorer, type MarksExplorerState } from './marks-explorer';\n",
  "import { ReaderMarksExplorer, type MarksExplorerState } from './marks-explorer';\nimport { ReaderTextHints } from './text-hints';\n",
  'ReaderTextHints import',
);
controller = replaceOnce(
  controller,
  '  readonly #outline: ReaderOutline;\n  readonly #themeManagers = new Map<Window, ThemeManager>();',
  '  readonly #outline: ReaderOutline;\n  readonly #textHints: ReaderTextHints;\n  readonly #themeManagers = new Map<Window, ThemeManager>();',
  'text hints field',
);
controller = replaceOnce(
  controller,
  "      cursorPreferredX: null,\n      hintBadges: [],\n      hintBuffer: '',\n      hintStage: null,\n      hintTargetMode: null,\n      hintStarts: [],\n      hintRepositionFrame: null,\n      linkHintBadges: [],",
  "      cursorPreferredX: null,\n      linkHintBadges: [],",
  'legacy hint state initialization',
);
controller = replaceOnce(
  controller,
  '    this.#marks = new ReaderMarks({\n',
  "    this.#textHints = new ReaderTextHints({\n      activePdfWindow: () => this.state.activePdfWindow,\n      clearLinkHints: () => this.clearLinkHints(),\n      setMode: (mode) => this.setMode(mode),\n      setVisualAnchor: (pointer) => {\n        this.state.visualAnchor = pointer;\n      },\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      updateVisualCursor: (pdfWindow, autoPan) => this.updateVisualCursor(pdfWindow, autoPan),\n    });\n    this.#marks = new ReaderMarks({\n",
  'text hints construction',
);
controller = replaceOnce(
  controller,
  '    this.clearHints();\n    this.clearLinkHints();',
  '    this.#textHints.clear();\n    this.clearLinkHints();',
  'dispose text hints',
);
controller = replaceOnce(
  controller,
  '        if (this.state.hintBadges.length) this.repositionHints(pdfWindow);',
  '        if (this.#textHints.active) this.#textHints.reposition(pdfWindow);',
  'scroll text hint reposition',
);
controller = replaceOnce(
  controller,
  '        this.repositionHints(pdfWindow);',
  '        this.#textHints.reposition(pdfWindow);',
  'resize text hint reposition',
);
controller = replaceOnce(
  controller,
  "    if (this.state.hintBadges.length) {\n      this.handleHintKey(event, pdfWindow);\n      return;\n    }",
  "    if (this.#textHints.active) {\n      this.#textHints.handleKey(event, pdfWindow);\n      return;\n    }",
  'text hint input routing',
);
controller = replaceOnce(
  controller,
  '      this.state.outline.open ||\n      this.state.hintBadges.length ||\n      this.state.linkHintBadges.length',
  '      this.state.outline.open ||\n      this.#textHints.active ||\n      this.state.linkHintBadges.length',
  'reader consumption routing',
);
controller = replaceOnce(
  controller,
  "    if (mode !== 'visual' && mode !== 'cursor') this.clearHints();",
  "    if (mode !== 'visual' && mode !== 'cursor') this.#textHints.clear();",
  'mode cleanup',
);
controller = replaceOnce(
  controller,
  "    this.showHints(pdfWindow, 'visual');",
  "    this.#textHints.show(pdfWindow, 'visual');",
  'Visual hint entry',
);
controller = replaceOnce(
  controller,
  "    this.showHints(pdfWindow, 'cursor');",
  "    this.#textHints.show(pdfWindow, 'cursor');",
  'Cursor hint entry',
);
controller = replaceOnce(
  controller,
  '  private showLinkHints(pdfWindow: PdfWindow): void {\n    this.clearHints();',
  '  private showLinkHints(pdfWindow: PdfWindow): void {\n    this.#textHints.clear();',
  'Follow Link text hint cleanup',
);
controller = replaceRegexOnce(
  controller,
  /\n  private showHints\(pdfWindow: PdfWindow, targetMode: ReaderMode\): void \{[\s\S]*?\n  private showLinkHints\(pdfWindow: PdfWindow\): void \{/,
  '\n  private showLinkHints(pdfWindow: PdfWindow): void {',
  'legacy text hint methods',
);
controller = replaceRegexOnce(
  controller,
  /\n  private textNodes\(pdfWindow: PdfWindow\): Text\[\] \{[\s\S]*?\n  private swapVisualEnds\(pdfWindow: PdfWindow\): void \{/,
  '\n  private swapVisualEnds(pdfWindow: PdfWindow): void {',
  'legacy textNodes helper',
);
fs.writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = fs.readFileSync(typesPath, 'utf8');
types = replaceOnce(
  types,
  "  cursorPreferredX: number | null;\n  hintBadges: HintBadge[];\n  hintBuffer: string;\n  hintStage: 'coarse' | 'fine' | null;\n  hintTargetMode: ReaderMode | null;\n  hintStarts: Pointer[];\n  hintRepositionFrame: number | null;\n  linkHintBadges: LinkHintBadge[];",
  '  cursorPreferredX: number | null;\n  linkHintBadges: LinkHintBadge[];',
  'legacy hint state type',
);
types = replaceRegexOnce(
  types,
  /\nexport interface HintBadge \{[\s\S]*?\n\}\n\nexport interface LinkHintBadge/,
  '\nexport interface LinkHintBadge',
  'HintBadge interface',
);
fs.writeFileSync(typesPath, types);

const testPath = 'tests/unit/reader-text-navigation.test.ts';
let test = fs.readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  "import { ReaderSession } from '../../src/reader/controller';\n",
  "import { ReaderSession } from '../../src/reader/controller';\nimport { DEFAULT_BINDINGS } from '../../src/input/bindings';\n",
  'test bindings import',
);
test = replaceOnce(
  test,
  '    bindings: () => ({}),',
  '    bindings: () => DEFAULT_BINDINGS,',
  'test resolved bindings',
);
test = replaceRegexOnce(
  test,
  /\ntype TextHintSession = \{[\s\S]*?\n\}\n\nfunction keyEvent/,
  '\nfunction keyEvent',
  'private text hint test adapter',
);
test = replaceOnce(
  test,
  "      key,\n      preventDefault,\n      stopImmediatePropagation,",
  "      key,\n      ctrlKey: false,\n      metaKey: false,\n      altKey: false,\n      shiftKey: false,\n      target: null,\n      preventDefault,\n      stopImmediatePropagation,",
  'test keyboard modifiers',
);
test = replaceOnce(
  test,
  "    textHints(session).showHints(pdfWindow, 'cursor');\n\n    expect(session.state.hintBadges.map((badge) => badge.label)).toEqual(['A', 'S']);\n    expect(session.state.hintBadges.map((badge) => badge.textNode.data)).toEqual(['Alpha', 'Beta']);\n    expect(session.state.hintTargetMode).toBe('cursor');",
  "    session.focusAndHandle(keyEvent('c').event);\n\n    expect(appended.map((element) => element.textContent)).toEqual(['A', 'S']);\n    expect(session.state.mode).toBe('cursor');",
  'label characterization',
);
test = replaceOnce(
  test,
  "    const { session, pdfWindow, selectionState, textNodes } = createTextSession(['Alpha', 'Beta']);\n    textHints(session).showHints(pdfWindow, 'cursor');\n    const event = keyEvent('a');\n\n    textHints(session).handleHintKey(event.event, pdfWindow);",
  "    const { session, selectionState, textNodes, appended } = createTextSession(['Alpha', 'Beta']);\n    session.focusAndHandle(keyEvent('c').event);\n    const event = keyEvent('a');\n\n    session.focusAndHandle(event.event);",
  'activation characterization setup',
);
test = replaceOnce(
  test,
  "    expect(session.state.hintBadges).toHaveLength(0);\n    expect(selectionState.focusNode).toBe(textNodes[0]);",
  "    expect(appended.filter((element) => element.dataset.zvCursor !== '1')).toHaveLength(0);\n    expect(selectionState.focusNode).toBe(textNodes[0]);",
  'activation characterization assertion',
);
test = replaceOnce(
  test,
  "    const { session, pdfWindow } = createTextSession(['Alpha']);\n    textHints(session).showHints(pdfWindow, 'visual');\n    const event = keyEvent('Escape');\n\n    textHints(session).handleHintKey(event.event, pdfWindow);\n\n    expect(session.state.mode).toBe('normal');\n    expect(session.state.hintBadges).toHaveLength(0);",
  "    const { session, appended } = createTextSession(['Alpha']);\n    session.focusAndHandle(keyEvent('v').event);\n    const event = keyEvent('Escape');\n\n    session.focusAndHandle(event.event);\n\n    expect(session.state.mode).toBe('normal');\n    expect(appended).toHaveLength(0);",
  'Escape characterization',
);
test = replaceOnce(
  test,
  "    const { session, pdfWindow } = createTextSession(['   ', '']);\n    session.state.mode = 'cursor';\n\n    textHints(session).showHints(pdfWindow, 'cursor');\n\n    expect(session.state.mode).toBe('normal');\n    expect(session.state.hintBadges).toHaveLength(0);",
  "    const { session, appended } = createTextSession(['   ', '']);\n\n    session.focusAndHandle(keyEvent('c').event);\n\n    expect(session.state.mode).toBe('normal');\n    expect(appended).toHaveLength(0);",
  'empty text characterization',
);
fs.writeFileSync(testPath, test);
