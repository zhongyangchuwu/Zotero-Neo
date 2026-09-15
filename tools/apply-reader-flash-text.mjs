import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return source.replace(before, after);
}

const actionsPath = 'src/input/actions.ts';
let actions = readFileSync(actionsPath, 'utf8');
actions = replaceOnce(
  actions,
  "  followLink: {\n    en: 'Follow visible PDF link',\n    'zh-CN': '跟随可见 PDF 链接',\n  },\n",
  "  followLink: {\n    en: 'Follow visible PDF link',\n    'zh-CN': '跟随可见 PDF 链接',\n  },\n  flashText: {\n    en: 'Flash to visible PDF text',\n    'zh-CN': 'Flash 跳转到可见 PDF 文本',\n  },\n",
  'Flash action label',
);
writeFileSync(actionsPath, actions);

const bindingsPath = 'src/input/bindings.ts';
let bindings = readFileSync(bindingsPath, 'utf8');
bindings = replaceOnce(
  bindings,
  "  'normal:f': 'followLink',\n  'normal:/': 'openSearch',",
  "  'normal:f': 'followLink',\n  'normal:s': 'flashText',\n  'normal:/': 'openSearch',",
  'Normal Flash binding',
);
bindings = replaceOnce(
  bindings,
  "  'visual:j': 'extendDown',",
  "  'visual:s': 'flashText',\n  'visual:j': 'extendDown',",
  'Visual Flash binding',
);
bindings = replaceOnce(
  bindings,
  "  'cursor:j': 'cursorDown',",
  "  'cursor:s': 'flashText',\n  'cursor:j': 'cursorDown',",
  'Cursor Flash binding',
);
writeFileSync(bindingsPath, bindings);

