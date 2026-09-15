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
function replaceRegexOnce(text, regex, to, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matches = [...text.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  return text.replace(regex, to);
}

// Remove Cursor from the binding model and make Visual/Select the only PDF text mode.
{
  const path = 'src/input/bindings.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    "export const MODES = ['normal', 'visual', 'cursor', 'insert', 'main'] as const;",
    "export const MODES = ['normal', 'visual', 'insert', 'main'] as const;",
    'binding modes',
  );
  text = replaceOnce(text, '  cursor: true,\n', '', 'cursor mode parser');
  text = replaceOnce(text, "  'normal:s': 'flashText',\n", '', 'normal standalone Flash');
  text = replaceOnce(text, "  'normal:c': 'enterCursor',\n", '', 'normal cursor binding');
  text = replaceOnce(
    text,
    "  'visual:s': 'flashText',\n",
    "  'visual:s': 'flashText',\n  'visual:a': 'openSelectionActions',\n  'visual:enter': 'openSelectionActions',\n  'visual:return': 'openSelectionActions',\n",
    'visual selection actions',
  );
  text = replaceRegexOnce(
    text,
    /  'cursor:s': 'flashText',\n[\s\S]*?  'cursor:escape': 'exitMode',\n/,
    '',
    'cursor bindings',
  );
  text = replaceOnce(
    text,
    "const RETIRED_DEFAULT_BINDINGS = {\n",
    "const RETIRED_DEFAULT_BINDINGS = {\n  'normal:s': 'flashText',\n",
    'retired normal Flash default',
  );
  write(path, text);
}

// Remove dead Cursor actions and add Selection Action / underline commands.
{
  const path = 'src/input/actions.ts';
  let text = read(path);
  text = replaceRegexOnce(
    text,
    /(  enterVisual: \{[\s\S]*?\n  \},)\n  enterCursor: \{[\s\S]*?\n  \},\n  enterInsert:/,
    `$1\n  openSelectionActions: {\n    en: 'Open actions for selected text',\n    'zh-CN': '打开所选文本操作',\n  },\n  enterInsert:`,
    'enter cursor action',
  );
  text = replaceRegexOnce(
    text,
    /  cursorDown: \{[\s\S]*?\n  \},\n  cursorToVisual: \{[\s\S]*?\n  \},\n/,
    '',
    'cursor motion actions',
  );
  text = replaceRegexOnce(
    text,
    /(  highlightPurple: \{[\s\S]*?\n  \},)\n  addNote:/,
    `$1\n  underlineSelection: {\n    en: 'Underline selection',\n    'zh-CN': '为选区添加下划线',\n  },\n  addNote:`,
    'underline action',
  );
  write(path, text);
}

{
  const path = 'src/reader/types.ts';
  let text = read(path);
  text = replaceOnce(text, '  cursorPreferredX: number | null;\n', '', 'cursor state');
  write(path, text);
}

{
  const path = 'src/ui/theme.ts';
  let text = read(path);
  text = replaceOnce(text, "  modeCursor: 'var(--zotero-neo-mode-cursor)',\n", '', 'cursor theme var');
  text = replaceOnce(text, "    '--zotero-neo-mode-cursor': '#fff3e0',\n", '', 'light cursor theme');
  text = replaceOnce(text, "    '--zotero-neo-mode-cursor': '#332b00',\n", '', 'dark cursor theme');
  write(path, text);
}

{
  const path = 'src/preferences/binding-editor.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `const MODE_ORDER: Readonly<Record<Mode, number>> = {\n  normal: 0,\n  visual: 1,\n  cursor: 2,\n  insert: 3,\n  main: 4,\n};`,
    `const MODE_ORDER: Readonly<Record<Mode, number>> = {\n  normal: 0,\n  visual: 1,\n  insert: 2,\n  main: 3,\n};`,
    'binding mode order',
  );
  write(path, text);
}

{
  const path = 'assets/package/content/preferences/pane.xhtml';
  let text = read(path);
  text = replaceOnce(
    text,
    '    #zv-bindings-table tbody tr.zv-binding-mode-cursor { background: var(--zotero-neo-mode-cursor, #fff3e0); }\n',
    '',
    'cursor row style',
  );
  write(path, text);
}

