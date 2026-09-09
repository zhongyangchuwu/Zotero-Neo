import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/legacy-contract.json'), 'utf8'),
);
const inputDir = resolve(root, 'src/input');
mkdirSync(inputDir, { recursive: true });

function tsObject(value) {
  return JSON.stringify(value, null, 2);
}

const labels = {};
for (const action of Object.keys(contract.actionLabels)) {
  labels[action] = {
    en: contract.actionLabels[action],
    'zh-CN': contract.zhActionLabels[action],
  };
}

writeFileSync(
  resolve(inputDir, 'actions.ts'),
  `export const ACTION_LABELS = ${tsObject(labels)} as const;\n\nexport type ActionId = keyof typeof ACTION_LABELS;\n\nexport const ACTION_IDS = Object.freeze(\n  Object.keys(ACTION_LABELS) as ActionId[],\n);\n\nexport function isActionId(value: unknown): value is ActionId {\n  return typeof value === 'string' && value in ACTION_LABELS;\n}\n`,
);

writeFileSync(
  resolve(inputDir, 'bindings.ts'),
  `import { isActionId, type ActionId } from './actions';\n\nexport const MODES = ['normal', 'visual', 'cursor', 'insert', 'main'] as const;\n\nexport type Mode = (typeof MODES)[number];\nexport type BindingKey = \`\${Mode}:\${string}\`;\nexport type BindingMap = Readonly<Record<string, ActionId>>;\n\nconst MODE_SET: ReadonlySet<string> = new Set(MODES);\n\nexport const DEFAULT_BINDINGS = ${tsObject(contract.bindings)} as const satisfies BindingMap;\n\nexport interface ParsedBindingKey {\n  mode: Mode;\n  sequence: string;\n}\n\nexport function parseBindingKey(value: string): ParsedBindingKey | null {\n  const separator = value.indexOf(':');\n  if (separator < 1) return null;\n  const mode = value.slice(0, separator);\n  const sequence = value.slice(separator + 1);\n  if (!MODE_SET.has(mode) || !sequence) return null;\n  return { mode: mode as Mode, sequence };\n}\n\nexport function parseCustomBindings(raw: unknown): Record<string, ActionId> {\n  if (typeof raw !== 'string' || raw === '') return {};\n  let parsed: unknown;\n  try {\n    parsed = JSON.parse(raw);\n  } catch {\n    return {};\n  }\n  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};\n\n  const result: Record<string, ActionId> = {};\n  for (const [key, action] of Object.entries(parsed)) {\n    if (!parseBindingKey(key) || !isActionId(action)) continue;\n    result[key] = action;\n  }\n  return result;\n}\n\nexport function resolveBindings(raw: unknown): BindingMap {\n  return Object.freeze({ ...DEFAULT_BINDINGS, ...parseCustomBindings(raw) });\n}\n`,
);

console.log('Generated src/input/actions.ts and src/input/bindings.ts');