const capabilitiesPath = 'src/reader/action-capabilities.ts';
let capabilities = readFileSync(capabilitiesPath, 'utf8');
capabilities = replaceOnce(
  capabilities,
  "  'followLink',\n  'firstPage',",
  "  'followLink',\n  'flashText',\n  'firstPage',",
  'Normal Flash capability',
);
capabilities = replaceOnce(
  capabilities,
  "export const READER_LOCAL_VISUAL_ACTIONS = Object.freeze([\n  'extendDown',",
  "export const READER_LOCAL_VISUAL_ACTIONS = Object.freeze([\n  'flashText',\n  'extendDown',",
  'Visual Flash capability',
);
capabilities = replaceOnce(
  capabilities,
  "export const READER_LOCAL_CURSOR_ACTIONS = Object.freeze([\n  'cursorDown',",
  "export const READER_LOCAL_CURSOR_ACTIONS = Object.freeze([\n  'flashText',\n  'cursorDown',",
  'Cursor Flash capability',
);
writeFileSync(capabilitiesPath, capabilities);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = replaceOnce(types, '  sidebarOutlineIndex: number;\n', '', 'dead sidebar outline state');
writeFileSync(typesPath, types);

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');
controller = replaceOnce(
  controller,
  "import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';\nimport { ReaderSmoothScroller, smoothScrollSpec } from './smooth-scroll';",
  "import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';\nimport { ReaderFlash, type FlashMode } from './flash';\nimport { ReaderSmoothScroller, smoothScrollSpec } from './smooth-scroll';",
  'Flash import',
);
controller = replaceOnce(
  controller,
  "  type ItemRuntime,\n  type PdfWindow,\n  type ReaderEventRuntime,",
  "  type ItemRuntime,\n  type PdfWindow,\n  type Pointer,\n  type ReaderEventRuntime,",
  'Flash pointer import',
);
controller = replaceOnce(
  controller,
  "  readonly #linkHints: ReaderLinkHints;\n  readonly #commentEditor: ReaderCommentEditor;\n  readonly #smoothScroller: ReaderSmoothScroller;",
  "  readonly #linkHints: ReaderLinkHints;\n  readonly #commentEditor: ReaderCommentEditor;\n  readonly #flash: ReaderFlash;\n  readonly #smoothScroller: ReaderSmoothScroller;",
  'Flash field',
);
controller = replaceOnce(
  controller,
  "      marks: {},\n      sidebarOutlineIndex: -1,\n      filterColor: null,",
  "      marks: {},\n      filterColor: null,",
  'dead sidebar state initialization',
);
controller = replaceOnce(
  controller,
  "    this.#smoothScroller = new ReaderSmoothScroller({\n",
  "    this.#flash = new ReaderFlash({\n      activate: (mode, pdfWindow, pointer) =>\n        this.activateFlashTarget(mode, pdfWindow, pointer),\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      debug: (message) => dependencies.controller.dependencies.logger.debug(message),\n    });\n    this.#smoothScroller = new ReaderSmoothScroller({\n",
  'Flash construction',
);
controller = replaceOnce(
  controller,
  "  dispose(): void {\n    this.#commentEditor.dispose();\n    this.#smoothScroller.dispose();",
  "  dispose(): void {\n    this.#commentEditor.dispose();\n    this.#flash.dispose();\n    this.#smoothScroller.dispose();",
  'Flash disposal',
);
controller = replaceOnce(
  controller,
  "      const blur = (() => this.#smoothScroller.stop(true)) as EventListener;",
  "      const blur = (() => {\n        this.#smoothScroller.stop(true);\n        this.#flash.releaseView(pdfWindow);\n      }) as EventListener;",
  'Flash blur cleanup',
);
controller = replaceOnce(
  controller,
  "      const scroll = (() => {\n        this.#linkHints.onViewportChange(pdfWindow);",
  "      const scroll = (() => {\n        this.#flash.onViewportChange(pdfWindow);\n        this.#linkHints.onViewportChange(pdfWindow);",
  'Flash scroll cleanup',
);
controller = replaceOnce(
  controller,
  "      const resize = (() => this.#linkHints.onViewportChange(pdfWindow)) as EventListener;",
  "      const resize = (() => {\n        this.#flash.onViewportChange(pdfWindow);\n        this.#linkHints.onViewportChange(pdfWindow);\n      }) as EventListener;",
  'Flash resize cleanup',
);
controller = replaceOnce(
  controller,
  "  private releaseViewTheme(pdfWindow: PdfWindow): void {\n    this.#smoothScroller.releaseView(pdfWindow);",
  "  private releaseViewTheme(pdfWindow: PdfWindow): void {\n    this.#flash.releaseView(pdfWindow);\n    this.#smoothScroller.releaseView(pdfWindow);",
  'Flash view release',
);
controller = replaceOnce(
  controller,
  "  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {\n    this.activatePdfWindow(pdfWindow);\n    if (this.handleSidebarToggleKey(event, pdfWindow)) return;",
  "  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {\n    this.activatePdfWindow(pdfWindow);\n    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;\n    if (this.handleSidebarToggleKey(event, pdfWindow)) return;",
  'Flash key routing',
);
controller = replaceOnce(
  controller,
  "  private readerConsumesKey(key: string): boolean {\n    if (!key) return false;\n    if (this.state.mode === 'insert')",
  "  private readerConsumesKey(key: string): boolean {\n    if (!key) return false;\n    if (this.#flash.isOpen) return true;\n    if (this.state.mode === 'insert')",
  'Flash private key forwarding',
);
controller = replaceOnce(
  controller,
  "      case 'followLink':\n        this.#linkHints.open(pdfWindow);\n        break;",
  "      case 'followLink':\n        this.#linkHints.open(pdfWindow);\n        break;\n      case 'flashText':\n        if (\n          this.state.mode === 'normal' ||\n          this.state.mode === 'cursor' ||\n          this.state.mode === 'visual'\n        )\n          this.#flash.open(pdfWindow, this.state.mode);\n        break;",
  'Flash action execution',
);
controller = replaceOnce(
  controller,
  "  private setMode(mode: ReaderMode): void {\n    if (this.#linkHints.hasHints) this.#linkHints.cancelHints();",
  "  private setMode(mode: ReaderMode): void {\n    if (this.#flash.isOpen) this.#flash.cancel();\n    if (this.#linkHints.hasHints) this.#linkHints.cancelHints();",
  'Flash mode cleanup',
);
controller = replaceOnce(
  controller,
  "  private enterVisual(pdfWindow: PdfWindow): void {",
  "  private activateFlashTarget(mode: FlashMode, pdfWindow: PdfWindow, pointer: Pointer): void {\n    if (this.state.mode !== mode || !pointer.textNode.isConnected) return;\n    const selection = pdfWindow.getSelection();\n    if (!selection) return;\n    if (mode === 'visual') {\n      this.ensureVisualAnchor(pdfWindow);\n      const anchor = this.state.visualAnchor;\n      if (!anchor?.textNode.isConnected) return;\n      this.state.visualPreferredX = null;\n      selection.setBaseAndExtent(\n        anchor.textNode,\n        anchor.offset,\n        pointer.textNode,\n        Math.min(pointer.offset, pointer.textNode.length),\n      );\n      this.updateVisualCursor(pdfWindow, true);\n      return;\n    }\n    const range = pdfWindow.document.createRange();\n    range.setStart(pointer.textNode, Math.min(pointer.offset, pointer.textNode.length));\n    range.collapse(true);\n    selection.removeAllRanges();\n    selection.addRange(range);\n    this.state.cursorPreferredX = null;\n    this.state.visualPreferredX = null;\n    if (mode === 'cursor') {\n      this.state.visualAnchor = pointer;\n      this.updateVisualCursor(pdfWindow, true);\n    }\n  }\n\n  private enterVisual(pdfWindow: PdfWindow): void {",
  'Flash target semantics',
);
if (controller.includes('sidebarOutlineIndex'))
  throw new Error('controller still contains dead sidebarOutlineIndex state');
