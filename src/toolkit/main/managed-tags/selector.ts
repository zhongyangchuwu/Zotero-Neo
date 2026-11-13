import { confirmChromeAction } from '../../../platform/chrome-windows';
import { cloneInto } from '../../../platform/cross-compartment';
import { isManagedTagEditError } from './library';

interface TagElement {
  readonly props: { readonly tags: readonly { readonly name: string }[] };
}
interface NativeSelector {
  render(): TagElement;
  forceUpdate(): void;
  selectedTags: Set<string>;
  contextTag?: { readonly name: string };
  libraryID: number;
  deleteAutomatic(): Promise<void>;
  openRenamePrompt(): Promise<void>;
  openDeletePrompt(): Promise<void>;
  openTagSplitterWindow(...args: unknown[]): unknown;
  [OWNER]?: object;
}
interface NativeTagWindow extends Window {
  React: { cloneElement(element: TagElement, props: object): TagElement };
  ZoteroPane?: {
    tagSelector?: object;
    itemsView?: {
      collectionTreeRows?: readonly { readonly tags?: Iterable<string> }[];
      setFilter(name: 'tags', value: Set<string>): Promise<unknown>;
    };
  };
}

const OWNER = Symbol.for('zotero-neo.managed-tag-selector');

/** Projects the final native React list, including synthetic colored tags, without changing SDK data. */
export function protectNativeTagSelector(
  ownerWindow: Window,
  candidate: object,
  isManaged: (name: string) => boolean,
  onError: (error: unknown) => void,
): (() => void) | null {
  const window = ownerWindow as NativeTagWindow;
  const selector = candidate as NativeSelector;
  if (
    typeof selector.render !== 'function' ||
    typeof selector.forceUpdate !== 'function' ||
    !selector.selectedTags ||
    !window.React?.cloneElement
  )
    return null;
  const document = window.document;
  const token = {};
  let active = true;
  selector[OWNER] = token;
  const current = (): boolean =>
    active && selector[OWNER] === token && !window.closed && window.document === document;
  const render = selector.render;
  const rename = selector.openRenamePrompt;
  const remove = selector.openDeletePrompt;
  const split = selector.openTagSplitterWindow;
  const deleteAutomatic = selector.deleteAutomatic;
  const protectedContext = (): boolean =>
    !!selector.contextTag && isManaged(selector.contextTag.name);

  const guardedRender: NativeSelector['render'] = function (this: NativeSelector) {
    const element = render.call(this);
    if (!current() || !element.props.tags.some((tag) => isManaged(tag.name))) return element;
    const tags = element.props.tags.filter((tag) => !isManaged(tag.name));
    return window.React.cloneElement(element, cloneInto({ tags }, window));
  };
  const guardedRename: NativeSelector['openRenamePrompt'] = async function (this: NativeSelector) {
    if (!current()) return rename.call(this);
    if (protectedContext()) return;
    const selection = new Set(this.selectedTags);
    const libraryID = this.libraryID;
    const oldName = this.contextTag?.name;
    const color =
      oldName && !Zotero.Tags.getID(oldName)
        ? (Zotero.Tags.getColor(libraryID, oldName) as unknown as
            | { color: string; position: number }
            | false)
        : false;
    const previousColor = color ? { color: color.color, position: color.position } : null;
    try {
      await rename.call(this);
    } catch (error) {
      if (!isManagedTagEditError(error)) throw error;
      // Native color-only rename removes the old setting before accepting the destination.
      if (oldName && previousColor) {
        await Zotero.Tags.setColor(libraryID, oldName, previousColor.color, previousColor.position);
      }
      // Native rename changes the selected Set before the SDK accepts the new name.
      if (current()) {
        this.selectedTags = selection;
        this.forceUpdate();
      }
    }
  };
  const guardedRemove: NativeSelector['openDeletePrompt'] = function (this: NativeSelector) {
    if (current() && protectedContext()) return Promise.resolve();
    return remove.call(this);
  };
  const guardedSplit: NativeSelector['openTagSplitterWindow'] = function (
    this: NativeSelector,
    ...args
  ) {
    if (current() && protectedContext()) return;
    return split.apply(this, args);
  };
  const guardedDeleteAutomatic: NativeSelector['deleteAutomatic'] = async function (
    this: NativeSelector,
  ) {
    if (!current()) return deleteAutomatic.call(this);
    const libraryID = this.libraryID;
    const ids = (await Zotero.Tags.getAutomaticInLibrary(libraryID)).filter((id) => {
      const name = Zotero.Tags.getName(id);
      return typeof name !== 'string' || !isManaged(name);
    });
    if (!ids.length || !current() || this.libraryID !== libraryID) return;
    const count = ids.length;
    const confirmed = confirmChromeAction(
      window,
      Zotero.getString('pane.tagSelector.deleteAutomatic.title'),
      Zotero.getString(
        'pane.tagSelector.deleteAutomatic.message',
        new Intl.NumberFormat().format(count),
        count,
      ) +
        '\n\n' +
        Zotero.getString('general.actionCannotBeUndone'),
    );
    if (!confirmed || !current() || this.libraryID !== libraryID) return;
    const progressHost = Zotero as unknown as {
      showZoteroPaneProgressMeter(message: string | null, indeterminate: boolean): void;
    };
    progressHost.showZoteroPaneProgressMeter(null, true);
    try {
      // Preserve native type=1 filtering: a same-name manual association must survive.
      await Zotero.Tags.removeFromLibrary(
        libraryID,
        ids,
        (done: number, total: number) => {
          if (current() && total > 0) {
            Zotero.updateZoteroPaneProgressMeter(Math.round((done / total) * 100));
          }
        },
        [1],
      );
    } finally {
      Zotero.hideZoteroPaneOverlays();
    }
  };
  selector.render = guardedRender;
  selector.openRenamePrompt = guardedRename;
  selector.openDeletePrompt = guardedRemove;
  selector.openTagSplitterWindow = guardedSplit;
  selector.deleteAutomatic = guardedDeleteAutomatic;

  const dispose = (): void => {
    if (!active) return;
    active = false;
    if (selector.render === guardedRender) selector.render = render;
    if (selector.openRenamePrompt === guardedRename) selector.openRenamePrompt = rename;
    if (selector.openDeletePrompt === guardedRemove) selector.openDeletePrompt = remove;
    if (selector.openTagSplitterWindow === guardedSplit) selector.openTagSplitterWindow = split;
    if (selector.deleteAutomatic === guardedDeleteAutomatic)
      selector.deleteAutomatic = deleteAutomatic;
    if (selector[OWNER] === token) {
      delete selector[OWNER];
      if (!window.closed && window.document === document) selector.forceUpdate();
    }
  };
  try {
    // Retire invisible legacy constraints, retaining the native view's ordinary tag predicate.
    const view = window.ZoteroPane?.itemsView;
    const rows = view?.collectionTreeRows;
    const selection = rows
      ? [...new Set(rows.flatMap((row) => [...(row.tags ?? [])]))]
      : [...selector.selectedTags];
    if (selection.some(isManaged) || [...selector.selectedTags].some(isManaged)) {
      const visible = selection.filter((name) => !isManaged(name));
      selector.selectedTags = new Set(visible);
      if (selection.some(isManaged)) {
        if (!view) throw new Error('Native tag-filter view is unavailable');
        void view.setFilter('tags', new Set(visible)).catch(onError);
      }
    }
    selector.forceUpdate();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
