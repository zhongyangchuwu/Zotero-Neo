import type { ActionId } from '../../input/actions';

export const EXTENSIONS_SURFACE_ACTIONS = Object.freeze([
  'managePlugins',
] as const satisfies readonly ActionId[]);

export const PLUGINS_INPUT_ACTIONS = Object.freeze([
  'uiFocusList',
] as const satisfies readonly ActionId[]);

/** Persistent plugin operations remain implemented by PluginManagerPanel. */
export const PLUGINS_LIST_ACTIONS = Object.freeze([
  'uiNext',
  'uiPrevious',
  'uiFirst',
  'uiLast',
  'uiPageDown',
  'uiPageUp',
  'uiCancel',
  'uiSearch',
  'pluginsRefresh',
  'pluginsEnable',
  'pluginsDisable',
  'pluginsPreferences',
  'pluginsHomepage',
  'pluginsReadme',
  'pluginsGitLog',
] as const satisfies readonly ActionId[]);