// Reader Controller: wire selection ownership, range-aware Flash, strong Select presentation,
// action palette, PDF Translate adapter, and remove all Cursor execution paths.
{
  const path = 'src/reader/controller.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `import type {\n  ReaderControllerApi,\n  ReaderControllerDependencies,\n  MainWindow,\n} from '../core/contracts';`,
    `import type {\n  ReaderControllerApi,\n  ReaderControllerDependencies,\n  MainWindow,\n  ReaderSelectionActionDefinition,\n  ReaderSelectionContext,\n} from '../core/contracts';`,
    'controller contract imports',
  );
  text = replaceOnce(
    text,
    "import { focusDirectionForAction, type ActionId, type FocusDirection } from '../input/actions';",
    "import { ACTION_LABELS, focusDirectionForAction, type ActionId, type FocusDirection } from '../input/actions';",
    'action labels import',
  );
  text = replaceOnce(
    text,
    "import { ReaderFlash, type FlashMode } from './flash';",
    "import { ReaderFlash, type FlashIntent, type FlashSelectionTarget } from './flash';\nimport { ReaderSelectionActionRegistry, ReaderSelectionActions } from './selection-actions';",
    'Flash imports',
  );
  text = replaceOnce(
    text,
    `  readonly Item: new (itemType: 'annotation') => AnnotationDraft;\n  readonly locale?: string;`,
    `  readonly Item: new (itemType: 'annotation') => AnnotationDraft;\n  readonly PDFTranslate?: {\n    readonly api?: {\n      translate?(\n        raw: string,\n        options: { readonly pluginID: string; readonly itemID?: number },\n      ): Promise<{ readonly result?: string }>;\n    };\n  };\n  readonly locale?: string;`,
    'PDF Translate runtime',
  );
  text = replaceOnce(
    text,
    `  #lastSelection: AnnotationSelectionParams | null = null;\n  #lastSelectionAt = 0;`,
    `  #lastSelection: AnnotationSelectionParams | null = null;\n  #lastSelectionAt = 0;\n  readonly #selectionActions = new ReaderSelectionActionRegistry();\n  #selectionOwner: ReaderSession | null = null;`,
    'selection registry fields',
  );
  text = replaceOnce(
    text,
    `    this.#lastSelection = null;\n    this.#lastSelectionAt = 0;\n  }`,
    `    this.#lastSelection = null;\n    this.#lastSelectionAt = 0;\n    this.#selectionOwner = null;\n    this.#selectionActions.clear();\n  }`,
    'controller shutdown selection cleanup',
  );
  text = replaceOnce(
    text,
    `  selection(): AnnotationSelectionParams | null {\n    return this.#lastSelection && Date.now() - this.#lastSelectionAt < 10_000\n      ? this.#lastSelection\n      : null;\n  }\n\n`,
    `  selection(): AnnotationSelectionParams | null {\n    return this.#lastSelection && Date.now() - this.#lastSelectionAt < 10_000\n      ? this.#lastSelection\n      : null;\n  }\n\n  getSelection(): ReaderSelectionContext | null {\n    return this.#selectionOwner?.selectionContext() ?? null;\n  }\n\n  registerSelectionAction(action: ReaderSelectionActionDefinition): () => void {\n    return this.#selectionActions.register(action);\n  }\n\n  registeredSelectionActions(\n    context: ReaderSelectionContext,\n  ): readonly ReaderSelectionActionDefinition[] {\n    return this.#selectionActions.available(context);\n  }\n\n  noteSelectionOwner(session: ReaderSession): void {\n    this.#selectionOwner = session;\n  }\n\n  clearSelectionOwner(session: ReaderSession): void {\n    if (this.#selectionOwner === session) this.#selectionOwner = null;\n  }\n\n  get pluginID(): string | null {\n    return this.#pluginID;\n  }\n\n`,
    'public selection API',
  );
  text = replaceOnce(
    text,
    `  #release(instanceID: string, reader: ReaderRuntime): void {\n    const session = this.#sessions.get(instanceID);`,
    `  #release(instanceID: string, reader: ReaderRuntime): void {\n    const session = this.#sessions.get(instanceID);\n    if (session && this.#selectionOwner === session) this.#selectionOwner = null;`,
    'selection owner release',
  );
  text = replaceOnce(
    text,
    `  readonly #commentEditor: ReaderCommentEditor;\n  readonly #flash: ReaderFlash;\n  readonly #smoothScroller: ReaderSmoothScroller;`,
    `  readonly #commentEditor: ReaderCommentEditor;\n  readonly #flash: ReaderFlash;\n  readonly #selectionActions: ReaderSelectionActions;\n  readonly #smoothScroller: ReaderSmoothScroller;`,
    'session selection palette field',
  );
  text = replaceOnce(text, '      cursorPreferredX: null,\n', '', 'session cursor preferred X');
  text = replaceOnce(
    text,
    `    this.#flash = new ReaderFlash({\n      activate: (mode, pdfWindow, pointer) => this.activateFlashTarget(mode, pdfWindow, pointer),\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      debug: (message) => dependencies.controller.dependencies.logger.debug(message),\n    });\n    this.#smoothScroller = new ReaderSmoothScroller({`,
    `    this.#flash = new ReaderFlash({\n      activate: (intent, pdfWindow, target) =>\n        this.activateFlashTarget(intent, pdfWindow, target),\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      debug: (message) => dependencies.controller.dependencies.logger.debug(message),\n    });\n    this.#selectionActions = new ReaderSelectionActions({\n      actions: (context) => this.selectionActionDefinitions(context, this.activePdfWindow()),\n      themeRoot: (root) => this.themeRoot(root),\n      copyText: (text) => this.copyText(text),\n      showStatus: (message, duration) => this.showStatus(message, duration),\n      debug: (message) => dependencies.controller.dependencies.logger.debug(message),\n    });\n    this.#smoothScroller = new ReaderSmoothScroller({`,
    'selection feature construction',
  );
  text = replaceOnce(
    text,
    `  dispose(): void {\n    this.#commentEditor.dispose();\n    this.#flash.dispose();`,
    `  dispose(): void {\n    this.#commentEditor.dispose();\n    this.#selectionActions.dispose();\n    this.#dependencies.controller.clearSelectionOwner(this);\n    this.#flash.dispose();`,
    'selection palette dispose',
  );
  text = replaceOnce(
    text,
    `    this.#linkHints.releaseView(pdfWindow);\n    this.releaseViewTheme(pdfWindow);`,
    `    this.#linkHints.releaseView(pdfWindow);\n    this.#selectionActions.releaseView(pdfWindow);\n    this.releaseViewTheme(pdfWindow);`,
    'selection palette view release',
  );
  text = replaceOnce(
    text,
    `    this.activatePdfWindow(pdfWindow);\n    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;`,
    `    this.activatePdfWindow(pdfWindow);\n    if (this.#selectionActions.isOpen && this.#selectionActions.handleKey(event, pdfWindow)) return;\n    if (this.#flash.isOpen && this.#flash.handleKey(event, pdfWindow)) return;`,
    'selection palette input priority',
  );
  text = replaceOnce(
    text,
    `        if (this.state.mode === 'visual' || this.state.mode === 'cursor')\n          this.updateVisualCursor(pdfWindow, false);`,
    `        if (this.state.mode === 'visual') this.updateVisualCursor(pdfWindow, false);`,
    'scroll visual endpoint',
  );
  text = text.replaceAll(
    "allowCountPrefix: this.state.mode === 'normal' || this.state.mode === 'cursor',",
    "allowCountPrefix: this.state.mode === 'normal',",
  );
  if (text.includes("this.state.mode === 'cursor'")) {
    // Remaining cursor references are removed by guarded blocks below; reject unexpected drift after them.
  }
  text = replaceOnce(
    text,
    `  private readerConsumesKey(key: string): boolean {\n    if (!key) return false;\n    if (this.#flash.isOpen) return true;`,
    `  private readerConsumesKey(key: string): boolean {\n    if (!key) return false;\n    if (this.#selectionActions.isOpen || this.#flash.isOpen) return true;`,
    'selection palette key ownership',
  );
  text = replaceOnce(
    text,
    `      case 'flashText':\n        if (\n          this.state.mode === 'normal' ||\n          this.state.mode === 'cursor' ||\n          this.state.mode === 'visual'\n        )\n          this.#flash.open(pdfWindow, this.state.mode);\n        break;`,
    `      case 'flashText':\n        if (this.state.mode === 'visual') this.#flash.open(pdfWindow, 'visual-end');\n        break;`,
    'Flash endpoint execution',
  );
  text = replaceOnce(
    text,
    `      case 'enterVisual':\n        if (this.modeEnabled('visual')) this.enterVisual(pdfWindow);\n        break;\n      case 'enterCursor':\n        if (this.modeEnabled('cursor')) this.enterCursor(pdfWindow);\n        break;`,
    `      case 'enterVisual':\n        if (this.modeEnabled('visual')) this.enterVisual(pdfWindow);\n        break;\n      case 'openSelectionActions':\n        this.openSelectionActions(pdfWindow);\n        break;`,
    'Visual action entry',
  );
  text = replaceOnce(
    text,
    `      case 'highlightPurple':\n        void this.highlight(pdfWindow, COLORS.purple);\n        break;\n      case 'addNote':`,
    `      case 'highlightPurple':\n        void this.highlight(pdfWindow, COLORS.purple);\n        break;\n      case 'underlineSelection':\n        void this.highlight(pdfWindow, this.defaultHighlightColor(), false, 'underline');\n        break;\n      case 'addNote':`,
    'underline execution',
  );
  text = replaceRegexOnce(
    text,
    /      case 'cursorDown':[\s\S]*?      case 'cursorToVisual':\n        this\.cursorToVisual\(pdfWindow\);\n        break;\n/,
    '',
    'cursor execute switch',
  );
  text = replaceOnce(
    text,
    `    style.textContent =\n      '.textLayer,.textLayer span{user-select:text!important;-moz-user-select:text!important}.textLayer span{cursor:text!important}.textLayer ::selection{background:rgba(0,140,255,.6)!important;color:inherit!important}@keyframes zv-cursor-blink{0%,100%{opacity:1}50%{opacity:0}}';`,
    `    style.textContent =\n      '.textLayer,.textLayer span{user-select:text!important;-moz-user-select:text!important}.textLayer span{cursor:text!important}.textLayer ::selection{background:rgba(0,82,220,.82)!important;color:#fff!important;text-shadow:0 0 1px rgba(0,0,0,.45)!important}';`,
    'strong PDF selection style',
  );
  text = replaceOnce(
    text,
    `  private setMode(mode: ReaderMode): void {\n    if (this.#flash.isOpen) this.#flash.cancel();`,
    `  private setMode(mode: ReaderMode): void {\n    const previousMode = this.state.mode;\n    if (this.#flash.isOpen) this.#flash.cancel();`,
    'setMode previous state',
  );
  text = replaceOnce(
    text,
    `    if (mode !== 'normal') this.#smoothScroller.stop(true);\n    this.#inputRevision += 1;`,
    `    if (previousMode === 'visual' && mode !== 'visual') {\n      this.#selectionActions.close();\n      this.#dependencies.controller.clearSelectionOwner(this);\n    }\n    if (mode !== 'normal') this.#smoothScroller.stop(true);\n    this.#inputRevision += 1;`,
    'Visual exit cleanup',
  );
  text = replaceOnce(
    text,
    `    if (mode !== 'visual' && mode !== 'cursor') this.removeVisualCursor(this.state.activePdfWindow);`,
    `    if (mode !== 'visual') this.removeVisualCursor(this.state.activePdfWindow);`,
    'visual endpoint cleanup',
  );
  text = replaceRegexOnce(
    text,
    /    indicator\.textContent = `-- \$\{this\.state\.mode\.toUpperCase\(\)\} --\$\{this\.state\.countBuffer \|\| this\.state\.keyBuffer \? `  \$\{this\.state\.countBuffer\}\$\{this\.state\.keyBuffer\}` : ''\}`;\n    indicator\.style\.color = this\.state\.mode === 'normal' \? THEME_VARS\.text : THEME_VARS\.onAccent;\n    indicator\.style\.background =\n      this\.state\.mode === 'visual'\n        \? THEME_VARS\.accent\n        : this\.state\.mode === 'cursor'\n          \? THEME_VARS\.warning\n          : this\.state\.mode === 'insert'\n            \? THEME_VARS\.success\n            : THEME_VARS\.elevated;/,
    `    if (this.state.mode === 'visual') {\n      const selected = annotationText(this.activePdfWindow().getSelection()?.toString() ?? '');\n      const pending = this.state.countBuffer || this.state.keyBuffer;\n      indicator.textContent = \`SELECT · \${selected.length} chars · Enter actions · s Flash · Esc cancel\${pending ? \`  \${this.state.countBuffer}\${this.state.keyBuffer}\` : ''}\`;\n      indicator.style.color = THEME_VARS.onAccent;\n      indicator.style.background = THEME_VARS.accent;\n      return;\n    }\n    indicator.textContent = \`-- \${this.state.mode.toUpperCase()} --\${this.state.countBuffer || this.state.keyBuffer ? \`  \${this.state.countBuffer}\${this.state.keyBuffer}\` : ''}\`;\n    indicator.style.color = this.state.mode === 'normal' ? THEME_VARS.text : THEME_VARS.onAccent;\n    indicator.style.background =\n      this.state.mode === 'insert' ? THEME_VARS.success : THEME_VARS.elevated;`,
    'Select indicator',
  );
  text = replaceRegexOnce(
    text,
    /  private activateFlashTarget\(mode: FlashMode,[\s\S]*?\n  private modifySelection\(/,
    `  private activateFlashTarget(\n    intent: FlashIntent,\n    pdfWindow: PdfWindow,\n    target: FlashSelectionTarget,\n  ): void {\n    if (!target.start.textNode.isConnected || !target.end.textNode.isConnected) return;\n    const selection = pdfWindow.getSelection();\n    if (!selection) return;\n    this.state.visualPreferredX = null;\n    if (intent === 'visual-start') {\n      this.state.visualAnchor = target.start;\n      this.setMode('visual');\n      selection.setBaseAndExtent(\n        target.start.textNode,\n        target.start.offset,\n        target.end.textNode,\n        target.end.offset,\n      );\n      this.updateVisualCursor(pdfWindow, true);\n      this.showStatus('✓ selection started', 650);\n      return;\n    }\n    if (this.state.mode !== 'visual') return;\n    this.ensureVisualAnchor(pdfWindow);\n    const anchor = this.state.visualAnchor;\n    if (!anchor?.textNode.isConnected) return;\n    const focus = this.comparePointers(target.end, anchor) <= 0 ? target.start : target.end;\n    selection.setBaseAndExtent(anchor.textNode, anchor.offset, focus.textNode, focus.offset);\n    this.updateVisualCursor(pdfWindow, true);\n    this.showStatus('✓ selection updated', 650);\n  }\n\n  private comparePointers(left: Pointer, right: Pointer): number {\n    if (left.textNode === right.textNode) return left.offset - right.offset;\n    const compare = left.textNode.compareDocumentPosition?.(right.textNode) ?? 0;\n    if (compare & 4) return -1;\n    if (compare & 2) return 1;\n    return 0;\n  }\n\n  private enterVisual(pdfWindow: PdfWindow): void {\n    const selection = pdfWindow.getSelection();\n    this.state.visualAnchor = null;\n    this.state.visualPreferredX = null;\n    if (selection && !selection.isCollapsed && isTextNode(selection.anchorNode)) {\n      this.state.visualAnchor = { textNode: selection.anchorNode, offset: selection.anchorOffset };\n      this.setMode('visual');\n      this.updateVisualCursor(pdfWindow, true);\n      return;\n    }\n    this.#flash.open(pdfWindow, 'visual-start');\n  }\n\n  private firstTextPosition(pdfWindow: PdfWindow): { textNode: Text; offset: number } | null {\n    const span = pdfWindow.document.querySelector('.textLayer span') as HTMLElement | null;\n    const text = span?.firstChild ?? null;\n    return isTextNode(text) ? { textNode: text, offset: 0 } : null;\n  }\n\n  private modifySelection(`,
    'Flash/Visual/Cursor implementation block',
  );
  text = replaceOnce(
    text,
    `  private updateVisualCursor(pdfWindow: PdfWindow, autoPan: boolean): void {\n    this.removeVisualCursor(pdfWindow);\n    if (this.state.mode !== 'visual' && this.state.mode !== 'cursor') return;`,
    `  private updateVisualCursor(pdfWindow: PdfWindow, autoPan: boolean): void {\n    this.removeVisualCursor(pdfWindow);\n    if (this.state.mode !== 'visual') return;`,
    'visual endpoint mode guard',
  );
  text = replaceOnce(
    text,
    `    cursor.style.cssText = \`position:fixed;left:\${rect.left}px;top:\${rect.top}px;height:\${Math.max(12, rect.height)}px;width:2px;background:#f9e2af;z-index:99997;pointer-events:none;animation:zv-cursor-blink 1s step-end infinite;\`;\n    pdfWindow.document.body?.appendChild(cursor);`,
    `    cursor.style.cssText = \`position:fixed;left:\${rect.left}px;top:\${rect.top}px;height:\${Math.max(12, rect.height)}px;width:3px;background:#0057d9;z-index:99997;pointer-events:none;box-shadow:0 0 0 1px #fff,0 0 0 2px #0057d9;border-radius:1px;\`;\n    pdfWindow.document.body?.appendChild(cursor);\n    this.#dependencies.controller.noteSelectionOwner(this);\n    this.updateIndicator();`,
    'strong Visual endpoint',
  );
  text = replaceOnce(
    text,
    `  private async highlight(\n    pdfWindow: PdfWindow,\n    color: AnnotationColor,\n    focusComment = false,\n  ): Promise<void> {`,
    `  private async highlight(\n    pdfWindow: PdfWindow,\n    color: AnnotationColor,\n    focusComment = false,\n    annotationType: 'highlight' | 'underline' = 'highlight',\n  ): Promise<void> {`,
    'annotation type parameter',
  );
  text = text.replaceAll(
    `        color,\n        focusComment,\n      );`,
    `        color,\n        focusComment,\n        annotationType,\n      );`,
  );
  text = replaceOnce(
    text,
    `      color,\n      focusComment,\n    );\n    selection.removeAllRanges();`,
    `      color,\n      focusComment,\n      annotationType,\n    );\n    selection.removeAllRanges();\n    if (!focusComment) this.setMode('normal');`,
    'selection annotation completion',
  );
  text = replaceOnce(
    text,
    `  private async createAnnotation(\n    text: string,\n    position: unknown,\n    sortIndex: string | undefined,\n    pageLabel: string | undefined,\n    color: AnnotationColor,\n    focusComment: boolean,\n  ): Promise<void> {`,
    `  private async createAnnotation(\n    text: string,\n    position: unknown,\n    sortIndex: string | undefined,\n    pageLabel: string | undefined,\n    color: AnnotationColor,\n    focusComment: boolean,\n    annotationType: 'highlight' | 'underline',\n  ): Promise<void> {`,
    'create annotation type',
  );
  text = replaceOnce(
    text,
    `      item.annotationType = 'highlight';`,
    `      item.annotationType = annotationType;`,
    'annotation type assignment',
  );
  text = replaceOnce(
    text,
    `  private copySelection(pdfWindow: PdfWindow): void {`,
    `  selectionContext(): ReaderSelectionContext | null {\n    if (this.state.mode !== 'visual') return null;\n    const pdfWindow = this.activePdfWindow();\n    const selection = pdfWindow.getSelection();\n    if (!selection || selection.isCollapsed) return null;\n    const text = annotationText(selection.toString());\n    if (!text) return null;\n    const computed = this.computeSelectionPosition(pdfWindow, selection);\n    return {\n      text,\n      itemID: this.#dependencies.reader.itemID ?? null,\n      pageLabel: computed?.pageLabel ?? null,\n      position: computed?.position ?? null,\n    };\n  }\n\n  private openSelectionActions(pdfWindow: PdfWindow): void {\n    const context = this.selectionContext();\n    if (!context) {\n      this.showStatus('✗ no selection', 1500);\n      return;\n    }\n    this.#dependencies.controller.noteSelectionOwner(this);\n    this.#selectionActions.open(pdfWindow, context);\n  }\n\n  private selectionActionDefinitions(\n    context: ReaderSelectionContext,\n    pdfWindow: PdfWindow,\n  ): readonly ReaderSelectionActionDefinition[] {\n    const language = this.keyGuideLanguage();\n    const actions: ReaderSelectionActionDefinition[] = [];\n    const translate = zoteroRuntime().PDFTranslate?.api?.translate;\n    const pluginID = this.#dependencies.controller.pluginID;\n    if (typeof translate === 'function' && pluginID) {\n      actions.push({\n        id: 'pdf-translate.translate',\n        label: language === 'zh-CN' ? '翻译' : 'Translate',\n        run: async (selection) => {\n          const task = await translate(selection.text, {\n            pluginID,\n            ...(selection.itemID === null ? {} : { itemID: selection.itemID }),\n          });\n          const result = task.result?.trim();\n          if (!result) throw new Error('empty translation result');\n          return { title: language === 'zh-CN' ? '翻译结果' : 'Translation', body: result };\n        },\n      });\n    }\n    const addBuiltIn = (id: string, action: ActionId): void => {\n      actions.push({\n        id,\n        label: ACTION_LABELS[action][language],\n        run: () => this.executeAction(action, 1, pdfWindow),\n      });\n    };\n    addBuiltIn('neo.highlight-yellow', 'highlightYellow');\n    addBuiltIn('neo.underline', 'underlineSelection');\n    addBuiltIn('neo.add-note', 'addNote');\n    addBuiltIn('neo.highlight-red', 'highlightRed');\n    addBuiltIn('neo.highlight-green', 'highlightGreen');\n    addBuiltIn('neo.highlight-blue', 'highlightBlue');\n    addBuiltIn('neo.highlight-purple', 'highlightPurple');\n    addBuiltIn('neo.copy', 'copySelection');\n    addBuiltIn('neo.search', 'searchSelection');\n    actions.push(...this.#dependencies.controller.registeredSelectionActions(context));\n    return actions;\n  }\n\n  private copySelection(pdfWindow: PdfWindow): void {`,
    'selection action methods',
  );

  const forbidden = [
    "'cursor'",
    'cursorPreferredX',
    'enterCursor(',
    'cursorToVisual(',
    'moveCursor(',
    'moveCursorLine(',
    'moveCursorBoundary(',
    'FlashMode',
  ];
  for (const token of forbidden) if (text.includes(token)) throw new Error(`legacy controller token: ${token}`);
  write(path, text);
}

// Capability tests now assert the reduced mode set and new Select actions.
{
  const path = 'tests/unit/action-capabilities.test.ts';
  let text = read(path);
  text = replaceOnce(text, '  READER_LOCAL_CURSOR_ACTIONS,\n', '', 'cursor test import');
  text = replaceOnce(
    text,
    `    sameActions(actionsForBindingMode('visual'), READER_LOCAL_VISUAL_ACTIONS);\n    sameActions(actionsForBindingMode('cursor'), READER_LOCAL_CURSOR_ACTIONS);\n    sameActions(actionsForBindingMode('insert'), READER_LOCAL_INSERT_ACTIONS);`,
    `    sameActions(actionsForBindingMode('visual'), READER_LOCAL_VISUAL_ACTIONS);\n    sameActions(actionsForBindingMode('insert'), READER_LOCAL_INSERT_ACTIONS);`,
    'binding capability cursor test',
  );
  text = replaceOnce(
    text,
    `    expect(isReaderActionForMode('visual', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);\n    expect(isReaderActionForMode('cursor', 'cursorDown')).toBe(true);\n    expect(isReaderActionForMode('cursor', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('normal', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('cursor', 'scrollDown')).toBe(false);`,
    `    expect(isReaderActionForMode('visual', 'flashText')).toBe(true);\n    expect(isReaderActionForMode('visual', 'openSelectionActions')).toBe(true);\n    expect(isReaderActionForMode('visual', 'underlineSelection')).toBe(true);\n    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);\n    expect(isReaderActionForMode('normal', 'flashText')).toBe(false);`,
    'Reader mode guard assertions',
  );
  write(path, text);
}

{
  const path = 'tests/unit/binding-editor.test.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `    const edits: readonly Pick<BindingEditorRow, 'mode' | 'action'>[] = [\n      { mode: 'visual', action: 'extendDown' },\n      { mode: 'cursor', action: 'cursorDown' },\n      { mode: 'insert', action: 'exitMode' },\n      { mode: 'main', action: 'mainTabPick' },\n      { mode: 'normal', action: 'scrollBottom' },\n    ];`,
    `    const edits: readonly Pick<BindingEditorRow, 'mode' | 'action'>[] = [\n      { mode: 'visual', action: 'extendDown' },\n      { mode: 'insert', action: 'exitMode' },\n      { mode: 'main', action: 'mainTabPick' },\n      { mode: 'normal', action: 'scrollBottom' },\n      { mode: 'visual', action: 'openSelectionActions' },\n    ];`,
    'binding editor mode edits',
  );
  write(path, text);
}

