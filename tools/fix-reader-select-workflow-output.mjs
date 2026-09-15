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
    `interface SessionDependencies {\n  readonly controller: ReaderController;\n  readonly reader: ReaderRuntime;\n  readonly firstPdfWindow: PdfWindow;\n  readonly bindings: () => BindingMap;\n  readonly release: () => void;\n}`,
    `interface SessionSelectionBridge {\n  readonly registered: (\n    context: ReaderSelectionContext,\n  ) => readonly ReaderSelectionActionDefinition[];\n  readonly noteOwner: (session: ReaderSession) => void;\n  readonly clearOwner: (session: ReaderSession) => void;\n  readonly pluginID: () => string | null;\n}\n\ninterface SessionDependencies {\n  readonly controller: ReaderController;\n  readonly reader: ReaderRuntime;\n  readonly firstPdfWindow: PdfWindow;\n  readonly bindings: () => BindingMap;\n  readonly release: () => void;\n  readonly selection?: SessionSelectionBridge;\n}`,
    'selection bridge interface',
  ],
  [
    `        bindings: () => resolveBindings(this.#dependencies.preferences.get('bindings', '')),\n        release: () => this.#release(instanceID, reader),\n      });`,
    `        bindings: () => resolveBindings(this.#dependencies.preferences.get('bindings', '')),\n        release: () => this.#release(instanceID, reader),\n        selection: {\n          registered: (context) => this.registeredSelectionActions(context),\n          noteOwner: (owner) => this.noteSelectionOwner(owner),\n          clearOwner: (owner) => this.clearSelectionOwner(owner),\n          pluginID: () => this.pluginID,\n        },\n      });`,
    'selection bridge construction',
  ],
  [
    '      actions: (context) => this.selectionActionDefinitions(context, this.activePdfWindow()),\n',
    '      actions: (context, pdfWindow) => this.selectionActionDefinitions(context, pdfWindow),\n',
    'selection palette owner view',
  ],
  [
    `    this.#commentEditor.dispose();\n    this.#selectionActions.dispose();\n    this.#dependencies.controller.clearSelectionOwner(this);\n    this.#flash.dispose();`,
    `    this.#commentEditor.dispose();\n    this.#selectionActions.dispose();\n    this.#dependencies.selection?.clearOwner(this);\n    this.#flash.dispose();`,
    'dispose selection owner bridge',
  ],
  [
    `    if (previousMode === 'visual' && mode !== 'visual') {\n      this.#selectionActions.close();\n      this.#dependencies.controller.clearSelectionOwner(this);\n    }`,
    `    if (previousMode === 'visual' && mode !== 'visual') {\n      this.#selectionActions.close();\n      this.#dependencies.selection?.clearOwner(this);\n    }`,
    'mode exit selection owner bridge',
  ],
  [
    '    this.#dependencies.controller.noteSelectionOwner(this);\n    this.updateIndicator();\n',
    '    this.#dependencies.selection?.noteOwner(this);\n    this.updateIndicator();\n',
    'selection endpoint owner bridge',
  ],
  [
    '    this.#dependencies.controller.noteSelectionOwner(this);\n    this.#selectionActions.open(pdfWindow, context);\n',
    '    this.#dependencies.selection?.noteOwner(this);\n    this.#selectionActions.open(pdfWindow, context);\n',
    'selection palette owner bridge',
  ],
  [
    '    const pluginID = this.#dependencies.controller.pluginID;\n',
    '    const pluginID = this.#dependencies.selection?.pluginID() ?? null;\n',
    'PDF Translate plugin id bridge',
  ],
  [
    '    actions.push(...this.#dependencies.controller.registeredSelectionActions(context));\n',
    '    actions.push(...(this.#dependencies.selection?.registered(context) ?? []));\n',
    'registered action bridge',
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

patchFile('tests/unit/binding-editor-view.test.ts', [
  [
    "    for (const mode of ['normal', 'visual', 'cursor', 'insert', 'main'] as const) {\n",
    "    for (const mode of ['normal', 'visual', 'insert', 'main'] as const) {\n",
    'binding editor visible modes',
  ],
]);
