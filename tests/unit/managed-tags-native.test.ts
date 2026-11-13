import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSourceNoteIdentity } from '../../src/platform/note-relations';
import { protectNativeTagMutations } from '../../src/toolkit/main/managed-tags/library';
import { protectNativeTagSelector } from '../../src/toolkit/main/managed-tags/selector';

const prefix = 'urn:zotero-neo:chapter-note:v1:';
const manualMarker = prefix + 'a'.repeat(32);
const automaticMarker = prefix + 'b'.repeat(32);
const nearMarker = automaticMarker + '-ordinary';
interface Association {
  itemID: number;
  tagID: number;
  type: number;
  libraryID: number;
}

function harness() {
  const names = new Map([
    [1, manualMarker],
    [2, automaticMarker],
    [3, 'topic'],
    [4, nearMarker],
    [5, 'imported'],
  ]);
  const state = {
    associations: [
      { itemID: 1, tagID: 1, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 2, type: 1, libraryID: 1 },
      { itemID: 1, tagID: 3, type: 1, libraryID: 1 },
      { itemID: 2, tagID: 3, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 4, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 5, type: 1, libraryID: 1 },
      { itemID: 9, tagID: 5, type: 1, libraryID: 2 },
    ] as Association[],
  };
  const colors = new Map<string, { color: string; position: number }>();
  const sdk = {
    getName: (id: number) => names.get(id) ?? false,
    getID: (name: string) => [...names].find(([, value]) => value === name)?.[0] ?? false,
    getColor: (_libraryID: number, name: string) => colors.get(name) ?? false,
    getAutomaticInLibrary: async (libraryID: number) => [
      ...new Set(
        state.associations
          .filter((row) => row.libraryID === libraryID && row.type === 1)
          .map((row) => row.tagID),
      ),
    ],
    async removeFromLibrary(
      libraryID: number,
      input: number | number[],
      progress?: (done: number, total: number) => void,
      inputTypes?: number | number[],
    ) {
      const ids = Array.isArray(input) ? input : [input];
      const types =
        inputTypes === undefined
          ? undefined
          : Array.isArray(inputTypes)
            ? inputTypes
            : [inputTypes];
      state.associations = state.associations.filter(
        (row) =>
          row.libraryID !== libraryID ||
          !ids.includes(row.tagID) ||
          (types !== undefined && !types.includes(row.type)),
      );
      progress?.(ids.length, ids.length);
    },
    async rename(_libraryID: number, oldName: string, newName: string) {
      const entry = [...names].find(([, name]) => name === oldName);
      if (entry) names.set(entry[0], newName);
    },
    async setColor(_libraryID: number, name: string, color?: string | false, position = 0) {
      if (color) colors.set(name, { color, position });
      else colors.delete(name);
    },
  };
  const confirm = vi.fn(() => true);
  vi.stubGlobal('Services', { prompt: { confirm } });
  vi.stubGlobal('Components', { utils: { cloneInto: (value: object) => structuredClone(value) } });
  const progress: number[] = [];
  vi.stubGlobal('Zotero', {
    Tags: sdk,
    getString: (key: string) => key,
    showZoteroPaneProgressMeter() {},
    updateZoteroPaneProgressMeter: (value: number) => progress.push(value),
    hideZoteroPaneOverlays() {},
  });
  const row = { tags: new Set<string>() };
  const document = {};
  const nativeTags = [...names.values()].map((name) => ({ name }));
  const selector = {
    selectedTags: new Set<string>(),
    contextTag: { name: 'topic' },
    libraryID: 1,
    shown: [] as string[],
    render() {
      return { props: { tags: nativeTags } };
    },
    forceUpdate() {
      this.shown = this.render().props.tags.map((tag) => tag.name);
    },
    async openRenamePrompt() {
      this.selectedTags.delete(this.contextTag.name);
      this.selectedTags.add(manualMarker);
      if (sdk.getID(this.contextTag.name)) {
        await sdk.rename(1, this.contextTag.name, manualMarker);
      } else {
        const color = sdk.getColor(1, this.contextTag.name);
        if (!color) throw new Error('Missing color-only tag');
        await sdk.setColor(1, this.contextTag.name, false);
        await sdk.setColor(1, manualMarker, color.color);
      }
    },
    async openDeletePrompt() {
      await sdk.removeFromLibrary(1, 1);
    },
    openTagSplitterWindow() {
      state.associations = [];
    },
    async deleteAutomatic() {
      await sdk.removeFromLibrary(1, await sdk.getAutomaticInLibrary(1), undefined, [1]);
    },
  };
  const window = {
    document,
    closed: false,
    React: {
      cloneElement: (element: { props: object }, props: object) => ({
        ...element,
        props: { ...element.props, ...props },
      }),
    },
    ZoteroPane: {
      tagSelector: selector,
      itemsView: {
        collectionTreeRows: [row],
        async setFilter(_kind: string, values: Set<string>) {
          row.tags = values;
        },
      },
    },
  } as unknown as Window;
  const errors = vi.fn();
  return {
    names,
    colors,
    state,
    sdk,
    confirm,
    progress,
    row,
    nativeTags,
    selector,
    window,
    errors,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('native managed tag isolation', () => {
  it('hides final list entries including colored-only identities without changing native data', () => {
    const h = harness();
    h.nativeTags.push({ name: prefix + 'c'.repeat(32) });
    const before = structuredClone(h.state.associations);
    h.row.tags = new Set([manualMarker, 'topic']);
    h.selector.selectedTags = new Set([manualMarker, 'topic']);
    const dispose = protectNativeTagSelector(h.window, h.selector, isSourceNoteIdentity, h.errors)!;
    expect(h.selector.shown).toEqual(['topic', nearMarker, 'imported']);
    expect([...h.row.tags]).toEqual(['topic']);
    expect([...h.selector.selectedTags]).toEqual(['topic']);
    expect(h.state.associations).toEqual(before);
    expect(h.nativeTags.map((tag) => tag.name)).toContain(manualMarker);
    dispose();
    expect(h.selector.shown).toContain(manualMarker);
    expect(h.state.associations).toEqual(before);
  });

  it('clears only ordinary automatic associations and preserves manual occurrences of the same name', async () => {
    const h = harness();
    const stopMutations = protectNativeTagMutations(isSourceNoteIdentity);
    const stopSelector = protectNativeTagSelector(
      h.window,
      h.selector,
      isSourceNoteIdentity,
      h.errors,
    )!;
    await h.selector.deleteAutomatic();
    expect(h.state.associations).toEqual([
      { itemID: 1, tagID: 1, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 2, type: 1, libraryID: 1 },
      { itemID: 2, tagID: 3, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 4, type: 0, libraryID: 1 },
      { itemID: 9, tagID: 5, type: 1, libraryID: 2 },
    ]);
    expect(h.progress).toEqual([100]);
    h.confirm.mockClear();
    await h.selector.deleteAutomatic();
    expect(h.confirm).not.toHaveBeenCalled();
    stopSelector();
    stopMutations();
  });

  it('rejects reserved renames and restores the native selected tag after prompt rejection', async () => {
    const h = harness();
    const stopMutations = protectNativeTagMutations(isSourceNoteIdentity);
    const stopSelector = protectNativeTagSelector(
      h.window,
      h.selector,
      isSourceNoteIdentity,
      h.errors,
    )!;
    h.selector.selectedTags.add('topic');
    await h.selector.openRenamePrompt();
    expect([...h.selector.selectedTags]).toEqual(['topic']);
    expect(h.names.get(3)).toBe('topic');
    await expect(h.sdk.rename(1, automaticMarker, 'renamed')).rejects.toMatchObject({
      name: 'NeoManagedTagEditError',
    });
    await expect(h.sdk.setColor(1, manualMarker, '#ff0000')).rejects.toMatchObject({
      name: 'NeoManagedTagEditError',
    });
    expect(h.names.get(1)).toBe(manualMarker);
    stopSelector();
    stopMutations();
  });

  it('restores ordinary color-only tags and their position when a reserved rename is rejected', async () => {
    const h = harness();
    h.colors.set('color-only', { color: '#ff0000', position: 3 });
    h.selector.contextTag = { name: 'color-only' };
    const stopMutations = protectNativeTagMutations(isSourceNoteIdentity);
    const stopSelector = protectNativeTagSelector(
      h.window,
      h.selector,
      isSourceNoteIdentity,
      h.errors,
    )!;
    h.selector.selectedTags.add('color-only');
    await h.selector.openRenamePrompt();
    expect(h.colors.get('color-only')).toEqual({ color: '#ff0000', position: 3 });
    expect(h.colors.has(manualMarker)).toBe(false);
    expect([...h.selector.selectedTags]).toEqual(['color-only']);
    stopSelector();
    stopMutations();
  });
  it('preserves managed IDs in direct bulk cleanup and retires guards inside later native chains', async () => {
    const h = harness();
    const stop = protectNativeTagMutations(isSourceNoteIdentity);
    await h.sdk.removeFromLibrary(1, [1, 2, 4]);
    expect(h.state.associations.some((row) => row.tagID === 4)).toBe(false);
    expect(h.state.associations.filter((row) => row.tagID < 3)).toEqual([
      { itemID: 1, tagID: 1, type: 0, libraryID: 1 },
      { itemID: 1, tagID: 2, type: 1, libraryID: 1 },
    ]);
    const guarded = h.sdk.removeFromLibrary;
    h.sdk.removeFromLibrary = (...args) => guarded(...args);
    stop();
    await h.sdk.removeFromLibrary(1, 1);
    expect(h.state.associations.some((row) => row.tagID === 1)).toBe(false);
  });

  it('does not admit cleanup after its view retires during native lookup', async () => {
    const h = harness();
    let finish!: (ids: number[]) => void;
    h.sdk.getAutomaticInLibrary = () =>
      new Promise<number[]>((resolve) => {
        finish = resolve;
      });
    const before = structuredClone(h.state.associations);
    const stop = protectNativeTagSelector(h.window, h.selector, isSourceNoteIdentity, h.errors)!;
    const deleting = h.selector.deleteAutomatic();
    stop();
    finish([2, 3, 5]);
    await deleting;
    expect(h.state.associations).toEqual(before);
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it('does not let an older disposal reveal metadata owned by a newer controller', () => {
    const h = harness();
    const first = protectNativeTagSelector(h.window, h.selector, isSourceNoteIdentity, h.errors)!;
    const second = protectNativeTagSelector(h.window, h.selector, isSourceNoteIdentity, h.errors)!;
    first();
    h.selector.forceUpdate();
    expect(h.selector.shown).not.toContain(manualMarker);
    second();
    expect(h.selector.shown).toContain(manualMarker);
  });
});
