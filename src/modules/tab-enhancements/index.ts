import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import type { PreferenceStore } from '../../core/preference-store';
import { LANGUAGE_PREFERENCE_KEY } from '../../core/preferences';
import { t } from '../../i18n';
import type { BindingMap } from '../../input/bindings';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { alertChromeAction, confirmChromeAction } from '../../platform/chrome-windows';
import {
  activateMainWindow,
  createTabEnhancementHost,
  selectedMainTabID,
} from '../../toolkit/main';
import type { WorkspaceModule } from '../workspace';
import { normalizeTabRailWidth, TAB_RAIL_WIDTH } from '../../toolkit/main/tab-enhancements-types';
import { TAB_ENHANCEMENT_PREFERENCES, tabRailOptions, tabTitleFormat } from './config';
import { TabEnhancementsSidebar } from './sidebar';
import { validateTabTitleFormat } from './title-format';
import type { TabGroupManager, TabGroupRestoreProgress } from './types';
import type { MainResolvedTargets } from '../../main/action-targets';
import { importReadingSelection } from './selection-import';

export interface TabEnhancementsModuleHost {
  readonly window: MainWindow;
  readonly preferences: PreferenceStore;
  readonly logger: Logger;
  readonly bindings: () => BindingMap;
  readonly language: () => KeyGuideLanguage;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
  readonly groups: TabGroupManager;
  readonly workspace: WorkspaceModule;
}
type SurfaceContext = 'main-normal' | 'reader-normal' | 'note-normal';
export interface TabEnhancementsModule {
  ownsTarget(target: EventTarget | null): boolean;
  handleKey(event: KeyboardEvent): void;
  focus(context: SurfaceContext): boolean;
  toggle(context: SurfaceContext): boolean;
  importSelection(targets: MainResolvedTargets, create: boolean): boolean;
}

