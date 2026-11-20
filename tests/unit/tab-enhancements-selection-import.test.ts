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
  const importDocuments = vi.fn<TabGroupManager['importDocuments']>(
    async (_destination, documents) => ({ done: documents.length }),
  );
  const view = vi.fn(() => ({ groups: [{ id: 'g', name: 'Reading' }] }));
  const groups = {
    importDocuments,
    view,
  } as unknown as TabGroupManager;
  const isCurrent = vi.fn(() => true);
  const status = vi.fn<(message: string) => void>();
  const alert = vi.fn();
  const options = {
    window: {} as MainWindow,
    language: 'en' as const,
    targets: { items, missing } as unknown as MainResolvedTargets,
    groups,
    hostID: 'host',
    titleFormat: '{title}',
    create: true,
    logger: { debug: vi.fn(), diagnostic: vi.fn() },
    status,
    isCurrent,
  };
  return { options, importDocuments, view, isCurrent, status, alert };
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
    const state = setup(items);
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => (id === 1 ? one : two) } });
    const confirm = vi.fn((_window: unknown, _title: string, text: string) => {
      expect(text).toContain('Open the selected PDFs');
      expect(state.importDocuments).not.toHaveBeenCalled();
      expect(state.status).not.toHaveBeenCalled();
      return true;
    });
    vi.stubGlobal('Services', {
      prompt: {
        alert: state.alert,
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
    expect(state.alert).not.toHaveBeenCalled();
    expect(state.status).toHaveBeenCalledExactlyOnceWith('✓ PDF views opened and grouped: 2');
  });
  it('does not open when the user cancels confirmation or the host retires', async () => {
    const state = setup([pdf('ONE')]);
    const prompt = {
      alert: state.alert,
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
    expect(state.alert).not.toHaveBeenCalled();
    expect(state.status).not.toHaveBeenCalled();
  });
  it('reports the selected destination once, and suppresses results after retirement', async () => {
    const state = setup([pdf('ONE')]);
    vi.stubGlobal('Services', {
      prompt: {
        alert: state.alert,
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
    state.importDocuments
      .mockImplementationOnce(async () => {
        expect(state.status).not.toHaveBeenCalled();
        return { done: 1 };
      })
      .mockImplementationOnce(async () => {
        state.isCurrent.mockReturnValue(false);
        return { done: 0, unavailable: 1 };
      });
    await importReadingSelection({ ...state.options, create: false });
    expect(state.importDocuments.mock.calls[0]?.[0]).toEqual({ groupID: 'g' });
    expect(state.status).toHaveBeenCalledExactlyOnceWith('✓ PDF views opened and grouped: 1');
    await importReadingSelection({ ...state.options, create: false });
    expect(state.status).toHaveBeenCalledOnce();
    expect(state.alert).not.toHaveBeenCalled();
  });
  it('skips a declined ambiguous item and combines selection skips with actual open failures', async () => {
    const parent = {
      deleted: false,
      isRegularItem: () => true,
      getAttachments: () => [0, 1],
      getField: () => 'Ambiguous',
    };
    const noPDF = { ...pdf('NO-PDF'), isPDFAttachment: () => false };
    const unreadable = {
      ...pdf('UNREADABLE'),
      isPDFAttachment: () => {
        throw new Error('PDF lookup failed');
      },
    };
    const state = setup([pdf('FIRST'), parent, noPDF, unreadable, pdf('LAST')], 1);
    const attachments = [pdf('A'), pdf('B')];
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => attachments[id] } });
    const select = vi.fn(() => false);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('Services', {
      prompt: {
        alert: state.alert,
        select,
        prompt: (_w: unknown, _t: unknown, _s: unknown, value: { value: string }) => {
          value.value = 'Reading';
          return true;
        },
        confirm,
      },
    });
    state.importDocuments.mockResolvedValue({ done: 1, failed: 1 });

    await importReadingSelection(state.options);

    expect(select).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(state.importDocuments.mock.calls[0]?.[1].map(({ document }) => document.key)).toEqual([
      'FIRST',
      'LAST',
    ]);
    expect(state.alert).not.toHaveBeenCalled();
    expect(state.status).toHaveBeenCalledExactlyOnceWith(
      '→ PDF views opened and grouped: 1 · Skipped 5 (1 without a usable PDF, 1 unavailable, 1 not chosen or duplicate, 2 failed)',
    );
  });

  it('reports when none can be opened without prompting for a destination or confirmation', async () => {
    const noPDF = { ...pdf('NO-PDF'), isPDFAttachment: () => false };
    const deleted = { ...pdf('DELETED'), deleted: true };
    const state = setup([noPDF, deleted], 1);
    const prompt = { alert: state.alert, prompt: vi.fn(), confirm: vi.fn(), select: vi.fn() };
    vi.stubGlobal('Services', { prompt });

    await importReadingSelection(state.options);

    for (const dialog of Object.values(prompt)) expect(dialog).not.toHaveBeenCalled();
    expect(state.importDocuments).not.toHaveBeenCalled();
    expect(state.status).toHaveBeenCalledExactlyOnceWith(
      '✗ No PDF views opened and grouped · Skipped 3 (1 without a usable PDF, 2 unavailable)',
    );
  });

  it('reports a missing or blank destination without an alert or confirmation', async () => {
    const state = setup([pdf('ONE')]);
    state.view.mockReturnValue({ groups: [] });
    const prompt = {
      alert: state.alert,
      prompt: vi.fn(() => true),
      confirm: vi.fn(),
      select: vi.fn(),
    };
    vi.stubGlobal('Services', { prompt });

    await importReadingSelection({ ...state.options, create: false });
    await importReadingSelection(state.options);

    expect(prompt.select).not.toHaveBeenCalled();
    expect(prompt.confirm).not.toHaveBeenCalled();
    expect(state.alert).not.toHaveBeenCalled();
    expect(state.importDocuments).not.toHaveBeenCalled();
    expect(state.status.mock.calls).toEqual([
      ['There are no saved reading groups to add to.'],
      ['Enter a group name'],
    ]);
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
