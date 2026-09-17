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

console.log('pre-release architecture follow-up fixes staged');
