import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return source.replace(before, after);
}

function replaceSection(source, start, end, replacement, label) {
  const startCount = source.split(start).length - 1;
  const endCount = source.split(end).length - 1;
  if (startCount !== 1 || endCount !== 1)
    throw new Error(`${label}: expected unique boundaries, found start=${startCount} end=${endCount}`);
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0 || endIndex <= startIndex) throw new Error(`${label}: invalid boundary order`);
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');

controller = replaceOnce(
  controller,
  "import { ReaderLinkHints } from './link-hints';\nimport { verticalTextPosition } from './text-motion';",
  "import { ReaderLinkHints } from './link-hints';\nimport {\n  ReaderCommentEditor,\n  type AnnotationCommentTarget,\n} from './comment-editor';\nimport { verticalTextPosition } from './text-motion';",
  'comment editor import',
);

controller = replaceOnce(
  controller,
  "  readonly #outline: ReaderOutline;\n  readonly #linkHints: ReaderLinkHints;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  "  readonly #outline: ReaderOutline;\n  readonly #linkHints: ReaderLinkHints;\n  readonly #commentEditor: ReaderCommentEditor;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  'comment editor field',
);

controller = replaceOnce(
  controller,
  "      commentOverlay: null,\n      commentInput: null,\n      commentThemeCleanup: null,\n      commentItemID: null,\n      commentLibraryID: null,\n      commentAutosaveTimer: null,\n      composing: false,\n      insertSession: 0,\n      insertWatchdog: null,\n      previousDeleteFromComment: undefined,\n      popupGuard: null,\n",
  '',
  'legacy comment state initialization',
);

const linkHintConstruction = `    this.#linkHints = new ReaderLinkHints({
      reader: dependencies.reader,
      viewForWindow: (pdfWindow) => this.readerViewForWindow(pdfWindow),
      showStatus: (message, duration) => this.showStatus(message, duration),
      debug: (message) => dependencies.controller.dependencies.logger.debug(message),
      diagnostic: (message) => dependencies.controller.dependencies.logger.diagnostic(message),
    });
`;
controller = replaceOnce(
  controller,
  linkHintConstruction,
  `${linkHintConstruction}    this.#commentEditor = new ReaderCommentEditor({
      reader: dependencies.reader,
      schedule: (delay, task) => this.schedule(delay, task),
      clearTimer: (timer) => this.clearTimer(timer),
      themeRoot: (root) => this.themeRoot(root),
      activePdfWindow: () => this.activePdfWindow(),
      resolveAnnotation: (key) => this.resolveAnnotation(key),
      annotationForSave: (target) => this.annotationForSave(target),
      nativeEditableFocused: () => this.nativeEditableFocused(),
      onNativeEditorFocus: () => {
        void this.handOverNativeEditor();
      },
      locale: () => zoteroRuntime().locale ?? '',
    });
`,
  'comment editor construction',
);

controller = replaceOnce(
  controller,
  '  dispose(): void {\n    this.state.insertSession += 1;\n',
  '  dispose(): void {\n    this.#commentEditor.dispose();\n',
  'dispose comment lifecycle',
);

controller = replaceOnce(
  controller,
  "          this.state.mode !== 'insert' ||\n          !this.state.commentInput ||\n          !isEditableElement(asElement(event.target))",
  "          this.state.mode !== 'insert' ||\n          !this.#commentEditor.hasInput ||\n          !isEditableElement(asElement(event.target))",
  'native editor handoff guard',
);

controller = replaceOnce(
  controller,
  "    if (this.state.commentOverlay?.ownerDocument.defaultView === pdfWindow)\n      this.closeCommentOverlay();",
  '    this.#commentEditor.releaseView(pdfWindow);',
  'view release comment lifecycle',
);

controller = replaceOnce(
  controller,
  `      const session = this;
      const wrapper = (): boolean => {
        const input = session.state.commentInput;
        if (input?.isConnected && view._iframeWindow?.document.activeElement === input) return true;
        return original.call(view);
      };
`,
  `      const session = this;
      const wrapper = (): boolean => {
        if (session.#commentEditor.isInputFocused(view._iframeWindow)) return true;
        return original.call(view);
      };
`,
  'text annotation focus patch',
);

controller = replaceOnce(
  controller,
  '    if (event.target === this.state.commentInput) event.stopImmediatePropagation();',
  '    if (this.#commentEditor.ownsTarget(event.target)) event.stopImmediatePropagation();',
  'insert target ownership',
);

controller = replaceOnce(
  controller,
  `    if (this.state.mode === 'insert')
      return (
        key === 'escape' ||
        (!!this.state.commentInput &&
          (key.length === 1 || ['backspace', 'delete', 'enter'].includes(key)))
      );
`,
  `    if (this.state.mode === 'insert')
      return (
        key === 'escape' ||
        (this.#commentEditor.hasInput &&
          (key.length === 1 || ['backspace', 'delete', 'enter'].includes(key)))
      );
`,
  'insert key forwarding ownership',
);

controller = replaceOnce(
  controller,
  "    if (this.state.mode === 'insert' && mode !== 'insert') this.state.insertSession += 1;",
  "    if (this.state.mode === 'insert' && mode !== 'insert') this.#commentEditor.invalidate();",
  'insert generation ownership',
);

