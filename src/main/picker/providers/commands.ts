import type { CommandPaletteContext } from '../../../core/contracts';
import { isMainExecutableAction } from '../../../main/action-capabilities';
import { isReaderNormalAction } from '../../../reader/action-capabilities';
import { ACTION_LABELS, isActionId, type ActionId } from '../../../input/actions';
import { parseBindingKey } from '../../../input/bindings';
import type { PickerItem } from '../model';
import type { PickerPreview, PickerProvider } from '../types';

const UNBOUND_LABELS = {
  en: 'Unbound',
  'zh-CN': '未绑定',
} as const;

function displayKey(sequence: string): string {
  return sequence.startsWith(' ') ? `<space>${sequence.slice(1)}` : sequence;
}
function isSupportedAction(context: CommandPaletteContext, action: unknown): action is ActionId {
  return context.mode === 'main' ? isMainExecutableAction(action) : isReaderNormalAction(action);
}

function commandItems(context: CommandPaletteContext): PickerItem[] {
  const keysByAction = new Map<ActionId, Set<string>>();
  for (const [bindingKey, action] of Object.entries(context.bindings)) {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== context.mode || !isActionId(action)) continue;
    const keys = keysByAction.get(action) ?? new Set<string>();
    keys.add(displayKey(binding.sequence));
    keysByAction.set(action, keys);
  }

  const actions = [...new Set(context.actions)].filter(
    (action): action is ActionId =>
      isSupportedAction(context, action) && action !== 'openCommandPalette',
  );
  return actions
    .sort((left, right) => {
      const labelOrder = ACTION_LABELS[left][context.language].localeCompare(
        ACTION_LABELS[right][context.language],
      );
      return labelOrder || left.localeCompare(right);
    })
    .map((action) => {
      const title = ACTION_LABELS[action][context.language];
      const keys = [...(keysByAction.get(action) ?? [])];
      const keyHint = keys.length ? keys.join(', ') : UNBOUND_LABELS[context.language];
      return {
        id: action,
        title,
        search: `${action} ${title} ${keyHint}`.toLowerCase(),
        kind: 'command',
        meta: keyHint,
      };
    });
}

export function createCommandsProvider(context: CommandPaletteContext): PickerProvider {
  return {
    title: 'Commands',
    placeholder: context.mode === 'normal' ? '> Run Reader command…' : '> Run command…',
    load: async () => commandItems(context),
    rowText: (item) => `${item.title} · ${item.meta ?? UNBOUND_LABELS[context.language]}`,
    preview: (item): PickerPreview => ({
      title: item.title,
      body: [`Action: ${item.id}`, `Keys: ${item.meta ?? UNBOUND_LABELS[context.language]}`].join(
        '\n',
      ),
    }),
    closeBeforeActivate: true,
    activate(item) {
      if (
        isActionId(item.id) &&
        item.id !== 'openCommandPalette' &&
        isSupportedAction(context, item.id)
      )
        context.execute(item.id, 0);
    },
  };
}
