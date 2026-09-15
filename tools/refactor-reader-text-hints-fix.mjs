import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing refactor anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Ambiguous refactor anchor: ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

const path = 'src/reader/controller.ts';
let source = fs.readFileSync(path, 'utf8');
source = replaceOnce(
  source,
  "import { ReaderTextHints } from './text-hints';\n",
  "import { hintLabels } from './hint-labels';\nimport { ReaderTextHints } from './text-hints';\n",
  'shared hint label import',
);
source = replaceOnce(
  source,
  '    const labels = this.hintLabels(targets.length);',
  '    const labels = hintLabels(targets.length);',
  'Follow Link hint labels',
);
fs.writeFileSync(path, source);
