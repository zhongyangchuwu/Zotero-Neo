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
  "import { ReaderMarksExplorer, type MarksExplorerState } from './marks-explorer';\nimport { hintLabels } from './hint-labels';\nimport { verticalTextPosition } from './text-motion';",
  "import { ReaderMarksExplorer, type MarksExplorerState } from './marks-explorer';\nimport { ReaderLinkHints } from './link-hints';\nimport { verticalTextPosition } from './text-motion';",
  'ReaderLinkHints import',
);
controller = replaceOnce(
  controller,
  "  type ReaderEventRuntime,\n  type ReaderLinkOverlay,\n  type ReaderLinkPosition,\n  type ReaderMode,",
  "  type ReaderEventRuntime,\n  type ReaderMode,",
  'link type imports',
);
controller = replaceOnce(
  controller,
  "  readonly #sidebar: ReaderSidebarOverlay;\n  readonly #outline: ReaderOutline;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  "  readonly #sidebar: ReaderSidebarOverlay;\n  readonly #outline: ReaderOutline;\n  readonly #linkHints: ReaderLinkHints;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  'link hints field',
);
controller = replaceOnce(
  controller,
  "      visualPreferredX: null,\n      cursorPreferredX: null,\n      linkHintBadges: [],\n      linkHintBuffer: '',\n      linkHintWindow: null,\n      linkHintRepositionFrame: null,\n      destinationCue: null,\n      destinationCuePosition: null,\n      destinationCueWindow: null,\n      destinationCueTimer: null,\n      destinationCueRepositionFrame: null,\n      marks: {},",
  "      visualPreferredX: null,\n      cursorPreferredX: null,\n      marks: {},",
  'link state initialization',
);
controller = replaceOnce(
  controller,
  "      popupGuard: null,\n    };\n    this.#marks = new ReaderMarks({",
  "      popupGuard: null,\n    };\n    this.#linkHints = new ReaderLinkHints({\n      reader: dependencies.reader,\n      viewForWindow: (pdfWindow) => this.readerViewForWindow(pdfWindow),\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      debug: (message) => dependencies.controller.dependencies.logger.debug(message),\n      diagnostic: (message) => dependencies.controller.dependencies.logger.diagnostic(message),\n    });\n    this.#marks = new ReaderMarks({",
  'link hints construction',
);
controller = replaceOnce(
  controller,
  "    this.clearLinkHints();\n    this.clearDestinationCue();\n    this.clearKeyGuide();",
  "    this.#linkHints.close();\n    this.clearKeyGuide();",
  'dispose link hints',
);
controller = replaceOnce(
  controller,
  "      const scroll = (() => {\n        if (this.state.linkHintWindow === pdfWindow) this.repositionLinkHints(pdfWindow);\n        if (this.state.destinationCueWindow === pdfWindow) this.repositionDestinationCue(pdfWindow);\n        if (this.state.mode === 'visual' || this.state.mode === 'cursor')\n          this.updateVisualCursor(pdfWindow, false);\n      }) as EventListener;\n      const resize = (() => {\n        if (this.state.linkHintWindow === pdfWindow) this.repositionLinkHints(pdfWindow);\n        if (this.state.destinationCueWindow === pdfWindow) this.repositionDestinationCue(pdfWindow);\n      }) as EventListener;",
  "      const scroll = (() => {\n        this.#linkHints.onViewportChange(pdfWindow);\n        if (this.state.mode === 'visual' || this.state.mode === 'cursor')\n          this.updateVisualCursor(pdfWindow, false);\n      }) as EventListener;\n      const resize = (() => this.#linkHints.onViewportChange(pdfWindow)) as EventListener;",
  'viewport link hint hooks',
);
controller = replaceOnce(
  controller,
  "    handlers.scrollElement?.removeEventListener('scroll', handlers.scroll);\n    if (this.state.linkHintWindow === pdfWindow) this.clearLinkHints();\n    if (this.state.destinationCueWindow === pdfWindow) this.clearDestinationCue();\n    this.releaseViewTheme(pdfWindow);",
  "    handlers.scrollElement?.removeEventListener('scroll', handlers.scroll);\n    this.#linkHints.releaseView(pdfWindow);\n    this.releaseViewTheme(pdfWindow);",
  'view teardown link hints',
);
controller = replaceOnce(
  controller,
  "    if (this.state.linkHintBadges.length && isEditableElement(asElement(event.target))) {\n      this.clearLinkHints();\n      return;\n    }\n    if (this.state.linkHintBadges.length) {\n      this.handleLinkHintKey(event, pdfWindow);\n      return;\n    }",
  "    if (this.#linkHints.hasHints && isEditableElement(asElement(event.target))) {\n      this.#linkHints.cancelHints();\n      return;\n    }\n    if (this.#linkHints.hasHints) {\n      this.#linkHints.handleKey(event, pdfWindow);\n      return;\n    }",
  'link hint key dispatch',
);
controller = replaceOnce(
  controller,
  "    if (this.state.marksExplorerOpen || this.state.outline.open || this.state.linkHintBadges.length)\n      return true;",
  "    if (this.state.marksExplorerOpen || this.state.outline.open || this.#linkHints.hasHints)\n      return true;",
  'key forwarding link hints',
);
controller = replaceOnce(
  controller,
  "      case 'followLink':\n        this.showLinkHints(pdfWindow);\n        break;",
  "      case 'followLink':\n        this.#linkHints.open(pdfWindow);\n        break;",
  'followLink action',
);
controller = replaceOnce(
  controller,
  "  private setMode(mode: ReaderMode): void {\n    if (this.state.linkHintBadges.length) this.clearLinkHints();",
  "  private setMode(mode: ReaderMode): void {\n    if (this.#linkHints.hasHints) this.#linkHints.cancelHints();",
  'mode cleanup',
);
controller = removeBetween(
  controller,
  '  private showLinkHints(pdfWindow: PdfWindow): void {',
  '  private readerViewForWindow(pdfWindow: PdfWindow): ReaderViewRuntime | null {',
  'link hint lifecycle methods',
);
controller = removeBetween(
  controller,
  '  private isReaderLinkOverlay(value: unknown): value is ReaderLinkOverlay {',
  '  private swapVisualEnds(pdfWindow: PdfWindow): void {',
  'link hint geometry helpers',
);
writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = replaceOnce(
  types,
  "  cursorPreferredX: number | null;\n  linkHintBadges: LinkHintBadge[];\n  linkHintBuffer: string;\n  linkHintWindow: PdfWindow | null;\n  linkHintRepositionFrame: number | null;\n  destinationCue: HTMLElement | null;\n  destinationCuePosition: ReaderLinkPosition | null;\n  destinationCueWindow: PdfWindow | null;\n  destinationCueTimer: ReaderTimer | null;\n  destinationCueRepositionFrame: number | null;\n  marks: Record<string, Mark>;",
  "  cursorPreferredX: number | null;\n  marks: Record<string, Mark>;",
  'ReaderSessionState link fields',
);
types = replaceOnce(
  types,
  "export interface LinkHintBadge {\n  readonly element: HTMLElement;\n  readonly label: string;\n  readonly overlay: ReaderLinkOverlay;\n}\n\n",
  '',
  'LinkHintBadge type',
);
writeFileSync(typesPath, types);

