import { vi } from 'vitest';

/** Only the Zotero file/item boundary is simulated; repositories and codecs stay real. */
export function artifactHost() {
  const files = new Map<string, string>();
  let sequence = 10;
  class File {
    constructor(public path: string) {}
    clone() {
      return new File(this.path);
    }
    append(name: string) {
      this.path += `/${name}`;
    }
    exists() {
      return files.has(this.path);
    }
    get fileSize() {
      return Buffer.byteLength(files.get(this.path) ?? '');
    }
    get leafName() {
      return this.path.split('/').at(-1)!;
    }
    createUnique() {
      this.path = this.path.replace('.json', `-${sequence++}.json`);
      files.set(this.path, '');
    }
  }
  const items = new Map<number, Zotero.Item>();
  const children: Zotero.Item[] = [];
  const parent = {
    id: 1,
    key: 'PARENT01',
    libraryID: 2,
    deleted: false,
    isRegularItem: () => true,
    getAttachments: (trashed = false) =>
      children.filter((item) => trashed || !item.deleted).map((item) => item.id),
  } as unknown as Zotero.Item;
  items.set(1, parent);
  const library = { editable: true, filesEditable: true };
  let libraryURI = 'http://zotero.org/users/42';
  function addJSON(text: string | null, name = 'zotero-neo-external.json'): Zotero.Item {
    const id = sequence++,
      path = `/stored/${id}/${name}`;
    if (text !== null) files.set(path, text);
    const item = {
      id,
      key: `JSON${String(id).padStart(4, '0')}`,
      parentID: 1,
      libraryID: 2,
      attachmentFilename: name,
      attachmentContentType: 'application/json',
      attachmentLinkMode: 0,
      deleted: false,
      getFilePathAsync: async () => (files.has(path) ? path : false),
    } as unknown as Zotero.Item;
    items.set(id, item);
    children.push(item);
    return item;
  }
  const imports = vi.fn(
    async (options: {
      file: File;
      parentItemID: number;
      libraryID: number;
      contentType: string;
    }) => {
      if (
        options.parentItemID !== 1 ||
        options.libraryID !== 2 ||
        options.contentType !== 'application/json'
      )
        throw new Error('Wrong attachment parent or type');
      return addJSON(files.get(options.file.path)!, options.file.leafName);
    },
  );
  vi.stubGlobal('Zotero', {
    Items: {
      getAsync: async (ids: number | number[]) =>
        Array.isArray(ids)
          ? ids.map((id) => items.get(id)).filter(Boolean)
          : (items.get(ids) ?? false),
    },
    URI: {
      getLibraryURI: () => libraryURI,
      getLocalUserURI: () => 'http://zotero.org/users/local/knownLocal',
    },
    Libraries: { get: () => library, userLibraryID: 2 },
    Attachments: { importFromFile: imports },
    File: {
      pathToFile: (path: string) => new File(path),
      getContentsAsync: async (path: string) => files.get(path),
      putContentsAsync: async (path: string, text: string) => {
        files.set(path, text);
      },
      removeIfExists: async (path: string) => {
        files.delete(path);
      },
    },
    Utilities: { randomString: () => `revision-${sequence++}` },
    getTempDirectory: () => new File('/temp'),
  });
  return {
    files,
    parent,
    children,
    library,
    imports,
    addJSON,
    setURI: (uri: string) => {
      libraryURI = uri;
    },
  };
}
