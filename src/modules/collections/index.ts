import type { Cleanup } from '../../core/cleanup';
import type { ModuleHost } from '../../core/module-host';
import {
  CollectionMembershipActions,
  type CollectionActionHost,
  type CollectionConfirmation,
  type CollectionTargetRequest,
} from './actions';
import type { PickerProvider } from '../../main/picker/types';

export interface CollectionsModuleHost extends Omit<CollectionActionHost, 'isCurrent' | 'choose'> {
  readonly choose: (source: PickerProvider, confirm: CollectionConfirmation) => Cleanup | null;
}

export interface CollectionsModule {
  add(request: CollectionTargetRequest): boolean;
  remove(request: CollectionTargetRequest): boolean;
  moveItems(request: CollectionTargetRequest): boolean;
  find(): boolean;
  addItems(): boolean;
  move(): boolean;
  create(): boolean;
  rename(): boolean;
  removeCollection(): boolean;
}

/** Owns one window's collection workflows without taking ownership of the shared Picker. */
export function createCollectionsModule(
  host: ModuleHost,
  ports: CollectionsModuleHost,
): CollectionsModule {
  return host.activate('collections', (scope) => {
    let releaseChooser: Cleanup | null = null;
    scope.add(() => releaseChooser?.());
    const actions = new CollectionMembershipActions({
      ...ports,
      isCurrent: () => scope.isCurrent(),
      status: (message) => {
        if (scope.isCurrent()) ports.status(message);
      },
      captureCurrent: () => {
        const current = ports.captureCurrent();
        return () => scope.isCurrent() && current();
      },
      choose: (source, confirm) => {
        if (!scope.isCurrent()) return;
        const release = ports.choose(source, (candidate, pickerCurrent, query) => {
          const isCurrent = () => scope.isCurrent() && pickerCurrent();
          if (!isCurrent()) throw new Error('Collection workflow expired');
          return confirm(candidate, isCurrent, query);
        });
        if (!release) return;
        if (scope.isCurrent()) releaseChooser = release;
        else release();
      },
    });
    const bindMembership = (source: 'main' | 'reader', present: boolean) =>
      host.bind<CollectionTargetRequest>(
        scope,
        source === 'main' ? 'main-normal' : 'reader-normal',
        present ? 'addToCollection' : 'removeFromCollection',
        (request) => actions.open(request, present),
      );
    const add = { main: bindMembership('main', true), reader: bindMembership('reader', true) };
    const remove = { main: bindMembership('main', false), reader: bindMembership('reader', false) };
    return {
      add: (request) => add[request.source](request),
      remove: (request) => remove[request.source](request),
      moveItems: host.bind<CollectionTargetRequest>(
        scope,
        'main-normal',
        'moveToCollection',
        (request) => actions.moveItems(request),
      ),
      find: host.bind<void>(scope, 'main-normal', 'findCollections', () => actions.find()),
      addItems: host.bind<void>(scope, 'main-normal', 'addItemsToCurrentCollection', () =>
        actions.addItems(),
      ),
      move: host.bind<void>(scope, 'main-normal', 'moveCollection', () => actions.move()),
      create: host.bind<void>(scope, 'main-normal', 'createCollection', () => actions.create()),
      rename: host.bind<void>(scope, 'main-normal', 'renameCollection', () => actions.rename()),
      removeCollection: host.bind<void>(scope, 'main-normal', 'deleteCollection', () =>
        actions.removeCollection(),
      ),
    };
  });
}
