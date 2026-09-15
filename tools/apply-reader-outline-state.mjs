import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Non-unique anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function removeBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start anchor: ${label}`);
  if (source.indexOf(start, startIndex + start.length) >= 0)
    throw new Error(`Non-unique start anchor: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end anchor: ${label}`);
  return source.slice(0, startIndex) + source.slice(endIndex);
}

const outlinePath = 'src/reader/outline.ts';
let outline = readFileSync(outlinePath, 'utf8');
outline = replaceOnce(
  outline,
  "  OutlineNode,\n  OutlineSourceNode,\n  OutlineState,\n  PdfDocumentRuntime,",
  "  OutlineNode,\n  OutlineSourceNode,\n  PdfDocumentRuntime,",
  'outline state import',
);
outline = replaceOnce(
  outline,
  "export type { OutlineState } from './types';\nexport interface OutlineHost {",
  `interface OutlineState {\n  open: boolean;\n  loading: boolean;\n  loadGeneration: number;\n  tree: OutlineNode[] | null;\n  visible: OutlineNode[];\n  selected: number;\n  overlay: HTMLElement | null;\n  list: HTMLElement | null;\n  status: HTMLElement | null;\n  themeCleanup: (() => void) | null;\n  hintBuffer: string;\n  hintTimer: ReaderTimer | null;\n  commandBuffer: string;\n  commandTimer: ReaderTimer | null;\n}\n\nexport interface OutlineHost {`,
  'local outline state',
);
outline = replaceOnce(
  outline,
  "export class ReaderOutline {\n  readonly #host: OutlineHost;\n\n  constructor(host: OutlineHost) {\n    this.#host = host;\n  }",
  `export class ReaderOutline {\n  readonly #host: OutlineHost;\n  readonly #state: OutlineState = {\n    open: false,\n    loading: false,\n    loadGeneration: 0,\n    tree: null,\n    visible: [],\n    selected: 0,\n    overlay: null,\n    list: null,\n    status: null,\n    themeCleanup: null,\n    hintBuffer: '',\n    hintTimer: null,\n    commandBuffer: '',\n    commandTimer: null,\n  };\n\n  constructor(host: OutlineHost) {\n    this.#host = host;\n  }\n\n  get isOpen(): boolean {\n    return this.#state.open;\n  }\n\n  ownsView(pdfWindow: PdfWindow): boolean {\n    return this.#state.overlay?.ownerDocument.defaultView === pdfWindow;\n  }`,
  'outline owned state',
);
outline = replaceOnce(
  outline,
  "  async toggle(state: OutlineState, reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {\n    if (state.open) {\n      this.close(state, pdfWindow);",
  "  async toggle(reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {\n    const state = this.#state;\n    if (state.open) {\n      this.close(pdfWindow);",
  'outline toggle api',
);
outline = replaceOnce(
  outline,
  "  async focus(state: OutlineState, reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {\n    if (!state.open) {\n      await this.toggle(state, reader, pdfWindow);",
  "  async focus(reader: ReaderRuntime, pdfWindow: PdfWindow): Promise<void> {\n    const state = this.#state;\n    if (!state.open) {\n      await this.toggle(reader, pdfWindow);",
  'outline focus api',
);
outline = replaceOnce(
  outline,
  "  close(state: OutlineState, pdfWindow?: PdfWindow): void {\n    state.loadGeneration += 1;",
  "  close(pdfWindow?: PdfWindow): void {\n    const state = this.#state;\n    state.loadGeneration += 1;",
  'outline close api',
);
outline = replaceOnce(
  outline,
  "  handleKey(\n    state: OutlineState,\n    reader: ReaderRuntime,\n    pdfWindow: PdfWindow,\n    event: KeyboardEvent,\n  ): boolean {\n    const key = keyString(event);",
  "  handleKey(\n    reader: ReaderRuntime,\n    pdfWindow: PdfWindow,\n    event: KeyboardEvent,\n  ): boolean {\n    const state = this.#state;\n    const key = keyString(event);",
  'outline key api',
);
writeFileSync(outlinePath, outline);

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');
controller = replaceOnce(
  controller,
  `      marks: {},\n      outline: {\n        open: false,\n        loading: false,\n        loadGeneration: 0,\n        tree: null,\n        visible: [],\n        selected: 0,\n        overlay: null,\n        list: null,\n        status: null,\n        themeCleanup: null,\n        hintBuffer: '',\n        hintTimer: null,\n        commandBuffer: '',\n        commandTimer: null,\n      },\n      sidebarOutlineIndex: -1,`,
  `      marks: {},\n      sidebarOutlineIndex: -1,`,
  'session outline state',
);
controller = replaceOnce(
  controller,
  "      this.#marksExplorer.close();\n      this.#outline.close(this.state.outline);",
  "      this.#marksExplorer.close();\n      this.#outline.close();",
  'dispose outline',
);
controller = replaceOnce(
  controller,
  "    if (this.state.outline.overlay?.ownerDocument.defaultView === pdfWindow)\n      this.#sidebar.releaseView(pdfWindow, () =>\n        this.#outline.close(this.state.outline, pdfWindow),\n      );",
  "    if (this.#outline.ownsView(pdfWindow))\n      this.#sidebar.releaseView(pdfWindow, () => this.#outline.close(pdfWindow));",
  'release outline view',
);
controller = replaceOnce(
  controller,
  "    if (\n      this.state.outline.open &&\n      this.#outline.handleKey(this.state.outline, this.#dependencies.reader, pdfWindow, event)\n    )\n      return;",
  "    if (this.#outline.isOpen && this.#outline.handleKey(this.#dependencies.reader, pdfWindow, event))\n      return;",
  'outline key dispatch',
);
controller = replaceOnce(
  controller,
  "    if (this.#marksExplorer.isOpen || this.state.outline.open || this.#linkHints.hasHints)\n      return true;",
  "    if (this.#marksExplorer.isOpen || this.#outline.isOpen || this.#linkHints.hasHints) return true;",
  'outline key forwarding',
);
controller = replaceOnce(
  controller,
  `  private openOrFocusOutline(pdfWindow: PdfWindow, focusOnly: boolean): void {\n    this.#sidebar.activate('outline', pdfWindow, () => this.#marksExplorer.close(pdfWindow));\n    if (focusOnly) {\n      void this.#outline.focus(this.state.outline, this.#dependencies.reader, pdfWindow);\n      return;\n    }\n    if (this.state.outline.open) this.#outline.close(this.state.outline, pdfWindow);\n    else void this.#outline.toggle(this.state.outline, this.#dependencies.reader, pdfWindow);\n  }`,
  `  private openOrFocusOutline(pdfWindow: PdfWindow, focusOnly: boolean): void {\n    this.#sidebar.activate('outline', pdfWindow, () => this.#marksExplorer.close(pdfWindow));\n    if (focusOnly) {\n      void this.#outline.focus(this.#dependencies.reader, pdfWindow);\n      return;\n    }\n    if (this.#outline.isOpen) this.#outline.close(pdfWindow);\n    else void this.#outline.toggle(this.#dependencies.reader, pdfWindow);\n  }`,
  'outline orchestration',
);
controller = replaceOnce(
  controller,
  "    this.#sidebar.activate('marks', pdfWindow, () => this.#outline.close(this.state.outline));",
  "    this.#sidebar.activate('marks', pdfWindow, () => this.#outline.close());",
  'marks closes outline',
);
if (controller.includes('this.state.outline'))
  throw new Error('ReaderSession still reaches into Outline state');
writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = removeBetween(
  types,
  'export interface OutlineState {',
  'export interface ReaderSessionState {',
  'shared outline state type',
);
types = replaceOnce(types, '  outline: OutlineState;\n', '', 'session outline field');
if (types.includes('OutlineState')) throw new Error('OutlineState still exported from shared types');
writeFileSync(typesPath, types);

const testsPath = 'tests/unit/reader-controller.test.ts';
let tests = readFileSync(testsPath, 'utf8');
tests = replaceOnce(
  tests,
  "    created.session.focusAndHandle(escape.event);\n    expect(created.session.state.outline.open).toBe(false);\n\n    created.session.focusAndHandle(readerKey('+').event);",
  "    created.session.focusAndHandle(escape.event);\n    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');\n\n    created.session.focusAndHandle(readerKey('+').event);",
  'outline close behavior assertion',
);
const stateAssertions =
  "    expect(created.session.state.outline.open).toBe(false);\n    expect(created.session.state.outline.loading).toBe(false);\n";
const first = tests.indexOf(stateAssertions);
if (first < 0) throw new Error('Missing first outline state assertion pair');
const second = tests.indexOf(stateAssertions, first + stateAssertions.length);
if (second < 0) throw new Error('Missing second outline state assertion pair');
if (tests.indexOf(stateAssertions, second + stateAssertions.length) >= 0)
  throw new Error('Unexpected extra outline state assertion pair');
tests = tests.split(stateAssertions).join('');
if (tests.includes('state.outline')) throw new Error('Tests still inspect Outline session state');
writeFileSync(testsPath, tests);

const developmentPath = 'docs/DEVELOPMENT.md';
let development = readFileSync(developmentPath, 'utf8');
development = replaceOnce(
  development,
  "`ReaderMarksExplorer` owns its transient open/selection/DOM/theme state. Every close path,\nincluding Escape and mark activation, notifies `ReaderSidebarOverlay` so the shared sidebar\ncoordinator never retains a stale active kind. `ReaderSessionState` keeps only persistent mark\ndata; it must not mirror Marks Explorer DOM state. Outline keeps its existing explicit state\nuntil its asynchronous load lifecycle is isolated separately.",
  "`ReaderMarksExplorer` and `ReaderOutline` own their transient open/selection/DOM/theme state.\nEvery close path notifies `ReaderSidebarOverlay` so the shared coordinator never retains a stale\nactive kind. `ReaderOutline` also owns its cached tree, hint/command timers, and load-generation\ntoken; closing or replacing a PDF view invalidates pending `getOutline()` work before it can\nrepaint a later overlay. `ReaderSessionState` must not mirror either sidebar's transient state.",
  'sidebar ownership docs',
);
writeFileSync(developmentPath, development);
