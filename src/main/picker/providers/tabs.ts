import type { MainWindow } from '../../../core/contracts';
import { mainTabList, selectedMainTabID } from '../../host';
import type { PickerProvider } from '../types';

export function createTabsProvider(window: MainWindow): PickerProvider {
  return {
    title: 'Tabs',
    placeholder: '> Search tab titles…',
    async load() {
      const selected = selectedMainTabID(window);
      return mainTabList(window).flatMap((tab) => {
        const id = tab.id ?? tab.tabID ?? tab.dataset?.id;
        return id
          ? [
              {
                id,
                title: tab.title ?? tab.label ?? tab.dataset?.title ?? id,
                kind: tab.type ?? tab.dataset?.type ?? 'tab',
                selected: id === selected,
                search: `${tab.title ?? tab.label ?? id} ${id}`.toLowerCase(),
              },
            ]
          : [];
      });
    },
    rowText: (item) => item.title,
    preview: (item) => ({ title: item.title, body: item.kind ?? 'tab' }),
  };
}
