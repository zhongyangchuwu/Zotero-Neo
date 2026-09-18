import type { MainWindow } from '../../../core/contracts';
import {
  closeMainTab,
  mainTabList,
  selectMainTab,
  selectedMainTabID,
} from '../../host';
import type { MainNavigation } from '../../navigation';
import type { MainWindowSession } from '../../session';
import type { PickerItem } from '../model';
import type { PickerProvider, PickerProviderCommands } from '../types';

export function createTabsProvider(
  window: MainWindow,
  session: MainWindowSession,
  navigation: MainNavigation,
): PickerProvider {
  const load = async (): Promise<PickerItem[]> => {
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
  };
  const closeHighlighted = (commands: PickerProviderCommands): void => {
    const item = session.picker.filtered[session.picker.selected];
    if (!item) return;
    const id = String(item.id);
    if (!closeMainTab(window, id)) {
      navigation.status(session, '✗ Tab close unavailable');
      return;
    }
    session.picker.items = session.picker.items.filter((candidate) => String(candidate.id) !== id);
    const selected = selectedMainTabID(window);
    session.picker.items = session.picker.items.map((candidate) => ({
      ...candidate,
      selected: String(candidate.id) === selected,
    }));
    commands.filter();
    navigation.status(session, '✓ Tab closed', 1000);
  };

  return {
    title: 'Tabs',
    placeholder: '> Search tab titles…',
    help: {
      query: 'Search · Ctrl+j/k select · Ctrl+W close · Enter switch · Esc close',
      list: 'List · j/k select · x/dd or Ctrl+W close · Enter switch · / search · Esc close',
    },
    load,
    rowText: (item) => item.title,
    preview: (item) => ({ title: item.title, body: item.kind ?? 'tab' }),
    activate: (item) => {
      selectMainTab(window, String(item.id));
      navigation.afterTabSwitch(window);
    },
    onKeyDown(event, commands) {
      const key = event.key;
      const lower = key.toLowerCase();
      const stop = (): void => {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation();
      };
      if (event.ctrlKey && lower === 'w' && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('close highlighted tab', () => closeHighlighted(commands));
        return true;
      }
      if (event.target === session.picker.input || session.picker.focusPane === 'search') {
        event.stopPropagation();
        return false;
      }
      if (key === '/') {
        stop();
        commands.focusPane('search');
        session.picker.input?.select();
        return true;
      }
      if (lower === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        commands.enqueue('close highlighted tab', () => closeHighlighted(commands));
        return true;
      }
      if (lower === 'd' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        stop();
        if (session.picker.command === 'd') {
          session.picker.command = '';
          clearTimeout(session.picker.commandTimer);
          session.picker.commandTimer = undefined;
          commands.enqueue('close highlighted tab', () => closeHighlighted(commands));
        } else commands.armCommand('d');
        return true;
      }
      event.stopPropagation();
      return false;
    },
  };
}
