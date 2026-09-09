export interface Logger {
  debug(message: string): void;
  diagnostic(message: string): void;
}

export class ZoteroLogger implements Logger {
  readonly #prefix: string;
  readonly #fileName: string;
  #epoch = 0;

  constructor(prefix = '[ZoteroNeo]', fileName = 'zotero-neo-startup.log') {
    this.#prefix = prefix;
    this.#fileName = fileName;
  }

  debug(message: string): void {
    Zotero.debug(`${this.#prefix} ${message}`);
  }

  diagnostic(message: string): void {
    try {
      if (!this.#epoch) this.#epoch = Date.now();
      const directory =
        typeof Zotero.getProfileDirectory === 'function'
          ? Zotero.getProfileDirectory()
          : Services.dirsvc.get('ProfD', Components.interfaces.nsIFile);
      const file = directory.clone();
      file.append(this.#fileName);
      const stream = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(
        Components.interfaces.nsIFileOutputStream,
      );
      stream.init(file, 0x02 | 0x08 | 0x10, 0o600, 0);
      const line = `${Date.now() - this.#epoch}ms  ${message}\n`;
      stream.write(line, line.length);
      stream.close();
    } catch {
      // Diagnostics must never block plugin startup or reader injection.
    }
  }
}
