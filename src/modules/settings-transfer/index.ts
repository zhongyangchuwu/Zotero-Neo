import type { Cleanup } from '../../core/cleanup';
import type { ModuleHost } from '../../core/module-host';
import type {
  SettingsTransferPort,
  SettingsTransferPresentation,
} from '../../settings-transfer/controller';

export interface SettingsTransferModule {
  open(presentation: SettingsTransferPresentation): boolean;
}
/** Presentation lifetime belongs to Main; configuration operations belong to the application. */
export function createSettingsTransferModule(
  host: ModuleHost,
  service: SettingsTransferPort,
): SettingsTransferModule {
  return host.activate('settings-transfer', (scope) => {
    let release: Cleanup | null = null;
    scope.add(() => {
      release?.();
      release = null;
    });
    const open = host.bind<SettingsTransferPresentation>(
      scope,
      'main-normal',
      'openSettingsTransfer',
      (presentation) => {
        release?.();
        release = service.open({
          ...presentation,
          isCurrent: () => scope.isCurrent() && presentation.isCurrent(),
        });
      },
    );
    return { open };
  });
}
