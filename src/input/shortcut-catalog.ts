import { t } from '../i18n';
import { ACTION_LABELS, type ActionId } from './actions';
import { actionsForBindingMode } from './binding-capabilities';
import {
  BINDING_CONTEXTS,
  DEFAULT_BINDINGS,
  parseBindingKey,
  type BindingContext,
  type BindingMap,
} from './bindings';
import { bindingSequenceTokens } from './key-sequence';

export type ShortcutLanguage = 'en' | 'zh-CN';
export const ACTION_GROUPS = [
  'navigation',
  'reader',
  'annotations',
  'selection',
  'notes',
  'library',
  'interface',
  'plugins',
  'commands',
] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export function contextLabel(context: BindingContext, language: ShortcutLanguage): string {
  return t(`context.${context}`, language);
}

export function actionGroup(action: ActionId): ActionGroup {
  if (action.startsWith('note')) return 'notes';
  if (action.startsWith('ui')) return 'interface';
  if (action.startsWith('plugins') || action === 'managePlugins') return 'plugins';
  if (/Annotation|^filter|^recolor/.test(action)) return 'annotations';
  if (/^extend|^highlight|Selection|Visual|^flashText|^addNote|^underline/.test(action))
    return 'selection';
  if (
    /Reader|Page|^zoom|^scroll|Heading|Figure|Table|Bookmark|^followLink|^copyTarget|MarksExplorer/.test(
      action,
    )
  )
    return 'reader';
  if (/^navigate|Tab$|^switchTab/.test(action)) return 'navigation';
  if (/^main|^addTag|^removeTag|Collection|TagFilter|^find/.test(action)) return 'library';
  return 'commands';
}

export function groupLabel(group: ActionGroup, language: ShortcutLanguage): string {
  return t(`group.${group}`, language);
}