writeFileSync(controllerPath, controller);

const capabilityTestPath = 'tests/unit/action-capabilities.test.ts';
let capabilityTest = readFileSync(capabilityTestPath, 'utf8');
capabilityTest = replaceOnce(
  capabilityTest,
  "    expect(isReaderActionForMode('visual', 'highlightYellow')).toBe(true);\n    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);\n    expect(isReaderActionForMode('cursor', 'cursorDown')).toBe(true);",
  "    expect(isReaderActionForMode('visual', 'highlightYellow')).toBe(true);\n    expect(isReaderActionForMode('visual', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);\n    expect(isReaderActionForMode('cursor', 'cursorDown')).toBe(true);\n    expect(isReaderActionForMode('cursor', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('normal', 'flashText')).toBe(true);",
  'Flash capability assertions',
);
writeFileSync(capabilityTestPath, capabilityTest);

const inputTestPath = 'tests/unit/input.test.ts';
let inputTest = readFileSync(inputTestPath, 'utf8');
inputTest = replaceOnce(
  inputTest,
  "    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');\n",
  "    expect(DEFAULT_BINDINGS['normal:f']).toBe('followLink');\n    expect(DEFAULT_BINDINGS['normal:s']).toBe('flashText');\n    expect(DEFAULT_BINDINGS['visual:s']).toBe('flashText');\n    expect(DEFAULT_BINDINGS['cursor:s']).toBe('flashText');\n",
  'Flash default binding assertions',
);
writeFileSync(inputTestPath, inputTest);

const developmentPath = 'docs/DEVELOPMENT.md';
let development = readFileSync(developmentPath, 'utf8');
development = replaceOnce(
  development,
  '## PDF text vertical motion\n',
  "## Reader Flash visible-text targeting\n\n`ReaderFlash` owns one active visible-text invocation: the PDF view, literal query, normalized text\nindex, query/label stage, stable hint labels, prompt DOM, and cleanup. `ReaderSessionState` must not\nmirror any Flash state. The session only resolves the `flashText` action and applies the selected\nsource pointer according to the current mode. Normal places a collapsed caret, Cursor moves its\ncaret and keeps Cursor mode, and Visual moves only the focus while preserving the existing anchor.\n\nThe v1 index includes only currently visible `.textLayer span` text from the active PDF view. It\nnormalizes NFKC and whitespace, supports literal cross-node matching with ASCII smartcase, ranks\nlabels by distance from the current caret/focus (or viewport center), and never jumps merely because\na query has one match. Enter freezes the current matches and their labels; an explicit label selects\nthe target. Scroll, resize, split-view replacement, blur, mode change, and disposal cancel the\ninvocation instead of live-reindexing stale PDF.js text. Fuzzy search, regex, whole-document indexing,\nand CJK/IME composition are intentionally outside v1.\n\n## PDF text vertical motion\n",
  'Flash development docs',
);
writeFileSync(developmentPath, development);

const guidePath = 'docs/USER_GUIDE.md';
let guide = readFileSync(guidePath, 'utf8');
guide = replaceOnce(
  guide,
  '#### Follow PDF links\n',
  "#### Flash visible text\n\n| Key | Action |\n| --- | ------ |\n| `s` | Target visible PDF text in the active reader view |\n\nPress `s`, type an ASCII/Latin literal query, then press `Enter` to freeze the current visible\nmatches and show stable hint labels. Type a displayed label to choose the target. `Backspace` edits\nthe query; after labels appear, an empty label buffer plus `Backspace` returns to query editing.\n`Escape` cancels. Matching uses NFKC normalization, collapsed whitespace, and smartcase: lowercase\nqueries ignore case while any ASCII uppercase letter makes the query case-sensitive. There is no\nfuzzy search or regex interpretation in this first version.\n\nIn Normal mode the target becomes a collapsed caret, so `s … Enter …`, then `v`, can start a\nselection from that location. In Cursor mode Flash moves the caret and remains in Cursor mode. In\nVisual mode it moves only the selection focus and preserves the Visual anchor, so a practical range\nworkflow is `s` to place the start, `v`, then `s` to place the other end; `o` still swaps the ends.\nOnly text currently visible in the active primary or split PDF view is indexed. Scrolling, resizing,\nor replacing that view cancels Flash rather than reusing stale PDF.js text nodes.\n\n#### Follow PDF links\n",
  'Flash user guide',
);
writeFileSync(guidePath, guide);