controller = replaceOnce(
  controller,
  "    if (mode !== 'insert') this.clearTimer(this.state.insertWatchdog);\n",
  '',
  'insert watchdog timer ownership',
);

controller = replaceSection(
  controller,
  '  private async enterAnnotationInsert(): Promise<void> {',
  '  private async resolveAnnotation(key: string): Promise<AnnotationRuntime | null> {',
  `  private async enterAnnotationInsert(): Promise<void> {
    const key =
      this.state.lastAnnotationKey ??
      this.#dependencies.reader._internalReader?._state?.selectedAnnotationIDs?.[0] ??
      null;
    if (!key) {
      this.showStatus('✗ navigate first with [ / ]', 2000);
      return;
    }
    this.setMode('insert');
    this.state.lastAnnotationKey = key;
    await this.#commentEditor.open(key);
  }

`,
  'enter annotation insert',
);

controller = replaceSection(
  controller,
  '  private createCommentOverlay(pdfWindow: PdfWindow, comment: string, quote: string): void {',
  '  private toggleMarksExplorer(pdfWindow: PdfWindow): void {',
  `  private async exitAnnotationInsert(): Promise<void> {
    const saved = await this.#commentEditor.exit();
    this.setMode('normal');
    this.activePdfWindow()?.focus();
    this.showStatus(saved ? '✓ saved' : '✗ save failed', saved ? 1200 : 2500);
  }

  private async handOverNativeEditor(): Promise<void> {
    this.setMode('normal');
    await this.#commentEditor.handOver();
  }

  private async annotationForSave(
    target: AnnotationCommentTarget,
  ): Promise<AnnotationRuntime | null> {
    const items = zoteroRuntime().Items;
    let annotation: AnnotationRuntime | null = null;
    if (target.itemID !== null) {
      const cached = items.get(target.itemID);
      if (cached) annotation = cached;
    }
    if (!annotation && target.libraryID !== null) {
      const indexed = items.getByLibraryAndKey?.(target.libraryID, target.key) ?? null;
      if (indexed) annotation = indexed;
    }
    if (!annotation && target.libraryID !== null && items.getByLibraryAndKeyAsync) {
      const fetched = await items.getByLibraryAndKeyAsync(target.libraryID, target.key);
      if (fetched) annotation = fetched;
    }
    if (annotation?.loadDataType) await annotation.loadDataType('annotation');
    return annotation;
  }

`,
  'comment editor implementation block',
);

const forbiddenController = [
  'state.commentOverlay',
  'state.commentInput',
  'state.commentThemeCleanup',
  'state.commentItemID',
  'state.commentLibraryID',
  'state.commentAutosaveTimer',
  'state.composing',
  'state.insertSession',
  'state.insertWatchdog',
  'state.previousDeleteFromComment',
  'state.popupGuard',
  'createCommentOverlay(',
  'closeCommentOverlay(',
  'scheduleCommentAutosave(',
  'armPopupGuard(',
  'keepCommentFocus(',
  'restoreAnnotationDeletionFlag(',
];
for (const token of forbiddenController) {
  if (controller.includes(token)) throw new Error(`controller still contains legacy token: ${token}`);
}
writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = replaceOnce(
  types,
  `  commentOverlay: HTMLElement | null;
  commentInput: HTMLTextAreaElement | null;
  commentThemeCleanup: (() => void) | null;
  commentItemID: number | null;
  commentLibraryID: number | null;
  commentAutosaveTimer: ReaderTimer | null;
  composing: boolean;
  insertSession: number;
  insertWatchdog: ReaderTimer | null;
  previousDeleteFromComment: boolean | undefined;
  popupGuard: MutationObserver | null;
`,
  '',
  'ReaderSessionState comment fields',
);
writeFileSync(typesPath, types);

const docsPath = 'docs/DEVELOPMENT.md';
let docs = readFileSync(docsPath, 'utf8');
docs = replaceSection(
  docs,
  '## Annotation comment overlay\n',
  '## Source layout\n',
  `## Annotation comment overlay

The operating-system keyboard focus remains in the PDF.js iframe in common reader states.
Programmatic focus on Zotero-native annotation editors is not a reliable text-input strategy and
interferes with Gecko/React focus handling.

\`ReaderCommentEditor\` owns the transient annotation-comment target, textarea DOM, IME state,
autosave/focus timers, popup guard, theme subscription, and Zotero's private
\`_enableAnnotationDeletionFromComment\` override. \`ReaderSession\` owns only Insert mode and the
persistent selected-annotation key. The feature resolves and snapshots its save target before
mounting so later annotation navigation cannot retarget an in-progress edit.

Neo renders the textarea in the PDF document, accepts native typing and IME composition, and saves
through the resolved annotation item with \`saveTx()\`. A generation token prevents stale async open
or focus work. PDF-view release and Reader disposal invalidate that work, stop the watchdog, remove
the overlay, disconnect the popup observer, and restore the host deletion flag. The
\`_textAnnotationFocused\` patch reports the Neo textarea as focused so Zotero's earlier Enter
handler cannot open a competing annotation popup. Native editor focus hands off by restoring host
behavior, saving, and closing the Neo overlay; it must never fight to reclaim focus.

`,
  'annotation comment architecture docs',
);
writeFileSync(docsPath, docs);
