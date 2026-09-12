import type { CommandPaletteContext } from '../../../core/contracts';
import { ACTION_LABELS, isActionId, type ActionId } from '../../../input/actions';
import { parseBindingKey } from '../../../input/bindings';
import type { PickerItem } from '../model';
import type { PickerPreview, PickerProvider } from '../types';

function displayKey(sequence: string): string {
  return sequence.startsWith(' ') ? `<space>${sequence.slice(1)}` : sequence;
}

function commandItems(context: CommandPaletteContext): PickerItem[] {
  const keysByAction = new Map<ActionId, string[]>();
  for (const [bindingKey, action] of Object.entries(context.bindings)) {
    const binding = parseBindingKey(bindingKey);
    if (!binding || binding.mode !== context.mode || action === 'openCommandPalette') continue;
    const keys = keysByAction.get(action) ?? [];
    keys.push(displayKey(binding.sequence));
    keysByAction.set(action, keys);
  }

  return [...keysByAction.entries()]
    .sort(([left], [right]) => {
      const labelOrder = ACTION_LABELS[left][context.language].localeCompare(
        ACTION_LABELS[right][context.language],
      );
      return labelOrder || left.localeCompare(right);
    })
    .map(([action, keys]) => {
      const title = ACTION_LABELS[action][context.language];
      const keyHint = keys.join(', ');
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
    rowText: (item) => (item.meta ? `${item.title} · ${item.meta}` : item.title),
    preview: (item): PickerPreview => ({
      title: item.title,
      body: [`Action: ${item.id}`, item.meta ? `Keys: ${item.meta}` : 'Keys: (unbound)'].join('\n'),
    }),
    closeBeforeActivate: true,
    activate(item) {
      if (isActionId(item.id) && item.id !== 'openCommandPalette') context.execute(item.id, 0);
    },
  };
}
