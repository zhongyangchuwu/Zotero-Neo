import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Non-unique anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');
controller = replaceOnce(
  controller,
  `  #keyGuideTimer: ReaderTimer | null = null;\n  #inputRevision = 0;\n  readonly state: ReaderSessionState;`,
  `  #keyGuideTimer: ReaderTimer | null = null;\n  #inputRevision = 0;\n  #sidebarToggleBuffer = '';\n  #sidebarToggleTimer: ReaderTimer | null = null;\n  readonly state: ReaderSessionState;`,
  'sidebar toggle fields',
);
controller = replaceOnce(
  controller,
  `      onClose: (pdfWindow) => this.#sidebar.closed('marks', pdfWindow),`,
  `      onClose: (pdfWindow) => {\n        this.clearSidebarToggleInput();\n        this.#sidebar.closed('marks', pdfWindow);\n      },`,
  'marks close clears toggle input',
);
controller = replaceOnce(
  controller,
  `      onClose: (pdfWindow) => this.#sidebar.closed('outline', pdfWindow),`,
  `      onClose: (pdfWindow) => {\n        this.clearSidebarToggleInput();\n        this.#sidebar.closed('outline', pdfWindow);\n      },`,
  'outline close clears toggle input',
);
controller = replaceOnce(
  controller,
  `  dispose(): void {\n    this.state.insertSession += 1;\n    this.stopSmoothHold(true);`,
  `  dispose(): void {\n    this.state.insertSession += 1;\n    this.stopSmoothHold(true);\n    this.clearSidebarToggleInput();`,
  'dispose clears sidebar toggle input',
);
controller = replaceOnce(
  controller,
  `  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {\n    this.activatePdfWindow(pdfWindow);\n    if (\n      this.#outline.isOpen &&`,
  `  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {\n    this.activatePdfWindow(pdfWindow);\n    if (this.handleSidebarToggleKey(event, pdfWindow)) return;\n    if (\n      this.#outline.isOpen &&`,
  'sidebar toggle dispatch priority',
);
controller = replaceOnce(
  controller,
  `  private handleInsertKey(event: KeyboardEvent): void {`,
  `  private handleSidebarToggleKey(event: KeyboardEvent, pdfWindow: PdfWindow): boolean {\n    const action = this.#outline.isOpen\n      ? 'toggleReaderSidebarOutline'\n      : this.#marksExplorer.isOpen\n        ? 'toggleMarksExplorer'\n        : null;\n    if (!action) {\n      this.clearSidebarToggleInput();\n      return false;\n    }\n    const key = keyString(event);\n    if (!key) return false;\n    const modePrefix = 'normal:';\n    const sequences = Object.entries(this.#dependencies.bindings())\n      .filter(\n        ([binding, boundAction]) =>\n          binding.startsWith(modePrefix) && boundAction === action,\n      )\n      .map(([binding]) => binding.slice(modePrefix.length));\n    const matching = (buffer: string): string[] =>\n      sequences.filter((sequence) => sequence.startsWith(buffer));\n\n    let next = \`${'${this.#sidebarToggleBuffer}'}${'${key}'}\`;\n    let matches = matching(next);\n    if (!matches.length && this.#sidebarToggleBuffer) {\n      next = key;\n      matches = matching(next);\n    }\n    if (!matches.length) {\n      this.clearSidebarToggleInput();\n      return false;\n    }\n\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    if (matches.includes(next)) {\n      this.clearSidebarToggleInput();\n      if (action === 'toggleReaderSidebarOutline') this.#outline.close(pdfWindow);\n      else this.#marksExplorer.close(pdfWindow);\n      return true;\n    }\n\n    this.#sidebarToggleBuffer = next;\n    this.clearTimer(this.#sidebarToggleTimer);\n    this.#sidebarToggleTimer = this.schedule(1200, () => {\n      this.#sidebarToggleBuffer = '';\n      this.#sidebarToggleTimer = null;\n    });\n    return true;\n  }\n\n  private clearSidebarToggleInput(): void {\n    this.#sidebarToggleBuffer = '';\n    this.clearTimer(this.#sidebarToggleTimer);\n    this.#sidebarToggleTimer = null;\n  }\n\n  private handleInsertKey(event: KeyboardEvent): void {`,
  'sidebar toggle input methods',
);
writeFileSync(controllerPath, controller);

const testsPath = 'tests/unit/reader-controller.test.ts';
let tests = readFileSync(testsPath, 'utf8');
const insertBefore = `  it('coordinates Marks replacement when focusing Outline and restores focus on disposal', () => {`;
const testsToAdd = `  it('toggles open Outline and Marks with their default Space-leader shortcuts', () => {\n    for (const [key, overlayID] of [\n      ['e', 'zv-outline-explorer'],\n      ['m', 'zv-marks-explorer'],\n    ] as const) {\n      const created = createHistorySession();\n      created.session.focusAndHandle(readerKey(' ').event);\n      created.session.focusAndHandle(readerKey(key).event);\n      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);\n\n      const prefix = readerKey(' ');\n      created.session.focusAndHandle(prefix.event);\n      expect(prefix.preventDefault).toHaveBeenCalledOnce();\n      expect(created.bodyChildren.map((node) => node.id)).toContain(overlayID);\n\n      const close = readerKey(key);\n      created.session.focusAndHandle(close.event);\n      expect(close.preventDefault).toHaveBeenCalledOnce();\n      expect(created.bodyChildren.map((node) => node.id)).not.toContain(overlayID);\n      created.session.dispose();\n    }\n  });\n\n  it('uses remapped toggle bindings while a Reader sidebar owns input', () => {\n    const bindings = {\n      ...Object.fromEntries(\n        Object.entries(DEFAULT_BINDINGS).filter(\n          ([binding]) => binding !== 'normal: e' && binding !== 'normal: m',\n        ),\n      ),\n      'normal:q': 'toggleReaderSidebarOutline',\n      'normal:w': 'toggleMarksExplorer',\n    } as BindingMap;\n    const created = createHistorySession({}, () => {}, bindings);\n\n    created.session.focusAndHandle(readerKey('q').event);\n    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');\n    created.session.focusAndHandle(readerKey('q').event);\n    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-outline-explorer');\n\n    created.session.focusAndHandle(readerKey('w').event);\n    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-marks-explorer');\n    created.session.focusAndHandle(readerKey('w').event);\n    expect(created.bodyChildren.map((node) => node.id)).not.toContain('zv-marks-explorer');\n    created.session.dispose();\n  });\n\n  it('returns a failed sidebar toggle prefix to local sidebar input', () => {\n    const scrollBy = vi.fn();\n    const created = createHistorySession();\n    Reflect.set(created.pdfWindow, 'PDFViewerApplication', {\n      pdfViewer: { container: { scrollBy } },\n    });\n    executeReaderAction(created.session, 'toggleReaderSidebarOutline', created.pdfWindow);\n\n    created.session.focusAndHandle(readerKey(' ').event);\n    created.session.focusAndHandle(readerKey('j').event);\n\n    expect(scrollBy).not.toHaveBeenCalled();\n    expect(created.bodyChildren.map((node) => node.id)).toContain('zv-outline-explorer');\n    created.session.dispose();\n  });\n\n`;
tests = replaceOnce(tests, insertBefore, testsToAdd + insertBefore, 'sidebar toggle tests');
writeFileSync(testsPath, tests);