/** Owns one Main presentation; shared groups never take ownership of native Reader lifetimes. */
export function createTabEnhancementsModule(
  host: ModuleHost,
  ports: TabEnhancementsModuleHost,
): TabEnhancementsModule {
  return host.activate('tab-enhancements', (scope) => {
    const document = ports.window.document;
    const current = (): boolean =>
      scope.isCurrent() && ports.window.document === document && !ports.window.closed;
    let appliedFormat = tabTitleFormat(ports.preferences);
    if (validateTabTitleFormat(appliedFormat))
      throw new Error(t('tabs.invalidFormat', ports.language()));
    const native = createTabEnhancementHost(ports.window, (error) =>
      ports.logger.debug(`Tab host failed: ${String(error)}`),
    );
    scope.add(() => native.dispose());
    scope.add(
      ports.groups.registerHost({
        native,
        activate: (nativeID) => {
          if (!current()) return false;
          const alreadySelected = selectedMainTabID(ports.window) === nativeID;
          activateMainWindow(ports.window);
          const accepted = ports.workspace.activateTab(nativeID, 'main');
          if (accepted && alreadySelected) native.focusContent();
          return accepted;
        },
      }),
    );
    let sidebar: TabEnhancementsSidebar;
    let restore: { groupID: string; started: boolean; stopped: boolean } | null = null;
    const report = (error: unknown): void => {
      ports.logger.debug(`Tab enhancement operation failed: ${String(error)}`);
      if (current()) sidebar?.status(t('tabs.operationFailed', ports.language()));
    };
    const invoke = (run: () => void | Promise<void>): void => {
      if (!current()) return;
      if (!restore) sidebar?.status('');
      try {
        const pending = run();
        if (pending) void pending.catch(report);
      } catch (error) {
        report(error);
      }
    };
    const setCollapsed = (collapsed: boolean): void => {
      ports.preferences.set(TAB_ENHANCEMENT_PREFERENCES.collapsed, collapsed);
      refresh();
    };
    sidebar = new TabEnhancementsSidebar({
      window: ports.window,
      bindings: ports.bindings,
      language: ports.language,
      isCurrent: current,
      themeRoot: ports.themeRoot,
      callbacks: {
        toggleSidebar: () =>
          invoke(() => setCollapsed(!tabRailOptions(ports.preferences).collapsed)),
        activate: (id) => invoke(() => ports.groups.activate(id, native.id)),
        close: (id) => invoke(() => ports.groups.closeMember(id, native.id)),
        createGroup: (name, memberID) =>
          invoke(() => {
            const id = ports.groups.createGroup(name);
            if (memberID) ports.groups.assign(memberID, id, native.id);
          }),
        renameGroup: (id, name) => invoke(() => ports.groups.renameGroup(id, name)),
        setGroupColor: (id, color) => invoke(() => ports.groups.setGroupColor(id, color)),
        toggleGroup: (id) => invoke(() => ports.groups.toggleGroup(id)),
        openGroup: (id) => invoke(() => {
          if (restore) return;
          const group = ports.groups.view(native.id, appliedFormat).groups.find((entry) => entry.id === id);
          if (!group) return;
          const plan = ports.groups.prepareGroup(id, native.id);
          const operation = { groupID: id, started: false, stopped: false };
          restore = operation;
          sidebar.restorePreview(group, () => {
            if (restore !== operation || operation.started || !current()) return;
            if (!ports.groups.view(native.id, appliedFormat).groups.some((entry) => entry.id === id)) {
              restore = null;
              sidebar.status('');
              return;
            }
            operation.started = true;
            const show = (value: TabGroupRestoreProgress, done: boolean) => {
              if (!current() || restore !== operation) return;
              const text = (key: string) => t(`tabs.${key}`, ports.language());
              const message = `${text(done ? (value.stopped ? 'restoreStopped' : 'restoreFinished') : 'restoreProgress')}: ${value.processed}/${value.total}; ${text('restoreOpened')}: ${value.opened}; ${text('restoreSkipped')}: ${value.skipped}; ${text('restoreFailed')}: ${value.failed}`;
              sidebar.restoreProgress(message, done || operation.stopped ? undefined : () => {
                if (restore !== operation) return;
                operation.stopped = true;
                show(value, false);
              });
            };
            void ports.groups.openGroup(id, native.id, {
              isCurrent: () => current() && restore === operation && !operation.stopped,
              plan,
              progress: (value) => show(value, false),
            }).then((value) => {
              show(value, true);
              if (restore === operation) restore = null;
            }).catch((error: unknown) => {
              if (restore === operation) restore = null;
              report(error);
            });
          }, () => {
            if (restore !== operation || operation.started) return;
            restore = null;
            sidebar.status('');
          });
        }),
        closeGroup: (id) => invoke(() => ports.groups.closeGroup(id, native.id)),
        ungroup: (id) =>
          invoke(() => {
            const group = ports.groups
              .view(native.id, appliedFormat)
              .groups.find((entry) => entry.id === id);
            if (!group) return;
            const confirmed = confirmChromeAction(
              ports.window,
              group.name,
              t('tabs.confirmUngroup', ports.language()),
            );
            if (confirmed && current()) ports.groups.ungroup(id, native.id);
          }),
        removeMember: (id) => invoke(() => ports.groups.removeMember(id, native.id)),
        moveMember: (id, groupID, beforeID) =>
          invoke(() => ports.groups.moveMember(id, groupID, beforeID, native.id)),
        moveGroup: (id, beforeID) => invoke(() => ports.groups.moveGroup(id, beforeID, native.id)),
        leave: () => {
          if (current()) native.focusContent();
        },
      },
    });
    scope.add(() => sidebar.dispose());
    const layout = native.mountSidebar(
      sidebar.root,
      sidebar.toolbarSlot,
      tabRailOptions(ports.preferences),
      (width) => {
        if (!current()) return;
        const next = normalizeTabRailWidth(width);
        const storedWidth: unknown = ports.preferences.get(
          TAB_ENHANCEMENT_PREFERENCES.width,
          TAB_RAIL_WIDTH.default,
        );
        if (storedWidth !== next) {
          ports.preferences.set(TAB_ENHANCEMENT_PREFERENCES.width, next);
        }
      },
    );
    // Layout restores the native toolbar before Sidebar releases its owned DOM.
    scope.add(() => layout.dispose());
    function refresh(): void {
      if (!current()) return;
      try {
        const format = tabTitleFormat(ports.preferences);
        const invalid = validateTabTitleFormat(format);
        if (!invalid) appliedFormat = format;
        const options = tabRailOptions(ports.preferences);
        sidebar.update(ports.groups.view(native.id, appliedFormat), options.collapsed);
        layout.update(options);
        if (invalid) sidebar.status(t('tabs.invalidFormat', ports.language()));
      } catch (error) {
        report(error);
      }
    }
    scope.add(ports.groups.subscribe(refresh));
    for (const key of [...Object.values(TAB_ENHANCEMENT_PREFERENCES), LANGUAGE_PREFERENCE_KEY]) {
      const cleanup = ports.preferences.observe?.(key, refresh);
      if (cleanup) scope.add(cleanup);
    }
    refresh();
    const bind = (context: SurfaceContext) => ({
      focus: host.bind<void>(scope, context, 'tabFocusSidebar', () => {
        if (!current()) return;
        if (tabRailOptions(ports.preferences).collapsed) setCollapsed(false);
        activateMainWindow(ports.window);
        sidebar.focus();
      }),
      toggle: host.bind<void>(scope, context, 'tabToggleSidebar', () => {
        if (current()) invoke(() => setCollapsed(!tabRailOptions(ports.preferences).collapsed));
      }),
    });
    const actions = {
      'main-normal': bind('main-normal'),
      'reader-normal': bind('reader-normal'),
      'note-normal': bind('note-normal'),
    };
    const runSelectionImport = (targets: MainResolvedTargets, create: boolean): void => {
      try {
        importReadingSelection({
          window: ports.window,
          language: ports.language(),
          targets,
          groups: ports.groups,
          hostID: native.id,
          titleFormat: appliedFormat,
          create,
          isCurrent: current,
        });
      } catch (error) {
        report(error);
        if (current()) {
          alertChromeAction(
            ports.window,
            t('tabs.selectionImportTitle', ports.language()),
            t('tabs.operationFailed', ports.language()),
          );
        }
      }
    };
    const importSelection = host.bind<MainResolvedTargets>(
      scope,
      'main-normal',
      'mainCreateReadingGroup',
      (targets) => runSelectionImport(targets, true),
    );
    const appendSelection = host.bind<MainResolvedTargets>(
      scope,
      'main-normal',
      'mainAppendReadingGroup',
      (targets) => runSelectionImport(targets, false),
    );
    return {
      ownsTarget: (target) =>
        current() && (sidebar.ownsTarget(target) || layout.ownsTarget(target)),
      handleKey: (event) => {
        if (current() && sidebar.ownsTarget(event.target)) sidebar.handleKey(event);
      },
      focus: (context) => actions[context].focus(),
      toggle: (context) => actions[context].toggle(),
      importSelection: (targets, create) =>
        create ? importSelection(targets) : appendSelection(targets),
    };
  });
}
