import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing refactor anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0)
    throw new Error(`Ambiguous refactor anchor: ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

const controllerPath = 'src/reader/controller.ts';
let controller = fs.readFileSync(controllerPath, 'utf8');
controller = replaceOnce(
  controller,
  "import { ReaderTextHints } from './text-hints';\n",
  "import { hintLabels } from './hint-labels';\nimport { ReaderTextHints } from './text-hints';\n",
  'shared hint label import',
);
controller = replaceOnce(
  controller,
  '    const labels = this.hintLabels(targets.length);',
  '    const labels = hintLabels(targets.length);',
  'Follow Link hint labels',
);
fs.writeFileSync(controllerPath, controller);

const testPath = 'tests/unit/reader-text-navigation.test.ts';
let test = fs.readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  "    const { session, pdfWindow } = createTextSession(['Alpha', '   ', 'Beta']);",
  "    const { session, appended } = createTextSession(['Alpha', '   ', 'Beta']);",
  'label characterization fixture',
);
fs.writeFileSync(testPath, test);
