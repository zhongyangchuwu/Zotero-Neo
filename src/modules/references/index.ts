import type { ModuleHost } from '../../core/module-host';
import { ReferenceController } from '../../references/controller';
import type { ReferenceReaderPort } from '../../references/reader-port';

export interface ReferencesModule {
  open(): boolean;
  close(): void;
  ownsTarget(target: EventTarget | null): boolean;
  isInputFocused(window: Window | undefined): boolean;
  releaseView(window: Window): void;
  activateView(window: Window): void;
}

export function createReferencesModule(
  host: ModuleHost,
  port: ReferenceReaderPort,
): ReferencesModule {
  return host.activate('references', (scope) => {
    const controller = new ReferenceController(port);
    scope.add(() => controller.dispose());
    const open = host.bind<void>(scope, 'reader-normal', 'openReferences', () => controller.open());
    return {
      open: () => open(),
      close: () => controller.close(),
      ownsTarget: (target) => controller.ownsTarget(target),
      isInputFocused: (window) => controller.isInputFocused(window),
      releaseView: (window) => controller.releaseView(window),
      activateView: (window) => controller.activateView(window),
    };
  });
}
