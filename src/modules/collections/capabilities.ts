import type { ActionId } from '../../input/actions';

export const COLLECTION_MEMBERSHIP_ACTIONS = Object.freeze([
  'addToCollection',
  'removeFromCollection',
] as const satisfies readonly ActionId[]);

export const COLLECTION_MAIN_ACTIONS = Object.freeze([
  ...COLLECTION_MEMBERSHIP_ACTIONS,
  'findCollections',
  'addItemsToCurrentCollection',
  'moveToCollection',
  'moveCollection',
  'createCollection',
  'renameCollection',
  'deleteCollection',
] as const satisfies readonly ActionId[]);
