import type { MainWindow } from '../../core/contracts';
import { t, type AppLanguage } from '../../i18n';
import { mainTabList, selectedMainTabID } from '../../toolkit/main';
import type { PickerProvider } from '../../main/picker/types';

export function createTabsProvider(
  window: MainWindow,
  language: AppLanguage = 'en',
): PickerProvider {
  return {
    title: t('picker.tabs', language),
    placeholder: t('picker.searchTabs', language),
    async load() {
      const selected = selectedMainTabID(window);
      return mainTabList(window).flatMap((tab) => {
        const id = tab.id;
        return id
          ? [
              {
                id,
                title: tab.displayTitle ?? id,
                kind: tab.kind,
                selected: id === selected,
                search: `${tab.title ?? tab.label ?? id} ${id}`.toLowerCase(),
              },
            ]
          : [];
      });
    },
    rowText: (item) => item.title,
    preview: (item) => ({
      title: item.title,
      body: t(
        item.kind?.startsWith('reader')
          ? 'picker.readerTab'
          : item.kind === 'library'
            ? 'picker.libraryTab'
            : 'picker.tab',
        language,
      ),
    }),
  };
}
