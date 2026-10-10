import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportDiagnosticError, ZoteroLogger } from '../../src/core/logging';

function nativeLogHost(
  options: { writeError?: unknown; initError?: unknown; debugError?: unknown } = {},
) {
  const chunks: Buffer[] = [];
  const debug = vi.fn((_message: string) => {
    if (options.debugError) throw options.debugError;
  });
  const stream = {
    init: () => {},
    write: (text: string, count: number) => {
      if (options.writeError) throw options.writeError;
      chunks.push(Buffer.from(text, 'latin1').subarray(0, count));
    },
    close: vi.fn(),
  };
  const converter = {
    init: () => {
      if (options.initError) throw options.initError;
    },
    writeString: (text: string) => {
      if (options.writeError) throw options.writeError;
      chunks.push(Buffer.from(text, 'utf8'));
      return true;
    },
    close: vi.fn(() => stream.close()),
  };
  const file = { clone: () => file, append: () => {} };
  vi.stubGlobal('Zotero', { debug, getProfileDirectory: () => file });
  vi.stubGlobal('Components', {
    classes: {
      '@mozilla.org/network/file-output-stream;1': { createInstance: () => stream },
      '@mozilla.org/intl/converter-output-stream;1': { createInstance: () => converter },
    },
    interfaces: { nsIFileOutputStream: {}, nsIConverterOutputStream: {} },
  });
  return { debug, stream, converter, text: () => Buffer.concat(chunks).toString('utf8') };
}

afterEach(() => vi.unstubAllGlobals());

describe('native diagnostic logging', () => {
  it('preserves Unicode error context in the profile file', () => {
    const host = nativeLogHost();
    new ZoteroLogger().diagnostic('Reader 中文批注 📖');
    expect(host.text()).toContain('Reader 中文批注 📖\n');
    expect(host.stream.close).toHaveBeenCalledOnce();
  });

  it('closes the native stream after a failed write and reports the failure only once', () => {
    const host = nativeLogHost({ writeError: new Error('disk full') });
    const logger = new ZoteroLogger();
    logger.diagnostic('first failure');
    logger.diagnostic('same failed destination');
    expect(host.stream.close).toHaveBeenCalledTimes(2);
    expect(host.debug).toHaveBeenCalledOnce();
    expect(host.debug.mock.calls[0]?.[0]).toContain('disk full');
  });

  it('does not close an uninitialized converter when initialization fails', () => {
    const host = nativeLogHost({ initError: new Error('converter unavailable') });
    new ZoteroLogger().diagnostic('Reader failed');
    expect(host.converter.close).not.toHaveBeenCalled();
    expect(host.stream.close).toHaveBeenCalledOnce();
    expect(host.debug.mock.calls[0]?.[0]).toContain('converter unavailable');
  });

  it('keeps profile logging usable when the native Debug sink throws', () => {
    const host = nativeLogHost({ debugError: new Error('Debug unavailable') });
    const logger = new ZoteroLogger();
    logger.debug('Reader failed');
    logger.diagnostic('persistent Reader failure');
    expect(host.text()).toContain('persistent Reader failure\n');
  });
});

describe('failure diagnostic reporting', () => {
  it('preserves the cause stack even when the outer error cannot be inspected or printed', () => {
    const host = nativeLogHost({ debugError: new Error('Debug unavailable') });
    const original = new TypeError('native Reader failure');
    const failure = Object.create(null, {
      [Symbol.toPrimitive]: {
        value: () => {
          throw new Error('dead error wrapper');
        },
      },
      stack: {
        get: () => {
          throw new Error('dead stack wrapper');
        },
      },
      cause: { value: original },
    });
    reportDiagnosticError(new ZoteroLogger(), 'Reader rescan failed', failure);
    expect(host.text()).toContain(original.stack);
    expect(host.text()).toContain('[unprintable error]');
    expect(host.text()).toContain('[stack unavailable]');
  });

  it('keeps the original stack available when the cause getter throws', () => {
    const host = nativeLogHost();
    const failure = new Error('original Reader failure');
    Object.defineProperty(failure, 'cause', {
      get: () => {
        throw new Error('dead cause wrapper');
      },
    });
    reportDiagnosticError(new ZoteroLogger(), 'Reader rescan failed', failure);
    expect(host.text()).toContain(failure.stack);
    expect(host.text()).toContain('[cause unavailable]');
  });

  it('bounds cyclic causes without repeatedly reading the native wrapper', () => {
    const host = nativeLogHost();
    const failure = new Error('cyclic Reader failure');
    const cause = vi.fn(() => failure);
    Object.defineProperty(failure, 'cause', { get: cause });
    reportDiagnosticError(new ZoteroLogger(), 'Reader rescan failed', failure);
    expect(host.text()).toContain(failure.stack);
    expect(host.text()).toContain('[cyclic error cause]');
    expect(cause).toHaveBeenCalledOnce();
  });

  it('bounds deep cause chains while retaining the first native exception', () => {
    const host = nativeLogHost();
    let failure = new Error('outside diagnostic limit');
    for (let depth = 9; depth >= 0; depth -= 1)
      failure = new Error(`Reader failure level ${depth}`, { cause: failure });
    reportDiagnosticError(new ZoteroLogger(), 'Reader rescan failed', failure);
    expect(host.text()).toContain(failure.stack);
    expect(host.text()).toContain('[error cause limit reached]');
    expect(host.text()).not.toContain('outside diagnostic limit');
  });

  it('retains the failure in Debug when profile writes and their fallback logger fail', () => {
    const host = nativeLogHost({ writeError: new Error('disk full') });
    host.debug.mockImplementation((message: string) => {
      if (message.includes('diagnostic log write failed'))
        throw new Error('secondary Debug failure');
    });
    const original = new TypeError('native Reader failure');
    reportDiagnosticError(new ZoteroLogger(), 'Reader rescan failed', original);
    expect(host.debug.mock.calls[0]?.[0]).toContain(original.stack);
    expect(host.stream.close).toHaveBeenCalledOnce();
  });
});
