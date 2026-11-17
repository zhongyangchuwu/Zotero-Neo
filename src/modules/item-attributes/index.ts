import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { ModuleHost } from '../../core/module-host';
import type {
  ItemAttributesPort,
  ItemAttributesPresentation,
} from '../../item-attributes/contracts';

export interface ItemAttributesModule {
  manage(presentation: ItemAttributesPresentation): boolean;
  edit(presentation: ItemAttributesPresentation, context: 'main-normal' | 'main-select'): boolean;
}

/** Main owns presentation and window leases; definitions and native columns belong to the app. */
export function createItemAttributesModule(
  host: ModuleHost,
  service: ItemAttributesPort,
  window: MainWindow,
): ItemAttributesModule {
  return host.activate('item-attributes', (scope) => {
    scope.add(service.attachWindow(window));
    let release: Cleanup | null = null;
    scope.add(() => {
      release?.();
      release = null;
    });
    const open = (presentation: ItemAttributesPresentation): void => {
      release?.();
      release = service.open({
        ...presentation,
        isCurrent: () => scope.isCurrent() && presentation.isCurrent(),
      });
    };
    const manage = host.bind(scope, 'main-normal', 'manageItemAttributes', open);
    const edit = host.bind(scope, 'main-normal', 'editItemAttributes', open);
    const editSelection = host.bind(scope, 'main-select', 'editItemAttributes', open);
    return {
      manage,
      edit: (presentation, context) =>
        context === 'main-select' ? editSelection(presentation) : edit(presentation),
    };
  });
}
