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

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');
controller = replaceOnce(
  controller,
  "import { ReaderMarksExplorer, type MarksExplorerState } from './marks-explorer';",
  "import { ReaderMarksExplorer } from './marks-explorer';",
  'marks explorer import',
);
controller = replaceOnce(
  controller,
  "      marks: {},\n      marksExplorerOpen: false,\n      marksExplorerSelected: 0,\n      marksOverlay: null,\n      marksList: null,\n      marksThemeCleanup: null,\n      outline: {",
  "      marks: {},\n      outline: {",
  'marks explorer session fields',
);
controller = replaceOnce(
  controller,
  "      onAnnotation: (key) => {\n        this.state.lastAnnotationKey = key;\n      },\n    });",
  "      onAnnotation: (key) => {\n        this.state.lastAnnotationKey = key;\n      },\n      onClose: (pdfWindow) => this.#sidebar.closed('marks', pdfWindow),\n    });",
  'marks explorer close host',
);
controller = replaceOnce(
  controller,
  "    this.#sidebar.dispose(() => {\n      this.closeMarksExplorer();\n      this.#outline.close(this.state.outline);\n    });",
  "    this.#sidebar.dispose(() => {\n      this.#marksExplorer.close();\n      this.#outline.close(this.state.outline);\n    });",
  'dispose marks explorer',
);
controller = replaceOnce(
  controller,
  "    if (this.state.marksOverlay?.ownerDocument.defaultView === pdfWindow)\n      this.#sidebar.releaseView(pdfWindow, () => this.closeMarksExplorer(pdfWindow));",
  "    if (this.#marksExplorer.ownsView(pdfWindow))\n      this.#sidebar.releaseView(pdfWindow, () => this.#marksExplorer.close(pdfWindow));",
  'release marks explorer view',
);
controller = replaceOnce(
  controller,
  "    if (this.state.marksExplorerOpen) {\n      const view = this.marksExplorerState();\n      this.#marksExplorer.handleKey(view, pdfWindow, event);\n      this.syncMarksExplorerState(view);\n      return;\n    }",
  "    if (this.#marksExplorer.isOpen) {\n      this.#marksExplorer.handleKey(pdfWindow, event);\n      return;\n    }",
  'marks explorer key dispatch',
);
controller = replaceOnce(
  controller,
  "    if (this.state.marksExplorerOpen || this.state.outline.open || this.#linkHints.hasHints)\n      return true;",
  "    if (this.#marksExplorer.isOpen || this.state.outline.open || this.#linkHints.hasHints)\n      return true;",
  'marks explorer key forwarding',
);
controller = replaceOnce(
  controller,
  "    this.#sidebar.activate('outline', pdfWindow, () => this.closeMarksExplorer(pdfWindow));",
  "    this.#sidebar.activate('outline', pdfWindow, () => this.#marksExplorer.close(pdfWindow));",
  'outline closes marks explorer',
);
controller = removeBetween(
  controller,
  '  private marksExplorerState() {',
  "  private toggleSplit(type: 'horizontal' | 'vertical'): void {",
  'marks explorer controller state glue',
);
const insertion = `  private toggleMarksExplorer(pdfWindow: PdfWindow): void {\n    if (this.#marksExplorer.isOpen) {\n      this.#marksExplorer.close(pdfWindow);\n      return;\n    }\n    this.#sidebar.activate('marks', pdfWindow, () => this.#outline.close(this.state.outline));\n    this.#marksExplorer.toggle(pdfWindow);\n  }\n\n`;
controller = replaceOnce(
  controller,
  "  private toggleSplit(type: 'horizontal' | 'vertical'): void {",
  insertion + "  private toggleSplit(type: 'horizontal' | 'vertical'): void {",
  'marks explorer controller toggle',
);
writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = replaceOnce(
  types,
  "  marks: Record<string, Mark>;\n  marksExplorerOpen: boolean;\n  marksExplorerSelected: number;\n  marksOverlay: HTMLElement | null;\n  marksList: HTMLElement | null;\n  marksThemeCleanup: (() => void) | null;\n  outline: OutlineState;",
  "  marks: Record<string, Mark>;\n  outline: OutlineState;",
  'marks explorer state type fields',
);
writeFileSync(typesPath, types);

const testsPath = 'tests/unit/reader-controller.test.ts';
let tests = readFileSync(testsPath, 'utf8');
tests = replaceOnce(
  tests,
  "  it('coordinates Marks replacement when focusing Outline and restores focus on disposal', () => {",
  "  it('reopens Marks immediately after Escape closes the explorer', () => {\n    const created = createHistorySession();\n    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);\n    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');\n\n    created.session.focusAndHandle(readerKey('Escape').event);\n    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');\n\n    executeReaderAction(created.session, 'toggleMarksExplorer', created.pdfWindow);\n    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');\n    created.session.dispose();\n  });\n\n  it('coordinates Marks replacement when focusing Outline and restores focus on disposal', () => {",
  'marks explorer reopen regression',
);
writeFileSync(testsPath, tests);

const developmentPath = 'docs/DEVELOPMENT.md';
let development = readFileSync(developmentPath, 'utf8');
development = replaceOnce(
  development,
  '## Annotation comment overlay\n',
  "## Reader sidebar ownership\n\n`ReaderMarksExplorer` owns its transient open/selection/DOM/theme state. Every close path,\nincluding Escape and mark activation, notifies `ReaderSidebarOverlay` so the shared sidebar\ncoordinator never retains a stale active kind. `ReaderSessionState` keeps only persistent mark\ndata; it must not mirror Marks Explorer DOM state. Outline keeps its existing explicit state\nuntil its asynchronous load lifecycle is isolated separately.\n\n## Annotation comment overlay\n",
  'marks explorer ownership docs',
);
writeFileSync(developmentPath, development);
