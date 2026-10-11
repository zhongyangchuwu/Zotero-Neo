import type { CommandPaletteContext } from '../../../core/contracts';
import { actionsForBindingMode } from '../../../input/binding-capabilities';
import { ACTION_LABELS, isActionId, type ActionId } from '../../../input/actions';
import { t } from '../../../i18n';
import {
  actionGroup,
  contextLabel,
  groupLabel,
  shortcutsForAction,
} from '../../../input/shortcut-catalog';
import type { PickerItem } from '../model';
import type { PickerPreview, PickerProvider } from '../types';

function isSupportedAction(context: CommandPaletteContext, action: unknown): action is ActionId {
  return isActionId(action) && actionsForBindingMode(context.bindingMode).includes(action);
}

function commandItems(context: CommandPaletteContext): PickerItem[] {
  const actions = [...new Set(context.actions)].filter(
    (action): action is ActionId =>
      isSupportedAction(context, action) && action !== 'openCommandPalette',
  );
  const owner = contextLabel(context.bindingMode, context.language);
  return actions
    .sort((left, right) => {
      const groupOrder = groupLabel(actionGroup(left), context.language).localeCompare(
        groupLabel(actionGroup(right), context.language),
      );
      const labelOrder = ACTION_LABELS[left][context.language].localeCompare(
        ACTION_LABELS[right][context.language],
      );
      return groupOrder || labelOrder || left.localeCompare(right);
    })
    .map((action) => {
      const title = ACTION_LABELS[action][context.language];
      const keys = shortcutsForAction(context.bindings, context.bindingMode, action);
      const keyHint = keys.length ? keys.join(', ') : t('common.unbound', context.language);
      const group = groupLabel(actionGroup(action), context.language);
      return {
        id: action,
        title,
        search:
          `${action} ${title} ${keyHint} ${owner} ${context.bindingMode} ${group}`.toLowerCase(),
        kind: 'command',
        meta: keyHint,
      };
    });
}

export function createCommandsProvider(context: CommandPaletteContext): PickerProvider {
  const unbound = t('common.unbound', context.language);
  return {
    title: t('palette.title', context.language),
    placeholder: t(
      context.mode === 'normal'
        ? 'palette.readerPrompt'
        : context.mode === 'note'
          ? 'palette.notePrompt'
          : 'palette.mainPrompt',
      context.language,
    ),
    load: async () => commandItems(context),
    rowText: (item) => {
      const group = isActionId(item.id) ? groupLabel(actionGroup(item.id), context.language) : '';
      return `${item.title} · ${group} · ${item.meta ?? unbound}`;
    },
    preview: (item): PickerPreview => ({
      title: item.title,
      body: [
        contextLabel(context.bindingMode, context.language),
        isActionId(item.id) ? groupLabel(actionGroup(item.id), context.language) : '',
        `${t('settings.Action', context.language)}: ${item.id}`,
        `${t('settings.Current shortcuts', context.language)}: ${item.meta ?? unbound}`,
      ].join('\n'),
    }),
  };
}
