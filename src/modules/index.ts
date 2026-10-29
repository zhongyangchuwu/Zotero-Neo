import type { ActionId } from '../input/actions';
import type { BindingContext } from '../input/bindings';
import { NOTE_ACTION_IDS } from '../input/note-actions';
import {
  READER_OUTLINE_ACTIONS,
  READER_MARKS_ACTIONS,
  READER_ANNOTATIONS_ACTIONS,
  READER_THUMBNAILS_ACTIONS,
} from '../reader/action-capabilities';
import { COLLECTION_MAIN_ACTIONS, COLLECTION_MEMBERSHIP_ACTIONS } from './collections/capabilities';
import { EXTENSIONS_SURFACE_ACTIONS } from './extensions/capabilities';
import { READER_HINT_ACTIONS } from './reader-hints/capabilities';
import { READER_NAVIGATION_ACTIONS } from './reader-navigation/capabilities';
import {
  READER_SELECTION_NORMAL_ACTIONS,
  READER_SELECTION_SELECT_ACTIONS,
} from './reader-selection/actions';
import {
  READER_ANNOTATION_NORMAL_ACTIONS,
  READER_ANNOTATION_SELECT_ACTIONS,
} from './reader-annotations/actions';
import { TAG_ITEM_ACTIONS, TAG_MAIN_ACTIONS } from './tags/capabilities';
import { WORKSETS_SELECT_ACTIONS } from './worksets/capabilities';
import { READER_WORKSPACE_ACTIONS } from './workspace/reader-actions';

export type BuiltinModuleId =
  | 'library'
  | 'worksets'
  | 'tags'
  | 'collections'
  | 'reader-navigation'
  | 'reader-selection'
  | 'reader-annotations'
  | 'reader-hints'
  | 'notes'
  | 'workspace'
  | 'extensions';

export const OPTIONAL_MODULE_IDS = ['reader-hints', 'extensions'] as const;
export type OptionalModuleId = (typeof OPTIONAL_MODULE_IDS)[number];
const OPTIONAL_MODULE_ID_SET = new Set<BuiltinModuleId>(OPTIONAL_MODULE_IDS);

/** Internal ownership is not a user switch; only independent enhancements are optional. */
export function isOptionalModule(id: BuiltinModuleId): id is OptionalModuleId {
  return OPTIONAL_MODULE_ID_SET.has(id);
}

export type ModuleHostKind = 'main' | 'reader';
export interface BuiltinModuleDescriptor {
  readonly id: BuiltinModuleId;
  readonly names: { readonly en: string; readonly 'zh-CN': string };
  readonly hosts: readonly ModuleHostKind[];
  readonly scopes: readonly string[];
  readonly requires: readonly BuiltinModuleId[];
  readonly optional: readonly BuiltinModuleId[];
  readonly contributions: readonly {
    readonly host: ModuleHostKind;
    readonly context: BindingContext;
    readonly actions: readonly ActionId[];
  }[];
  readonly selectionActions: readonly string[];
  readonly ui: readonly string[];
}

const itemFind = ['findAllItems', 'findCollectionItems'] as const;
const tabs = ['switchTab', 'closeCurrentTab', 'previousTab', 'nextTab'] as const;

