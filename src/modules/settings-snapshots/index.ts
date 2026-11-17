import type { Cleanup } from '../../core/cleanup';
import type { ModuleHost } from '../../core/module-host';
import type {
  SettingsSnapshotPort,
  SettingsSnapshotPresentation,
} from '../../settings-snapshots/controller';

export interface SettingsSnapshotModule {
  open(presentation: SettingsSnapshotPresentation): boolean;
}
/** Presentation lifetime belongs to Main; configuration operations belong to the application. */
export function createSettingsSnapshotModule(
  host: ModuleHost,
  service: SettingsSnapshotPort,
): SettingsSnapshotModule {
  return host.activate('settings-snapshots', (scope) => {
    let release: Cleanup | null = null;
    scope.add(() => {
      release?.();
      release = null;
    });
    const open = host.bind<SettingsSnapshotPresentation>(
      scope,
      'main-normal',
      'openSettingsSnapshots',
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
