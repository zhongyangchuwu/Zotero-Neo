#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

function edit(path, fn) {
  writeFileSync(path, fn(readFileSync(path, 'utf8')));
}

// Reader runtime state is independent from configurable binding modes.
edit('src/reader/types.ts', (source) =>
  source
    .replace("import type { Mode } from '../input/bindings';\n", '')
    .replace("export type ReaderMode = Exclude<Mode, 'main'>;", "export type ReaderMode = 'normal' | 'visual' | 'insert';"),
);

// Note's Main-command overlay uses the canonical configurable Main mode.
edit('src/main/note-editor.ts', (source) => source.replace("        mode: 'main',", "        mode: 'main-normal',"));

// Remaining Reader input consumers must translate runtime state to binding mode explicitly.
edit('src/reader/controller.ts', (source) => {
  source = source.replace(
`    const context = {
      mode: this.state.mode,
      keyBuffer: this.state.keyBuffer,
      countBuffer: this.state.countBuffer,
      bindings: this.#dependencies.bindings(),
      allowCountPrefix: this.state.mode === 'normal',
    };`,
`    const context = {
      mode: readerBindingMode(this.state.mode),
      keyBuffer: this.state.keyBuffer,
      countBuffer: this.state.countBuffer,
      bindings: this.#dependencies.bindings(),
      allowCountPrefix: this.state.mode === 'normal',
    };`,
  );
  source = source.replace(
`    const bindings = this.#dependencies.bindings();
    const directAction = bindings['reader-normal:' + key];
    if (!this.state.keyBuffer && (!directAction || !smoothScrollSpec(directAction))) return false;
    const decision = advanceInput(
      {
        mode: 'normal',`,
`    const bindings = this.#dependencies.bindings();
    const directAction = bindings['reader-normal:' + key];
    if (!this.state.keyBuffer && (!directAction || !smoothScrollSpec(directAction))) return false;
    const decision = advanceInput(
      {
        mode: 'reader-normal',`,
  );
  return source;
});

// New Binding Editor rows must use the canonical configurable default mode.
edit('src/preferences/binding-editor.ts', (source) =>
  source.replace("rows: [{ id, mode: 'normal', key: '', action: '' }, ...state.rows],", "rows: [{ id, mode: 'reader-normal', key: '', action: '' }, ...state.rows],"),
);

// Test fixtures follow the canonical configurable binding modes; Reader runtime-mode tests remain unchanged.
edit('tests/unit/action-capabilities.test.ts', (source) => source
  .replace(
`  MAIN_EXECUTABLE_ACTIONS,
  READER_DELEGABLE_MAIN_ACTIONS,`,
`  MAIN_EXECUTABLE_ACTIONS,
  MAIN_NORMAL_ACTIONS,
  MAIN_SELECT_ACTIONS,
  READER_DELEGABLE_MAIN_ACTIONS,`,
  )
  .replace(
`  'mainTreeCollapseAll',
];`,
`  'mainTreeCollapseAll',
  'mainEnterSelect',
  'mainSelectDown',
  'mainSelectUp',
  'mainSelectFirst',
  'mainSelectLast',
  'mainSelectSwapEnds',
  'mainSelectFinish',
  'mainSelectCancel',
];`,
  )
  .replace("sameActions(actionsForBindingMode('main'), MAIN_EXECUTABLE_ACTIONS);", "sameActions(actionsForBindingMode('main-normal'), MAIN_NORMAL_ACTIONS);\n    sameActions(actionsForBindingMode('main-select'), MAIN_SELECT_ACTIONS);")
  .replace("actionsForBindingMode('normal')", "actionsForBindingMode('reader-normal')")
  .replace("actionsForBindingMode('visual')", "actionsForBindingMode('reader-select')")
  .replace("actionsForBindingMode('insert')", "actionsForBindingMode('reader-insert')"));

edit('tests/unit/input.test.ts', (source) => source
  .replaceAll("mode: 'normal'", "mode: 'reader-normal'")
  .replaceAll("mode: 'main'", "mode: 'main-normal'"));

edit('tests/unit/key-guide.test.ts', (source) => source
  .replaceAll("leaderGuideEntries(custom, 'main'", "leaderGuideEntries(custom, 'main-normal'"));

edit('tests/unit/fuzzy-picker.test.ts', (source) => source
  .replaceAll(
    "      mode: 'main',\n      actions:",
    "      mode: 'main',\n      bindingMode: 'main-normal',\n      actions:",
  )
  .replaceAll(
    "      mode: 'normal',\n      actions:",
    "      mode: 'normal',\n      bindingMode: 'reader-normal',\n      actions:",
  ));

for (const path of ['tests/unit/binding-editor.test.ts', 'tests/unit/binding-editor-view.test.ts']) {
  edit(path, (source) => source
    .replaceAll("'normal'", "'reader-normal'")
    .replaceAll("'visual'", "'reader-select'")
    .replaceAll("'insert'", "'reader-insert'")
    .replaceAll("'main'", "'main-normal'"));
}

console.log('pre-release architecture follow-up fixes staged');
