import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { KeyGuideLanguage } from '../../input/key-guide-config';

interface LiteratureMenuActions {
  resolveOwner(window: Window): MainWindow | undefined;
  language(): KeyGuideLanguage;
  manageAttributes?: (window: MainWindow) => void;
  editAttributes?: (window: MainWindow, items: readonly Zotero.Item[]) => void;
  reviewMetadata(window: MainWindow, items: readonly Zotero.Item[]): void;
  openTable(window: MainWindow): void;
}

function canCheckMetadata(item: Zotero.Item): boolean {
  return item.isRegularItem() && !item.deleted && !item.isFeedItem;
}

/** Register once per add-on lifetime; each menu event belongs to its own main window. */
export function registerLiteratureMenus(pluginID: string, actions: LiteratureMenuActions): Cleanup {
  const manager = Zotero.MenuManager;
  const registered: string[] = [];
  let active = true;
  const owner = (menu: Element) => {
    const window = menu.ownerDocument.defaultView;
    return active && window ? actions.resolveOwner(window) : undefined;
  };
  const label = (menu: Element, zh: string, en: string): void => {
    menu.setAttribute('label', actions.language() === 'zh-CN' ? zh : en);
  };
  const toolsItem = (
    zh: string,
    en: string,
    run: (window: MainWindow) => void,
  ): _ZoteroTypes.MenuManager.MenuData<_ZoteroTypes.MenuManager.MenubarMenuContext> => ({
    menuType: 'menuitem',
    onShowing: (_event, context) => {
      label(context.menuElem, zh, en);
      context.setEnabled(!!owner(context.menuElem));
    },
    onCommand: (_event, context) => {
      const window = owner(context.menuElem);
      if (window) run(window);
    },
  });
  const register = <T extends _ZoteroTypes.MenuManager.ValidTarget>(
    id: string,
    target: T,
    menus: _ZoteroTypes.MenuManager.MenuOptions<T>['menus'],
  ): void => {
    const menuID = manager.registerMenu({ pluginID, menuID: id, target, menus });
    if (!menuID) throw new Error(`Zotero rejected menu ${id}`);
    registered.push(menuID);
  };
  const dispose = (): void => {
    if (!active) return;
    active = false;
    const failure = new CleanupFailure();
    for (const id of registered) failure.run(() => manager.unregisterMenu(id));
    failure.rethrow();
  };
  try {
    const tools = [toolsItem('Neo 文献表格…', 'Neo Literature Table…', actions.openTable)];
    if (actions.manageAttributes)
      tools.push(
        toolsItem('管理自定义属性…', 'Manage Custom Attributes…', actions.manageAttributes),
      );
    register('neo-literature-tools', 'main/menubar/tools', tools);
    register('neo-check-metadata', 'main/library/item', [
      {
        menuType: 'menuitem',
        onShowing: (_event, context) => {
          label(context.menuElem, '检查论文信息…', 'Check Paper Details…');
          context.setEnabled(!!owner(context.menuElem) && !!context.items?.some(canCheckMetadata));
        },
        onCommand: (_event, context) => {
          const window = owner(context.menuElem);
          if (!window) return;
          const items = context.items?.filter(canCheckMetadata);
          if (items?.length) actions.reviewMetadata(window, items);
        },
      },
    ]);
    if (actions.editAttributes) {
      register('neo-edit-attributes', 'main/library/item', [
        {
          menuType: 'menuitem',
          onShowing: (_event, context) => {
            label(context.menuElem, '编辑自定义属性…', 'Edit Custom Attributes…');
            context.setEnabled(!!owner(context.menuElem) && !!context.items?.length);
          },
          onCommand: (_event, context) => {
            const window = owner(context.menuElem);
            if (window && context.items?.length) actions.editAttributes?.(window, context.items);
          },
        },
      ]);
    }
  } catch (error) {
    const failure = new CleanupFailure();
    failure.run(() => {
      throw error;
    });
    failure.run(dispose);
    failure.rethrow();
  }
  return dispose;
}