// README/user docs describe the actual product model rather than the removed caret mode.
{
  const path = 'README.md';
  let text = read(path);
  text = replaceOnce(
    text,
    '- Normal, Cursor, Visual, and Insert modes for PDF reading and annotation.',
    '- Normal, Select (Visual), and Insert modes, with Flash-assisted PDF text selection and actions.',
    'README modes',
  );
  write(path, text);
}

{
  const path = 'docs/USER_GUIDE.md';
  let text = read(path);
  text = replaceRegexOnce(
    text,
    /The plugin operates in four modes,[\s\S]*?Cursor ──v──▶ Visual ──v\/Escape──▶ Normal\n```/,
    `The plugin has three user-facing Reader states. Flash is a temporary targeting motion inside\nthe Select workflow rather than a separate mode.\n\n| Mode       | Indicator | Purpose |\n| ---------- | --------- | ------- |\n| **Normal** | _(hidden)_ | Reading, navigation, and existing-annotation commands |\n| **Select** (internal name: Visual) | \`SELECT · …\` | Select PDF text, refine endpoints, and run actions |\n| **Insert** | \`-- INSERT --\` | Native/comment text input |\n\nMode transitions:\n\n\`\`\`\nNormal ──v──▶ Flash start ──target──▶ Select ──v/Escape──▶ Normal\n                                      │\n                                      └──s──▶ Flash endpoint ──target──▶ Select\nNormal ──i──▶ Insert ──Escape────────────────────────────▶ Normal\n\`\`\``,
    'user guide modes',
  );
  text = replaceRegexOnce(
    text,
    /#### Flash visible text[\s\S]*?#### Follow PDF links/,
    `#### Select text with Flash\n\n| Key | Action |\n| --- | ------ |\n| \`v\` | Start a text selection; with no existing mouse selection this opens Flash for the start target |\n| \`s\` in Select | Flash to a distant endpoint while preserving the current anchor |\n\nPress \`v\`, type an ASCII/Latin literal query, then choose the displayed label. The whole matched\nquery becomes the initial selection, so there is no intermediate caret mode. Flash updates the visible\nmatch count on every keystroke. When at most 48 targets remain, labels appear immediately; larger\nresult sets show the count plus \`type more\` and skip per-target geometry until the query narrows.\nLabel first letters cannot be valid next characters of the current matches, so continuing the query and\nchoosing a label remain unambiguous. \`Enter\` chooses the nearest labelled target and \`Escape\` cancels.\n\nOnce Select is active, \`h/l/w/b/j/k/0/$/(/)/{/}\` refine the range and \`o\` swaps the active end.\nPress \`s\` to use Flash for the other endpoint. The selection and active endpoint use high-contrast\nvisuals, and the persistent \`SELECT\` indicator shows the selected character count and action hints.\n\n#### Follow PDF links`,
    'user guide Flash section',
  );
  text = replaceRegexOnce(
    text,
    /#### Mode switches\n\n\| Key \| Action[\s\S]*?### Insert mode/,
    `#### Selection workflow\n\n| Key | Action |\n| --- | ------ |\n| \`v\` | Start Select with Flash, or adopt an existing mouse selection |\n| \`s\` | While selecting, Flash to the other endpoint |\n| \`Enter\` / \`a\` | Open Selection Actions |\n| \`zy/zr/zg/zb/zp\` | Create a coloured highlight directly |\n| \`za\` / \`i\` | Create a highlight and open its comment editor |\n| \`y\` | Copy the selected text |\n| \`#\` | Search for the selected text |\n| \`o\` | Swap selection anchor/focus |\n| \`v\` / \`Escape\` | Cancel Select and return to Normal |\n\nSelection Actions is a keyboard palette over the current range. It includes highlights, underline,\nadd note, copy, and search. If **Translate for Zotero** is installed, **Translate** appears automatically\nand uses that plugin's public translation API; its result stays in the palette and can be copied with\n\`y\`. Other plugins can add actions through \`Zotero.Neo.reader.registerSelectionAction(...)\`, while\ncustom scripts such as Actions & Tags can read \`Zotero.Neo.reader.getSelection()\`.\n\nThe old PDF Cursor mode has been removed: a standalone caret had no useful PDF action surface, and\nall text-oriented work now goes through one Select workflow.\n\n---\n\n### Insert mode`,
    'user guide cursor/visual section',
  );
  text = replaceRegexOnce(
    text,
    /### Creating a highlight from scratch\n\n1\.[\s\S]*?add a note\./,
    `### Creating a highlight from scratch\n\n1. Press \`v\` and type enough text to identify the selection start. Choose its Flash label; the whole\n   matched query becomes selected immediately.\n2. Refine locally with Select motions, or press \`s\` and Flash to the distant endpoint. Use \`o\` to\n   swap which end is active.\n3. Press \`Enter\`/\`a\` for Selection Actions, or use \`zy\`/\`zr\`/\`zg\`/\`zb\`/\`zp\` directly.\n   Underline and translation are available from Selection Actions when supported.`,
    'highlight workflow',
  );
  write(path, text);
}

{
  const path = 'docs/DEVELOPMENT.md';
  let text = read(path);
  text = text.replaceAll('Cursor/Visual `j` and `k`', 'Visual `j` and `k`');
  text += `\n\n### Reader text selection and external actions\n\nPDF text interaction is intentionally one workflow: Normal \`v\` opens \`ReaderFlash\` for a start\nrange unless a native selection already exists; successful targeting enters internal \`visual\` mode\n(the UI calls it **SELECT**). Visual \`s\` reuses Flash for the far endpoint. Cursor mode no longer\nexists. Flash owns only temporary query/index/label DOM; \`ReaderSession\` owns the persistent range\nanchor and ordinary selection motions.\n\n\`ReaderSelectionActions\` owns the keyboard action palette and result view. Its inputs are immutable\n\`ReaderSelectionContext\` snapshots rather than DOM nodes. Built-ins remain Reader actions; Translate\nfor Zotero is discovered through its documented \`Zotero.PDFTranslate.api.translate\` API. A small public\nextension seam is exposed as \`Zotero.Neo.reader.getSelection()\` and\n\`registerSelectionAction(...)\`; integrations must use this contract instead of reaching into\n\`ReaderSession\` or PDF.js private nodes.\n`;
  write(path, text);
}
