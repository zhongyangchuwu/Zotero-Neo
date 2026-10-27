import type { Cleanup } from '../../core/cleanup';
import type { ItemTargetSet } from '../../core/item-target';
import type { ModuleHost } from '../../core/module-host';
import type { BindingContext } from '../../input/bindings';
import type { PickerOpenOptions } from '../../main/picker/types';
import { TagActions, type TagActionHost } from './actions';

export interface TagModuleHost extends Omit<TagActionHost, 'choose'> {
  /** Returns only this invocation's release handle, or null when the shared picker is busy. */
  readonly choose: (options: PickerOpenOptions) => Cleanup | null;
}

export interface TagModule {
  add(targets: ItemTargetSet): boolean;
  remove(targets: ItemTargetSet): boolean;
  toggleFilter(): boolean;
  clearFilters(): boolean;
}

/** Attaches real tag workflows with explicit targets and a lifetime-owned chooser. */
export function createTagModule(host: ModuleHost, ports: TagModuleHost): TagModule {
  return host.activate('tags', (scope) => {
    let releaseChooser: Cleanup | null = null;
    scope.add(() => releaseChooser?.());
    const actions = new TagActions({
      ...ports,
      status: (message) => {
        if (scope.isCurrent()) ports.status(message);
      },
      choose: (options) => {
        if (!scope.isCurrent()) return;
        const confirm = options.confirm;
        const release = ports.choose({
          ...options,
          confirm: confirm
            ? (item, openInWindow) => {
                if (scope.isCurrent()) return confirm(item, openInWindow);
              }
            : undefined,
        });
        if (release) releaseChooser = release;
      },
    });
    const bindItems = (context: BindingContext, present: boolean) =>
      host.bind<ItemTargetSet>(scope, context, present ? 'addTag' : 'removeTag', (targets) => {
        if (present) actions.add(targets);
        else actions.remove(targets);
      });
    const add = {
      main: bindItems('main-normal', true),
      reader: bindItems('reader-normal', true),
      note: bindItems('note-normal', true),
    };
    const remove = {
      main: bindItems('main-normal', false),
      reader: bindItems('reader-normal', false),
      note: bindItems('note-normal', false),
    };
    return {
      add: (targets) => add[targets.source](targets),
      remove: (targets) => remove[targets.source](targets),
      toggleFilter: host.bind<void>(scope, 'main-normal', 'toggleTagFilter', () =>
        actions.toggleFilter(),
      ),
      clearFilters: host.bind<void>(scope, 'main-normal', 'clearTagFilters', () =>
        actions.clearFilters(),
      ),
    };
  });
}
