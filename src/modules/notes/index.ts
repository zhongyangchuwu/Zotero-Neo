import type { MainWindow } from '../../core/contracts';
import type { Cleanup } from '../../core/cleanup';
import type { Logger } from '../../core/logging';
import { ModuleHost } from '../../core/module-host';
import type { AppLanguage } from '../../i18n';
import type { PickerOpenOptions } from '../../main/picker/types';
import type { NavigationResult, NavigationSurface } from '../../navigation/types';
import { openMainNote } from '../../toolkit/main';
import { createNotesProvider } from './provider';

export { createNotesProvider } from './provider';
export type { NotesProviderContext } from './provider';

export interface NotesModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly language: () => AppLanguage;
  choose(options: PickerOpenOptions): Cleanup | null;
  selectNote(
    itemID: number,
    surface: NavigationSurface,
    isCurrent: () => boolean,
    afterSelection: () => Promise<void>,
  ): Promise<NavigationResult>;
}

export interface NotesModule {
  findNotes(baseItem: Zotero.Item | null, surface: NavigationSurface): void;
}

/** Owns the Note picker and opens notes through Main's shared navigation history. */
export function createNotesModule(host: ModuleHost, ports: NotesModuleHost): NotesModule {
  return host.activate('notes', (scope) => {
    let releaseChooser: Cleanup | null = null;
    let chooserRevision = 0;
    scope.add(() => {
      chooserRevision += 1;
      const release = releaseChooser;
      releaseChooser = null;
      release?.();
    });

    const bindFind = (surface: NavigationSurface) =>
      host.bind<Zotero.Item | null>(scope, `${surface}-normal`, 'findNotes', (baseItem) => {
        const previousRevision = chooserRevision;
        const revision = ++chooserRevision;
        let closed = false;
        const isCurrent = (): boolean =>
          scope.isCurrent() && !closed && chooserRevision === revision;
        const release = ports.choose({
          source: createNotesProvider(ports.window, ports.logger, {
            baseItem,
            language: ports.language(),
          }),
          onClose: () => {
            closed = true;
            if (chooserRevision === revision) releaseChooser = null;
          },
          confirm: async (candidate, openInWindow) => {
            if (!isCurrent()) return;
            const id = Number(candidate.id);
            const result = await ports.selectNote(id, surface, isCurrent, async () => {
              if (isCurrent()) await openMainNote(ports.window, id, openInWindow);
            });
            if (result.kind === 'failed') throw result.error;
            if (result.kind === 'unavailable') throw new Error('Library selection is unavailable');
          },
        });
        if (!release) {
          if (chooserRevision === revision) chooserRevision = previousRevision;
          return;
        }
        if (!isCurrent()) {
          release();
          return;
        }
        releaseChooser = release;
      });
    const find = { main: bindFind('main'), reader: bindFind('reader') };
    return {
      findNotes: (baseItem, surface) => find[surface](baseItem),
    };
  });
}