const testPath = 'tests/unit/reader-controller.test.ts';
let tests = readFileSync(testPath, 'utf8');
tests = replaceOnce(
  tests,
  "function configureLinkView(\n  created: ReturnType<typeof createHistorySession>,\n  overlays: readonly unknown[],\n) {\n  const view = created.reader._internalReader?._primaryView;\n  if (!view) throw new Error('Expected a primary reader view');\n  const navigate = vi.fn();\n  const openLink = vi.fn();\n  Reflect.set(view, '_pdfPages', { 0: { overlays } });\n  Reflect.set(view, 'getClientRectForPopup', (position: ReaderLinkPosition) => position.rects[0]);\n  Reflect.set(view, 'navigate', navigate);\n  Reflect.set(view, '_onOpenLink', openLink);\n  return { view, navigate, openLink };\n}\n",
  "function configureLinkView(\n  created: ReturnType<typeof createHistorySession>,\n  overlays: readonly unknown[],\n) {\n  const view = created.reader._internalReader?._primaryView;\n  if (!view) throw new Error('Expected a primary reader view');\n  const navigate = vi.fn();\n  const openLink = vi.fn();\n  Reflect.set(view, '_pdfPages', { 0: { overlays } });\n  Reflect.set(view, 'getClientRectForPopup', (position: ReaderLinkPosition) => position.rects[0]);\n  Reflect.set(view, 'navigate', navigate);\n  Reflect.set(view, '_onOpenLink', openLink);\n  return { view, navigate, openLink };\n}\n\nfunction linkHintElements(created: ReturnType<typeof createHistorySession>): HTMLElement[] {\n  return created.bodyChildren.filter((node) => node.dataset.zoteroNeoLinkHint === '1');\n}\n\nfunction destinationCueElement(\n  created: ReturnType<typeof createHistorySession>,\n): HTMLElement | null {\n  return created.bodyChildren.find((node) => node.dataset.zoteroNeoDestinationCue === '1') ?? null;\n}\n",
  'link DOM test helpers',
);
tests = replaceOnce(
  tests,
  "    expect(created.session.state.linkHintBadges.map((badge) => badge.label)).toEqual([\n      'A',\n      'S',\n      'D',\n    ]);",
  "    expect(linkHintElements(created).map((badge) => badge.textContent)).toEqual(['A', 'S', 'D']);",
  'basic link labels assertion',
);
tests = replaceOnce(
  tests,
  '    const pointCue = created.session.state.destinationCue;',
  '    const pointCue = destinationCueElement(created);',
  'point cue assertion',
);
tests = replaceOnce(
  tests,
  '    expect(created.session.state.destinationCue).toBeNull();',
  '    expect(destinationCueElement(created)).toBeNull();',
  'external cue cleared',
);
tests = replaceOnce(
  tests,
  '    const rectangleCue = created.session.state.destinationCue;',
  '    const rectangleCue = destinationCueElement(created);',
  'rectangle cue assertion',
);
tests = replaceOnce(
  tests,
  "    vi.advanceTimersByTime(2000);\n    expect(created.session.state.destinationCue).toBeNull();",
  "    vi.advanceTimersByTime(2000);\n    expect(destinationCueElement(created)).toBeNull();",
  'destination timeout assertion',
);
tests = replaceOnce(
  tests,
  "    expect(new Set(created.session.state.linkHintBadges.map((badge) => badge.label)).size).toBe(27);\n    expect(created.session.state.linkHintBadges.every((badge) => badge.label.length === 2)).toBe(\n      true,\n    );",
  "    expect(new Set(linkHintElements(created).map((badge) => badge.textContent)).size).toBe(27);\n    expect(linkHintElements(created).every((badge) => (badge.textContent ?? '').length === 2)).toBe(\n      true,\n    );",
  'multi-label assertions',
);
tests = replaceOnce(
  tests,
  "    expect(created.session.state.linkHintBuffer).toBe('A');\n    expect(\n      created.session.state.linkHintBadges.filter((badge) => !badge.element.hidden),\n    ).toHaveLength(26);",
  "    expect(linkHintElements(created).filter((badge) => !badge.hidden)).toHaveLength(26);",
  'link prefix filtering',
);
tests = replaceOnce(
  tests,
  "    expect(created.session.state.linkHintBuffer).toBe('');\n    expect(created.session.state.linkHintBadges.every((badge) => !badge.element.hidden)).toBe(true);",
  "    expect(linkHintElements(created).every((badge) => !badge.hidden)).toBe(true);",
  'link backspace reset',
);
tests = replaceOnce(
  tests,
  '    expect(created.session.state.linkHintBadges).toHaveLength(0);',
  '    expect(linkHintElements(created)).toHaveLength(0);',
  'escape clears link hints',
);
tests = replaceOnce(
  tests,
  "    created.session.focusAndHandle(readerKey('f').event);\n    expect(created.session.state.linkHintBadges).toHaveLength(1);",
  "    created.session.focusAndHandle(readerKey('f').event);\n    expect(linkHintElements(created)).toHaveLength(1);",
  'view replacement precondition',
);
tests = replaceOnce(
  tests,
  "    expect(created.session.state.linkHintBadges).toHaveLength(0);\n    expect(created.bodyChildren).toHaveLength(0);\n    created.session.dispose();\n  });\n\n  it('contains missing, empty, and throwing private link seams'",
  "    expect(linkHintElements(created)).toHaveLength(0);\n    expect(created.bodyChildren).toHaveLength(0);\n    created.session.dispose();\n  });\n\n  it('contains missing, empty, and throwing private link seams'",
  'view replacement cleanup',
);
tests = tests.replaceAll(
  'expect(created.session.state.linkHintBadges).toHaveLength(0);',
  'expect(linkHintElements(created)).toHaveLength(0);',
);
writeFileSync(testPath, tests);

const developmentPath = 'docs/DEVELOPMENT.md';
let development = readFileSync(developmentPath, 'utf8');
development = replaceOnce(
  development,
  "External targets call `_onOpenLink(url)` with a primitive\nstring. Do not synthesize clicks or introduce Neo-owned link/history state. Missing or\nchanged members must fail closed with status and write the specific reason to both Zotero",
  "External targets call `_onOpenLink(url)` with a primitive\nstring. `ReaderLinkHints` owns hint badges, key-buffer filtering, viewport RAFs, and the\ntemporary destination cue; `ReaderSession` only orchestrates host/view boundaries. Do not\nsynthesize clicks or introduce Neo-owned link/history state. Missing or changed members\nmust fail closed with status and write the specific reason to both Zotero",
  'development link ownership',
);
writeFileSync(developmentPath, development);