export function shortcutsForAction(
  bindings: BindingMap,
  context: BindingContext,
  action: ActionId,
): readonly string[] {
  return Object.entries(bindings)
    .flatMap(([key, candidate]) => {
      if (candidate !== action || !key.startsWith(`${context}:`)) return [];
      const parsed = parseBindingKey(key);
      return parsed?.mode === context ? [parsed.sequence] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function indexShortcuts(bindings: BindingMap): Readonly<Record<string, readonly string[]>> {
  const index: Record<string, string[]> = {};
  for (const [key, action] of Object.entries(bindings)) {
    const parsed = parseBindingKey(key);
    if (!parsed) continue;
    const slot = `${parsed.mode}:${action}`;
    (index[slot] ?? (index[slot] = [])).push(parsed.sequence);
  }
  for (const keys of Object.values(index)) keys.sort((left, right) => left.localeCompare(right));
  return index;
}

const DEFAULT_SHORTCUTS = indexShortcuts(DEFAULT_BINDINGS);

export interface ShortcutCatalogEntry {
  readonly context: BindingContext;
  readonly action: ActionId;
  readonly group: ActionGroup;
  readonly label: string;
  readonly keys: readonly string[];
  readonly defaultKeys: readonly string[];
  readonly source: 'default' | 'custom' | 'unbound';
}

/** Includes owner-supported actions without bindings; incompatible bindings are validated separately. */
export function shortcutCatalog(
  bindings: BindingMap,
  language: ShortcutLanguage,
): readonly ShortcutCatalogEntry[] {
  const effective = bindings === DEFAULT_BINDINGS ? DEFAULT_SHORTCUTS : indexShortcuts(bindings);
  return BINDING_CONTEXTS.flatMap((context) =>
    actionsForBindingMode(context).map((action) => {
      const slot = `${context}:${action}`;
      const keys = effective[slot] ?? [];
      const defaultKeys = DEFAULT_SHORTCUTS[slot] ?? [];
      return {
        context,
        action,
        group: actionGroup(action),
        label: ACTION_LABELS[action][language],
        keys,
        defaultKeys,
        source: !keys.length
          ? ('unbound' as const)
          : keys.length === defaultKeys.length &&
              keys.every((key, index) => key === defaultKeys[index])
            ? ('default' as const)
            : ('custom' as const),
      };
    }),
  );
}

export interface NativeShortcutEntry {
  readonly context: BindingContext;
  readonly key: string;
  readonly label: string;
  readonly reservation: 'exclusive';
}

const NATIVE_KEYS: Partial<Record<BindingContext, readonly string[]>> = {
  'reader-outline': ['<Down>', '<Up>', '<Left>', '<Right>', '<Tab>', '<S-Tab>', '<Enter>'],
  'reader-marks': ['<Down>', '<Up>', '<Left>', '<Right>', '<Tab>', '<S-Tab>'],
  'reader-annotations': ['<Down>', '<Up>', '<Left>', '<Right>', '<Tab>', '<S-Tab>'],
  'reader-thumbnails': ['<Down>', '<Up>', '<Left>', '<Right>', '<Tab>', '<S-Tab>'],
  'picker-input': [
    '<Tab>',
    '<S-Tab>',
    '<BS>',
    '<Del>',
    '<Left>',
    '<Right>',
    '<Home>',
    '<End>',
    '<C-a>',
    '<C-c>',
    '<C-v>',
    '<C-x>',
    '<C-z>',
    '<C-y>',
    '<C-Insert>',
    '<S-Insert>',
  ],
  'picker-list': ['<Tab>', '<S-Tab>'],
  'plugins-input': [
    '<Tab>',
    '<S-Tab>',
    '<BS>',
    '<Del>',
    '<Left>',
    '<Right>',
    '<Home>',
    '<End>',
    '<C-a>',
    '<C-c>',
    '<C-v>',
    '<C-x>',
    '<C-z>',
    '<C-y>',
    '<C-Insert>',
    '<S-Insert>',
  ],
  'plugins-list': ['<Tab>', '<S-Tab>'],
};

/** Native records are disclosures, not editable BindingMap defaults. */
export function nativeShortcutCatalog(
  context: BindingContext | undefined,
  language: ShortcutLanguage,
): readonly NativeShortcutEntry[] {
  return (context ? [context] : BINDING_CONTEXTS).flatMap((owner) => {
    const entries: NativeShortcutEntry[] = (NATIVE_KEYS[owner] ?? []).map((key) => ({
      context: owner,
      key,
      label: t(
        owner === 'reader-outline' && key === '<Enter>'
          ? 'native.outlineActivate'
          : 'native.navigationEditing',
        language,
      ),
      reservation: 'exclusive',
    }));
    if (owner === 'picker-input' || owner === 'plugins-input') {
      entries.push({
        context: owner,
        key: 'Text / IME',
        label: t('native.textInput', language),
        reservation: 'exclusive',
      });
    }
    return entries;
  });
}

const NATIVE_TOKENS: Partial<Record<BindingContext, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries(NATIVE_KEYS).map(([context, keys]) => [
    context,
    new Set(keys.flatMap((key) => bindingSequenceTokens(key) ?? [])),
  ]),
);
const NATIVE_NAVIGATION_TOKENS = new Set([
  'tab',
  'backspace',
  'delete',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'home',
  'end',
  'enter',
]);

function nativeTokenReservation(context: BindingContext, token: string): 'exclusive' | null {
  const nativeTokens = NATIVE_TOKENS[context];
  const terminal = token.slice(token.lastIndexOf('+') + 1);
  if (
    nativeTokens?.has(token) ||
    (nativeTokens?.has(terminal) && NATIVE_NAVIGATION_TOKENS.has(terminal))
  )
    return 'exclusive';
  if (context === 'picker-input' || context === 'plugins-input') {
    if ([...token].length === 1 || (token.startsWith('shift+') && [...terminal].length === 1))
      return 'exclusive';
    if (['backspace', 'delete', 'arrowleft', 'arrowright', 'home', 'end'].includes(terminal))
      return 'exclusive';
    if (/^ctrl\+(?:alt\+)?(?:shift\+)?[acvxyz]$/i.test(token)) return 'exclusive';
  }
  return null;
}

/** Every token must remain executable: native continuations cancel the surface matcher too. */
export function nativeReservation(context: BindingContext, sequence: string): 'exclusive' | null {
  const tokens = bindingSequenceTokens(sequence);
  if (!tokens) return null;
  for (const token of tokens) {
    if (nativeTokenReservation(context, token) === 'exclusive') return 'exclusive';
  }
  return null;
}
