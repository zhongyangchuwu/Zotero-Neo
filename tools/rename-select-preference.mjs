import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  const text = fs.readFileSync(path, 'utf8');
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate anchor: ${label}`);
  fs.writeFileSync(path, text.slice(0, first) + to + text.slice(first + from.length));
}

replaceOnce(
  'src/preferences/index.ts',
  "    'zv.mode.visual': 'Enable Visual mode (v — select text and annotate)',",
  "    'zv.mode.visual': 'Enable Select mode (v — Flash-select text and run actions)',",
  'English Select preference',
);
replaceOnce(
  'src/preferences/index.ts',
  "    'zv.mode.visual': '启用可视模式（v — 选择文本并标注）',",
  "    'zv.mode.visual': '启用选择模式（v — 用 Flash 选择文本并执行操作）',",
  'Chinese Select preference',
);
replaceOnce(
  'assets/package/content/preferences/pane.xhtml',
  '        label="Enable Visual mode (v — select text and annotate)" />',
  '        label="Enable Select mode (v — Flash-select text and run actions)" />',
  'Select preference fallback',
);
