import type { MainWindow } from '../../core/contracts';
import { CleanupFailure, type Cleanup } from '../../core/cleanup';
import type { Logger } from '../../core/logging';
import { ModuleHost } from '../../core/module-host';
import type { ActionId } from '../../input/actions';
import { NOTE_ACTION_IDS } from '../../input/note-actions';
import type { PickerOpenOptions } from '../../main/picker/types';
import type { NavigationResult, NavigationSurface } from '../../navigation/types';
import { openMainNote } from '../../toolkit/main';
import { NoteEditing, type NoteEditingPort } from './editor';
import { createNotesProvider } from './provider';

export { createNotesProvider } from './provider';
export type { NotesProviderContext } from './provider';
export type { NoteEditingPort, NoteMode } from './editor';

export interface NotesModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  status(message: string, milliseconds?: number): void;
  choose(options: PickerOpenOptions): Cleanup | null;
  selectNote(
    itemID: number,
    surface: NavigationSurface,
    isCurrent: () => boolean,
    afterSelection: () => Promise<void>,
  ): Promise<NavigationResult>;
}

export interface NotesModule {
  readonly editing: NoteEditingPort;
  findNotes(baseItem: Zotero.Item | null, surface: NavigationSurface): void;
}

interface EditingRequest {
  readonly target: HTMLElement;
  readonly count: number;
  handled: boolean;
}

/** Owns Note business state while the Surface retains exact editor identity and input policy. */
export function createNotesModule(host: ModuleHost, ports: NotesModuleHost): NotesModule {
  return host.activate('notes', (scope) => {
    const editor = new NoteEditing({
      isCurrent: () => scope.isCurrent(),
      status: (message, milliseconds) => {
        if (scope.isCurrent()) ports.status(message, milliseconds);
      },
    });
    let releaseChooser: Cleanup | null = null;
    let chooserRevision = 0;
    scope.add(() => {
      chooserRevision += 1;
      const release = releaseChooser;
      releaseChooser = null;
      const failure = new CleanupFailure();
      failure.run(() => editor.clear());
      failure.run(() => release?.());
      failure.rethrow();
    });

    const normal = new Map<ActionId, (request: EditingRequest) => boolean>();
    const insert = new Map<ActionId, (request: EditingRequest) => boolean>();
    for (const action of [...NOTE_ACTION_IDS, 'enterInsert', 'exitMode'] as const) {
      normal.set(
        action,
        host.bind<EditingRequest>(scope, 'note-normal', action, (request) => {
          request.handled = editor.executeAction(action, request.target, request.count) ?? false;
        }),
      );
    }
    insert.set(
      'exitMode',
      host.bind<EditingRequest>(scope, 'note-insert', 'exitMode', (request) => {
        request.handled = editor.executeAction('exitMode', request.target, request.count) ?? false;
      }),
    );
    const editing: NoteEditingPort = {
      get mode() {
        return editor.mode;
      },
      executeAction: (action, target, count) => {
        const invoke = (editor.mode === 'insert' ? insert : normal).get(action);
        if (!invoke) return null;
        const request: EditingRequest = { target, count, handled: false };
        invoke(request);
        return request.handled;
      },
      style: (document) => editor.style(document),
      deactivate: () => editor.deactivate(),
      clear: () => editor.clear(),
    };

    const bindFind = (
      context: 'main-normal' | 'reader-normal' | 'note-normal',
      surface: NavigationSurface,
    ) =>
      host.bind<Zotero.Item | null>(scope, context, 'findNotes', (baseItem) => {
        const previousRevision = chooserRevision;
        const revision = ++chooserRevision;
        let closed = false;
        const isCurrent = (): boolean =>
          scope.isCurrent() && !closed && chooserRevision === revision;
        const release = ports.choose({
          source: createNotesProvider(ports.window, ports.logger, { baseItem }),
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
    const findMain = bindFind('main-normal', 'main');
    const findReader = bindFind('reader-normal', 'reader');
    const findNote = bindFind('note-normal', 'note');
    return {
      editing,
      findNotes: (baseItem, surface) => {
        if (surface === 'main') findMain(baseItem);
        else if (surface === 'reader') findReader(baseItem);
        else findNote(baseItem);
      },
    };
  });
}
