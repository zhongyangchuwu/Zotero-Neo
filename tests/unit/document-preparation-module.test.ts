import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createDocumentPreparationModule,
  DocumentPreparationController,
  type PreparationPresentation,
} from '../../src/modules/document-preparation';
import { DocumentFixture } from '../fixtures/dialog-dom';

vi.mock('../../src/platform/cross-compartment', () => ({ isDeadObject: () => false }));
vi.mock('../../src/platform/document-preparation', () => ({
  documentPreparationHost: () => ({}),
  documentPreparationAbort: () => {},
}));
vi.mock('../../src/document-analysis/preparation', () => ({
  MAX_PREPARATION_FILES: 100,
  DocumentPreparationQueue: class {
    rows = [];
    running = false;
    storageFailed = false;
    init = vi.fn(async () => {});
    subscribe = vi.fn(() => () => {});
    stop = vi.fn();
    dispose = vi.fn();
  },
}));

describe('document preparation capability', () => {
  it('retires only its own presentation when another reader replaces it in the same window', () => {
    const doc = new DocumentFixture();
    const window = {
      document: doc,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const presentation: PreparationPresentation = {
      window,
      targets: [],
      language: () => 'en',
      themeRoot: () => () => {},
      isCurrent: () => true,
    };
    const logger = { debug: vi.fn(), diagnostic: vi.fn() };
    const service = new DocumentPreparationController(vi.fn());
    const firstHost = new ModuleHost(logger, () => true);
    const secondHost = new ModuleHost(logger, () => true);
    const first = createDocumentPreparationModule(firstHost, 'reader-normal', service);
    const second = createDocumentPreparationModule(secondHost, 'reader-normal', service);

    expect(first.open(presentation)).toBe(true);
    const firstDialog = doc.find('section');
    expect(second.open(presentation)).toBe(true);
    const secondDialog = doc.find('section');
    expect(firstDialog.isConnected).toBe(false);
    expect(secondDialog.isConnected).toBe(true);
    firstHost.dispose();
    expect(secondDialog.isConnected).toBe(true);
    expect(first.open(presentation)).toBe(false);
    secondHost.dispose();
    expect(secondDialog.isConnected).toBe(false);
    expect(service.queue.stop).not.toHaveBeenCalled();
    expect(service.queue.dispose).not.toHaveBeenCalled();
  });
});
