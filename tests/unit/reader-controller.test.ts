import { afterEach, describe, expect, it } from 'vitest';

import type { ReaderControllerDependencies } from '../../src/core/contracts';
import { createReaderController } from '../../src/reader/controller';

const originalZotero = Reflect.get(globalThis, 'Zotero');

afterEach(() => {
  if (originalZotero === undefined) Reflect.deleteProperty(globalThis, 'Zotero');
  else Reflect.set(globalThis, 'Zotero', originalZotero);
});

describe('reader discovery diagnostics', () => {
  it('records registration once but does not log unchanged rescans', () => {
    const diagnostics: string[] = [];
    const readerService = {
      _readers: [],
      registerEventListener: () => Symbol('reader-listener'),
      unregisterEventListener: () => {},
      getByTabID: () => null,
    };
    Reflect.set(globalThis, 'Zotero', { Reader: readerService });

    const dependencies = {
      preferences: {
        has: () => false,
        get: (_key: string, fallback: boolean | number | string) => fallback,
        set: () => {},
      },
      logger: {
        debug: () => {},
        diagnostic: (message: string) => diagnostics.push(message),
      },
      delegateMain: () => {},
    } as ReaderControllerDependencies;
    const controller = createReaderController(dependencies);
    const window = { Zotero_Tabs: { _tabs: [] } } as unknown as _ZoteroTypes.MainWindow;

    controller.start('zotero-neo@zotero-neo');
    controller.rescan(window);
    controller.rescan(window);
    controller.rescan(window);
    controller.shutdown();

    expect(diagnostics).toEqual(['reader listeners registered']);
  });
});
