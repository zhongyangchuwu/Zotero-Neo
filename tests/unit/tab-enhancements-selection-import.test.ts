import { afterEach, describe, expect, it, vi } from 'vitest';
import { importReadingSelection } from '../../src/modules/tab-enhancements/selection-import';
import type { MainResolvedTargets } from '../../src/main/action-targets';
import type { TabGroupManager } from '../../src/modules/tab-enhancements/types';
import type { MainWindow } from '../../src/core/contracts';

function pdf(key: string) {
  return {
    key,
    libraryID: 1,
    deleted: false,
    attachmentFilename: `${key}.pdf`,
    isRegularItem: () => false,
    isPDFAttachment: () => true,
    getField: () => key,
  };
}

function setup(items: unknown[], missing = 0) {
  const importDocuments = vi.fn(
    async (
      _destination: unknown,
      _documents: readonly unknown[],
      _hostID: string,
      _isCurrent: () => boolean,
    ) => 2,
  );
  const groups = {
    importDocuments,
    view: () => ({ groups: [{ id: 'g', name: 'Reading' }] }),
  } as unknown as TabGroupManager;
  const isCurrent = vi.fn(() => true);
  const options = {
    window: {} as MainWindow,
    language: 'en' as const,
    targets: { items, missing } as unknown as MainResolvedTargets,
    groups,
    hostID: 'host',
    titleFormat: '{title}',
    create: true,
    isCurrent,
  };
  return { options, importDocuments, isCurrent };
}

afterEach(() => vi.unstubAllGlobals());

describe('reading group selection import', () => {
  it('pins selections, asks about ambiguous PDFs and confirms before opening', async () => {
    const one = pdf('ONE');
    const two = pdf('TWO');
    const parent = {
      deleted: false,
      isRegularItem: () => true,
      getAttachments: () => [1, 2],
      getField: () => 'Parent',
    };
    const items: unknown[] = [one, parent];
    const state = setup(items, 1);
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => (id === 1 ? one : two) } });
    const alerts: string[] = [];
    const confirm = vi.fn((_window: unknown, _title: string, text: string) => {
      expect(text).toContain('Open the selected PDFs');
      expect(state.importDocuments).not.toHaveBeenCalled();
      return true;
    });
    vi.stubGlobal('Services', {
      prompt: {
        alert: (_window: unknown, _title: string, text: string) => alerts.push(text),
        select: (
          _window: unknown,
          _title: string,
          _text: string,
          _choices: string[],
          selected: { value: number },
        ) => {
          items.splice(0);
          selected.value = 1;
          return true;
        },
        prompt: (_window: unknown, _title: string, _text: string, value: { value: string }) => {
          value.value = 'Reading';
          return true;
        },
        confirm,
      },
    });
    await importReadingSelection(state.options);
    expect(confirm).toHaveBeenCalledOnce();
    const [destination, documents, hostID, fence] = state.importDocuments.mock.calls[0]!;
    expect(destination).toEqual({ name: 'Reading' });
    expect(documents).toEqual([
      expect.objectContaining({ document: expect.objectContaining({ key: 'ONE' }) }),
      expect.objectContaining({ document: expect.objectContaining({ key: 'TWO' }) }),
    ]);
    expect(hostID).toBe('host');
    expect(fence).toBe(state.isCurrent);
    expect(alerts[0]).toContain('1');
    expect(alerts[1]).toContain('2');
  });
  it('does not open when the user cancels confirmation or the host retires', async () => {
    const state = setup([pdf('ONE')]);
    const prompt = {
      alert: vi.fn(),
      prompt: (_w: unknown, _t: unknown, _s: unknown, value: { value: string }) => {
        value.value = 'Reading';
        return true;
      },
      confirm: vi.fn(() => false),
    };
    vi.stubGlobal('Services', { prompt });
    await importReadingSelection(state.options);
    expect(state.importDocuments).not.toHaveBeenCalled();
    prompt.confirm.mockImplementation(() => {
      state.isCurrent.mockReturnValue(false);
      return true;
    });
    await importReadingSelection(state.options);
    expect(state.importDocuments).not.toHaveBeenCalled();
  });
  it('reports only the successful count and suppresses results after retirement', async () => {
    const state = setup([pdf('ONE')]);
    const alert = vi.fn((_window: unknown, _title: string, _message: string) => {});
    vi.stubGlobal('Services', {
      prompt: {
        alert,
        select: (
          _w: unknown,
          _t: unknown,
          _s: unknown,
          _c: unknown,
          selected: { value: number },
        ) => {
          selected.value = 0;
          return true;
        },
        confirm: () => true,
      },
    });
    state.importDocuments.mockResolvedValueOnce(1).mockImplementationOnce(async () => {
      state.isCurrent.mockReturnValue(false);
      return 0;
    });
    await importReadingSelection({ ...state.options, create: false });
    expect(alert.mock.calls[0]?.[2]).toContain('1');
    await importReadingSelection({ ...state.options, create: false });
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it('disambiguates identical PDF labels and imports the selected attachment', async () => {
    const attachments = ['ONE', 'TWO', 'THREE'].map((key, index) => ({
      ...pdf(key),
      getField: () => 'Full Text PDF',
      attachmentFilename: index === 0 ? 'first.pdf' : 'same.pdf',
    }));
    const parent = {
      deleted: false,
      isRegularItem: () => true,
      getAttachments: () => [0, 1, 2],
      getField: () => 'Parent',
    };
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => attachments[id] } });
    const state = setup([parent]);
    let labels: string[] = [];
    vi.stubGlobal('Services', {
      prompt: {
        alert: vi.fn(),
        select: (
          _w: unknown,
          _t: unknown,
          _s: unknown,
          choices: string[],
          selected: { value: number },
        ) => {
          labels = choices;
          selected.value = 2;
          return true;
        },
        prompt: (_w: unknown, _t: unknown, _s: unknown, value: { value: string }) => {
          value.value = 'Reading';
          return true;
        },
        confirm: () => true,
      },
    });
    await importReadingSelection(state.options);
    expect(labels[0]).toContain('first.pdf');
    expect(labels[1]).toContain('TWO');
    expect(labels[2]).toContain('THREE');
    expect(state.importDocuments.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ document: expect.objectContaining({ key: 'THREE' }) }),
    ]);
  });
});
