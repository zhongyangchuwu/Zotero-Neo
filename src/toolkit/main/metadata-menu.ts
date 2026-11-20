import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { KeyGuideLanguage } from '../../input/key-guide-config';

interface MetadataReviewMenuActions {
  resolveOwner(window: Window): MainWindow | undefined;
  language(): KeyGuideLanguage;
  reviewMetadata(window: MainWindow, items: readonly Zotero.Item[]): void;
}

function canCheckMetadata(item: Zotero.Item): boolean {
  return item.isRegularItem() && !item.deleted && !item.isFeedItem;
}

/** Register once per add-on lifetime; each menu event belongs to its own main window. */
export function registerMetadataReviewMenu(
  pluginID: string,
  actions: MetadataReviewMenuActions,
): Cleanup {
  const manager = Zotero.MenuManager;
  let active = true;
  const owner = (menu: Element) => {
    const window = menu.ownerDocument.defaultView;
    return active && window ? actions.resolveOwner(window) : undefined;
  };
  const menuID = manager.registerMenu({
    pluginID,
    menuID: 'neo-check-metadata',
    target: 'main/library/item',
    menus: [
      {
        menuType: 'menuitem',
        onShowing: (_event, context) => {
          context.menuElem.setAttribute(
            'label',
            actions.language() === 'zh-CN' ? '检查论文信息…' : 'Check Paper Details…',
          );
          context.setEnabled(!!owner(context.menuElem) && !!context.items?.some(canCheckMetadata));
        },
        onCommand: (_event, context) => {
          const window = owner(context.menuElem);
          if (!window) return;
          const items = context.items?.filter(canCheckMetadata);
          if (items?.length) actions.reviewMetadata(window, items);
        },
      },
    ],
  });
  if (!menuID) throw new Error('Zotero rejected menu neo-check-metadata');
  return () => {
    if (!active) return;
    active = false;
    manager.unregisterMenu(menuID);
  };
}
