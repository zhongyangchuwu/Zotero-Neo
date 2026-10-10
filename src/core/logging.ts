export interface Logger {
  debug(message: string): void;
  diagnostic(message: string): void;
}

/** Reports to independent sinks without letting a logging failure escape. */
export function reportDiagnostic(logger: Logger, message: string): void {
  try {
    logger.debug(message);
  } catch {}
  try {
    logger.diagnostic(message);
  } catch {}
}

/** Preserves native stacks and bounded cause chains without inspecting DOM owners. */
export function reportDiagnosticError(logger: Logger, label: string, error: unknown): void {
  reportDiagnostic(logger, `${label}: ${formatDiagnosticError(error)}`);
}

function formatDiagnosticError(error: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 8; depth += 1) {
    if (seen.has(error)) {
      lines.push('[cyclic error cause]');
      return lines.join('\n');
    }
    seen.add(error);
    let summary: string;
    try {
      summary = String(error);
    } catch {
      summary = '[unprintable error]';
    }
    lines.push(depth ? `Caused by: ${summary}` : summary);
    if ((typeof error !== 'object' || error === null) && typeof error !== 'function')
      return lines.join('\n');
    try {
      const stack: unknown = Reflect.get(error, 'stack');
      if (typeof stack === 'string' && stack) lines.push(stack);
    } catch {
      lines.push('[stack unavailable]');
    }
    try {
      const cause: unknown = Reflect.get(error, 'cause');
      if (cause === undefined) return lines.join('\n');
      error = cause;
    } catch {
      lines.push('[cause unavailable]');
      return lines.join('\n');
    }
  }
  lines.push('[error cause limit reached]');
  return lines.join('\n');
}

export class ZoteroLogger implements Logger {
  readonly #prefix: string;
  readonly #fileName: string;
  #epoch = 0;
  #writeFailureReported = false;

  constructor(prefix = '[ZoteroNeo]', fileName = 'zotero-neo-startup.log') {
    this.#prefix = prefix;
    this.#fileName = fileName;
  }

  debug(message: string): void {
    try {
      Zotero.debug(`${this.#prefix} ${message}`);
    } catch {}
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
      let converter: nsIConverterOutputStream | undefined;
      try {
        stream.init(file, 0x02 | 0x08 | 0x10, 0o600, 0);
        const output = Components.classes[
          '@mozilla.org/intl/converter-output-stream;1'
        ].createInstance(Components.interfaces.nsIConverterOutputStream);
        output.init(stream, 'UTF-8');
        converter = output;
        const line = `${Date.now() - this.#epoch}ms  ${message}\n`;
        if (!output.writeString(line)) throw new Error('Incomplete diagnostic log write');
      } finally {
        // Closing an uninitialized native converter can crash Gecko.
        if (converter) converter.close();
        else stream.close();
      }
    } catch (error) {
      if (this.#writeFailureReported) return;
      this.#writeFailureReported = true;
      this.debug(`diagnostic log write failed: ${formatDiagnosticError(error)}`);
    }
  }
}
