import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import { t } from '../../i18n';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { PickerOpenOptions } from '../../main/picker/types';
import type { NavigationCause, NavigationResult, NavigationSurface } from '../../navigation/types';
import { createTabsProvider } from './tabs-provider';

export interface WorkspaceModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly language: () => KeyGuideLanguage;
  status(message: string, milliseconds?: number): void;
  choose(options: PickerOpenOptions): Cleanup | null;
  selectTab(id: string): boolean;
  cycleTab(direction: -1 | 1): boolean;
  closeTab(): void;
  navigate(
    cause: NavigationCause,
    surface: NavigationSurface,
    move: () => boolean,
    isCurrent: () => boolean,
  ): void;
  selectInLibrary(
    itemID: number,
    surface: 'reader' | 'note',
    isCurrent: () => boolean,
  ): Promise<NavigationResult> | null;
}

export interface WorkspaceModule {
  switchTab(surface: NavigationSurface): boolean;
  closeTab(surface: NavigationSurface): boolean;
  cycleTab(direction: -1 | 1, surface: NavigationSurface): boolean;
  showInLibrary(
    targets: ItemTargetSet<'reader'> | ItemTargetSet<'note'>,
    surface: 'reader' | 'note',
  ): boolean;
}

/** Owns tab and Show in Library workflows within one Main window lifetime. */
export function createWorkspaceModule(
  host: ModuleHost,
  ports: WorkspaceModuleHost,
): WorkspaceModule {
  return host.activate('workspace', (scope) => {
    let releaseChooser: Cleanup | null = null;
    let chooserRevision = 0;
    let workflowRevision = 0;
    scope.add(() => {
      chooserRevision += 1;
      workflowRevision += 1;
      const release = releaseChooser;
      releaseChooser = null;
      release?.();
    });

    const bindSurface = (surface: NavigationSurface) => {
      const context = `${surface}-normal` as const;
      const switchTab = host.bind<void>(scope, context, 'switchTab', () => {
        const previousRevision = chooserRevision;
        const previousWorkflow = workflowRevision;
        const revision = ++chooserRevision;
        const workflow = ++workflowRevision;
        let closed = false;
        const isCurrent = () =>
          scope.isCurrent() &&
          !closed &&
          chooserRevision === revision &&
          workflowRevision === workflow;
        const release = ports.choose({
          source: createTabsProvider(ports.window),
          onClose: () => {
            closed = true;
            if (chooserRevision === revision) releaseChooser = null;
          },
          confirm: (candidate) => {
            if (!isCurrent()) return;
            ports.navigate(
              { kind: 'action', action: 'switchTab' },
              surface,
              () => ports.selectTab(String(candidate.id)),
              isCurrent,
            );
          },
        });
        if (!release) {
          if (chooserRevision === revision) chooserRevision = previousRevision;
          if (workflowRevision === workflow) workflowRevision = previousWorkflow;
          return;
        }
        if (!isCurrent()) {
          release();
          return;
        }
        releaseChooser = release;
      });
      const closeTab = host.bind<void>(scope, context, 'closeCurrentTab', () => {
        workflowRevision += 1;
        ports.closeTab();
      });
      const bindCycle = (direction: -1 | 1) => {
        const action = direction === -1 ? 'previousTab' : 'nextTab';
        return host.bind<void>(scope, context, action, () => {
          workflowRevision += 1;
          ports.navigate(
            { kind: 'action', action },
            surface,
            () => ports.cycleTab(direction),
            () => scope.isCurrent(),
          );
        });
      };
      return { switchTab, closeTab, previous: bindCycle(-1), next: bindCycle(1) };
    };
    const surfaces = {
      main: bindSurface('main'),
      reader: bindSurface('reader'),
      note: bindSurface('note'),
    };

    const bindShow = (surface: 'reader' | 'note') =>
      host.bind<ItemTargetSet<'reader'> | ItemTargetSet<'note'>>(
        scope,
        `${surface}-normal`,
        'showInLibrary',
        (targets) => {
          const revision = ++workflowRevision;
          const isCurrent = () => scope.isCurrent() && workflowRevision === revision;
          const language = ports.language();
          if (targets.missing || targets.total !== 1 || targets.items.length !== 1) {
            ports.status(t('status.showInLibraryUnavailable', language));
            return;
          }
          try {
            const pending = ports.selectInLibrary(targets.items[0]!.id, surface, isCurrent);
            if (!pending) {
              if (isCurrent()) ports.status(t('status.showInLibraryHostUnavailable', language));
              return;
            }
            void pending
              .then((result) => {
                if (!isCurrent()) return;
                if (result.kind === 'completed')
                  ports.status(t('status.showInLibraryComplete', language));
                else if (result.kind === 'failed') {
                  ports.logger.debug(`show in library failed: ${String(result.error)}`);
                  ports.status(t('status.showInLibraryFailed', language));
                }
              })
              .catch((error) => {
                ports.logger.debug(`show in library failed: ${String(error)}`);
                if (isCurrent()) ports.status(t('status.showInLibraryFailed', language));
              });
          } catch (error) {
            ports.logger.debug(`show in library failed: ${String(error)}`);
            if (isCurrent()) ports.status(t('status.showInLibraryFailed', language));
          }
        },
      );
    const show = { reader: bindShow('reader'), note: bindShow('note') };
    return {
      switchTab: (surface) => surfaces[surface].switchTab(),
      closeTab: (surface) => surfaces[surface].closeTab(),
      cycleTab: (direction, surface) =>
        (direction === -1 ? surfaces[surface].previous : surfaces[surface].next)(),
      showInLibrary: (targets, surface) => show[surface](targets),
    };
  });
}
