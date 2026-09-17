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

console.log('pre-release architecture follow-up fixes staged');