/** Static ownership only: importing this catalog never constructs feature modules. */
export const BUILTIN_MODULES: readonly BuiltinModuleDescriptor[] = [
  {
    id: 'library',
    names: { en: 'Library', 'zh-CN': '文库' },
    hosts: ['main', 'reader'],
    scopes: ['Main window', 'Reader session'],
    requires: [],
    optional: ['worksets'],
    contributions: [
      {
        host: 'main',
        context: 'main-normal',
        actions: [
          ...itemFind,
          'mainAddByIdentifier',
          'mainYankCitekey',
          'mainOpenPDF',
          'mainActivate',
          'mainTrashItems',
          'mainRestoreTrashedItems',
          'openSearch',
          'findNext',
          'findPrevious',
          'mainQuickSearch',
          'mainAdvancedSearch',
          'mainNavDown',
          'mainNavUp',
          'mainNavFirst',
          'mainNavLast',
          'mainTreeToggle',
          'mainTreeOpenOnly',
          'mainTreeCloseOnly',
          'mainTreeExpand',
          'mainTreeCollapse',
          'mainTreeParent',
          'mainTreeExpandAll',
          'mainTreeCollapseAll',
        ],
      },
      { host: 'main', context: 'main-select', actions: ['mainTrashItems'] },
      { host: 'main', context: 'reader-normal', actions: [...itemFind, 'mainAddByIdentifier'] },
      { host: 'reader', context: 'reader-normal', actions: ['mainYankCitekey'] },
      {
        host: 'main',
        context: 'note-normal',
        actions: [...itemFind, 'mainYankCitekey', 'mainOpenPDF'],
      },
    ],
    selectionActions: [],
    ui: ['Item picker', 'Local find'],
  },
  {
    id: 'worksets',
    names: { en: 'Worksets', 'zh-CN': '工作集' },
    hosts: ['main'],
    scopes: ['Main window'],
    requires: [],
    optional: [],
    contributions: [
      {
        host: 'main',
        context: 'main-normal',
        actions: [
          'manageSelection',
          'mainToggleSelection',
          'mainClearSelection',
          'mainEnterSelect',
        ],
      },
      { host: 'main', context: 'main-select', actions: WORKSETS_SELECT_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Selection panel'],
  },
  {
    id: 'tags',
    names: { en: 'Tags', 'zh-CN': '标签' },
    hosts: ['main'],
    scopes: ['Main window', 'Tag picker'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'main', context: 'main-normal', actions: TAG_MAIN_ACTIONS },
      { host: 'main', context: 'reader-normal', actions: TAG_ITEM_ACTIONS },
      { host: 'main', context: 'note-normal', actions: TAG_ITEM_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Tag picker'],
  },
  {
    id: 'collections',
    names: { en: 'Collections', 'zh-CN': '分类' },
    hosts: ['main'],
    scopes: ['Main window', 'Collection picker'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'main', context: 'main-normal', actions: COLLECTION_MAIN_ACTIONS },
      { host: 'main', context: 'reader-normal', actions: COLLECTION_MEMBERSHIP_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Collection picker'],
  },
  {
    id: 'reader-navigation',
    names: { en: 'Reader Navigation', 'zh-CN': '阅读导航' },
    hosts: ['reader'],
    scopes: ['Reader session', 'Reader view', 'Native sidebar'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'reader', context: 'reader-normal', actions: READER_NAVIGATION_ACTIONS },
      { host: 'reader', context: 'reader-outline', actions: READER_OUTLINE_ACTIONS },
      { host: 'reader', context: 'reader-marks', actions: READER_MARKS_ACTIONS },
      { host: 'reader', context: 'reader-annotations', actions: READER_ANNOTATIONS_ACTIONS },
      { host: 'reader', context: 'reader-thumbnails', actions: READER_THUMBNAILS_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Reader sidebar', 'Marks'],
  },
  {
    id: 'reader-selection',
    names: { en: 'Reader Selection', 'zh-CN': '阅读选区' },
    hosts: ['reader'],
    scopes: ['Reader session', 'Reader view', 'Selection action'],
    requires: [],
    optional: ['reader-annotations'],
    contributions: [
      { host: 'reader', context: 'reader-normal', actions: READER_SELECTION_NORMAL_ACTIONS },
      { host: 'reader', context: 'reader-select', actions: READER_SELECTION_SELECT_ACTIONS },
    ],
    selectionActions: ['pdf-translate.translate'],
    ui: ['Selection actions', 'Flash'],
  },
  {
    id: 'reader-annotations',
    names: { en: 'Reader Annotations', 'zh-CN': '阅读批注' },
    hosts: ['reader'],
    scopes: ['Reader session', 'Reader view', 'Comment editor'],
    requires: [],
    optional: ['reader-selection'],
    contributions: [
      { host: 'reader', context: 'reader-normal', actions: READER_ANNOTATION_NORMAL_ACTIONS },
      { host: 'reader', context: 'reader-select', actions: READER_ANNOTATION_SELECT_ACTIONS },
    ],
    selectionActions: ['neo.underline', 'neo.add-note'],
    ui: ['Comment editor', 'Annotation filter'],
  },
  {
    id: 'reader-hints',
    names: { en: 'Link and Copy Hints', 'zh-CN': '链接与复制提示' },
    hosts: ['reader'],
    scopes: ['Reader session', 'Reader view', 'Hint overlay'],
    requires: [],
    optional: [],
    contributions: [{ host: 'reader', context: 'reader-normal', actions: READER_HINT_ACTIONS }],
    selectionActions: [],
    ui: ['Link hints', 'Copy hints'],
  },
  {
    id: 'notes',
    names: { en: 'Notes', 'zh-CN': '笔记' },
    hosts: ['main'],
    scopes: ['Main window', 'Note editor', 'Note picker'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'main', context: 'main-normal', actions: ['findNotes'] },
      { host: 'main', context: 'reader-normal', actions: ['findNotes'] },
      {
        host: 'main',
        context: 'note-normal',
        actions: ['findNotes', ...NOTE_ACTION_IDS, 'enterInsert', 'exitMode'],
      },
      { host: 'main', context: 'note-insert', actions: ['exitMode'] },
    ],
    selectionActions: [],
    ui: ['Note editor', 'Note picker'],
  },
  {
    id: 'workspace',
    names: { en: 'Workspace', 'zh-CN': '工作区' },
    hosts: ['main', 'reader'],
    scopes: ['Main window', 'Reader session', 'Tab picker'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'main', context: 'main-normal', actions: tabs },
      { host: 'main', context: 'reader-normal', actions: [...tabs, 'showInLibrary'] },
      { host: 'main', context: 'note-normal', actions: [...tabs, 'showInLibrary'] },
      { host: 'reader', context: 'reader-normal', actions: READER_WORKSPACE_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Tab picker', 'Reader split'],
  },
  {
    id: 'extensions',
    names: { en: 'Plugin Manager', 'zh-CN': '扩展管理面板' },
    hosts: ['main'],
    scopes: ['Main window', 'Plugin manager'],
    requires: [],
    optional: [],
    contributions: [
      { host: 'main', context: 'main-normal', actions: EXTENSIONS_SURFACE_ACTIONS },
      { host: 'main', context: 'reader-normal', actions: EXTENSIONS_SURFACE_ACTIONS },
      { host: 'main', context: 'note-normal', actions: EXTENSIONS_SURFACE_ACTIONS },
    ],
    selectionActions: [],
    ui: ['Plugin manager'],
  },
];

export type OptionalModuleDescriptor = BuiltinModuleDescriptor & {
  readonly id: OptionalModuleId;
};

/** Settings and persisted startup requests contain enhancements, never core controls. */
export const OPTIONAL_MODULES: readonly OptionalModuleDescriptor[] = BUILTIN_MODULES.filter(
  (descriptor): descriptor is OptionalModuleDescriptor => isOptionalModule(descriptor.id),
);

/** Reject ambiguous ownership and invalid dependency graphs before any factory runs. */
export function validateBuiltinModules(descriptions: readonly BuiltinModuleDescriptor[]): void {
  const modules = new Map<BuiltinModuleId, BuiltinModuleDescriptor>();
  const actions = new Map<BindingContext, Set<ActionId>>();
  for (const description of descriptions) {
    if (modules.has(description.id)) throw new Error(`Duplicate module: ${description.id}`);
    modules.set(description.id, description);
    for (const contribution of description.contributions) {
      let context = actions.get(contribution.context);
      if (!context) actions.set(contribution.context, (context = new Set()));
      for (const action of contribution.actions) {
        if (context.has(action))
          throw new Error(`Duplicate contribution: ${contribution.context}:${action}`);
        context.add(action);
      }
    }
  }
  const visiting = new Set<BuiltinModuleId>();
  const visited = new Set<BuiltinModuleId>();
  const visit = (id: BuiltinModuleId): void => {
    if (visiting.has(id)) throw new Error(`Module dependency cycle: ${id}`);
    if (visited.has(id)) return;
    const description = modules.get(id);
    if (!description) throw new Error(`Missing module dependency: ${id}`);
    visiting.add(id);
    for (const dependency of description.requires) visit(dependency);
    for (const dependency of description.optional) {
      if (!modules.has(dependency)) throw new Error(`Missing module dependency: ${dependency}`);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of modules.keys()) visit(id);
}

const contributionIndex = new Map<
  BindingContext,
  Map<ActionId, { module: BuiltinModuleId; host: ModuleHostKind }>
>();
for (const description of BUILTIN_MODULES) {
  for (const contribution of description.contributions) {
    let context = contributionIndex.get(contribution.context);
    if (!context) contributionIndex.set(contribution.context, (context = new Map()));
    for (const action of contribution.actions)
      context.set(action, { module: description.id, host: contribution.host });
  }
}

export function actionContribution(
  context: BindingContext,
  action: ActionId,
): { module: BuiltinModuleId; host: ModuleHostKind } | null {
  return contributionIndex.get(context)?.get(action) ?? null;
}
