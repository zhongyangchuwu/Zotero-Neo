// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import { React } from '../../src/ui/react/runtime';
import { createReactView } from '../../src/ui/react/view';
import { ReaderPage } from '../../src/ui/react/surfaces/settings-reader';
import type { ReactView } from '../../src/ui/react/types';
import type { ReaderPageModel } from '../../src/main/settings-reader-model';
import { SettingsReader } from '../../src/main/settings-reader';

vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: vi.fn(),
  changeReferenceKey: vi.fn(),
}));
vi.mock('../../src/platform/document-credentials', () => ({
  readMinerUToken: vi.fn(() => ''),
  saveMinerUToken: vi.fn(),
}));
vi.mock('../../src/platform/reference-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform/reference-http')>()),
  referenceRequest: vi.fn(),
}));
import { changeReferenceKey, readReferenceKey } from '../../src/platform/reference-credentials';
import { referenceRequest } from '../../src/platform/reference-http';

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
}

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const changed = vi.fn(() => view?.update(reader.model()));
  const preferences = {
    get: (_key: string, fallback: unknown) => fallback,
    has: () => false,
    set: () => {},
    clear: () => {},
  } as unknown as PreferenceStore;
  let view: ReactView<ReaderPageModel> | undefined;
  const reader = new SettingsReader({} as MainWindow, preferences, 'en', changed);
  view = createReactView(
    root,
    (model) =>
      React.createElement(ReaderPage, { model, dispatch: (command) => reader.dispatch(command) }),
    reader.model(),
  );
  const section = (): HTMLElement => {
    const nodes = root.querySelectorAll('section');
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes.item(index) as HTMLElement | null;
      if (node?.querySelector('h3')?.textContent === reader.model().semanticScholar.title)
        return node;
    }
    throw new Error('Reference credential section not found');
  };
  const input = () => section().querySelector<HTMLInputElement>('input[type=password]')!;
  const button = (label: string): HTMLButtonElement => {
    const nodes = section().querySelectorAll('button');
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes.item(index) as HTMLButtonElement | null;
      if (node?.textContent === label) return node;
    }
    throw new Error(`Missing credential button: ${label}`);
  };
  const dispose = () => {
    view?.dispose();
    reader.dispose();
    root.remove();
  };
  return { root, reader, changed, input, button, dispose };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readReferenceKey).mockReturnValue('stored-secret');
  vi.mocked(changeReferenceKey).mockResolvedValue(undefined);
});

describe('Reader Settings reference credentials', () => {
  it('keeps stored keys private and saves or forgets only on explicit action', async () => {
    const ui = mount();
    await settle();
    const model = ui.reader.model().semanticScholar;
    expect(model.configured).toBe(true);
    expect(ui.input().value).toBe('');
    expect(ui.root.textContent).not.toContain('stored-secret');
    expect(changeReferenceKey).not.toHaveBeenCalled();
    ui.input().value = 'replacement-secret';
    ui.button(model.saveLabel).click();
    expect(ui.input().value).toBe('');
    expect(changeReferenceKey).toHaveBeenCalledWith('replacement-secret');
    await settle();
    expect(ui.root.textContent).not.toContain('replacement-secret');
    ui.button(model.forgetLabel).click();
    expect(changeReferenceKey).toHaveBeenLastCalledWith(null);
    await settle();
    expect(referenceRequest).not.toHaveBeenCalled();
    ui.dispose();
  });

  it('rejects a blank key without changing anonymous credentials', async () => {
    vi.mocked(readReferenceKey).mockReturnValue('');
    const ui = mount();
    await settle();
    const model = ui.reader.model().semanticScholar;
    expect(model.configured).toBe(false);
    ui.button(model.saveLabel).click();
    expect(ui.reader.model().semanticScholar.error).toBe(true);
    expect(changeReferenceKey).not.toHaveBeenCalled();
    expect(referenceRequest).not.toHaveBeenCalled();
    ui.dispose();
  });

  it('clears the input and ignores a late save after the page closes', async () => {
    const pending = Promise.withResolvers<void>();
    vi.mocked(changeReferenceKey).mockReturnValue(pending.promise);
    const ui = mount();
    await settle();
    const input = ui.input();
    input.value = 'late-secret';
    ui.button(ui.reader.model().semanticScholar.saveLabel).click();
    expect(input.value).toBe('');
    const changedBeforeDispose = ui.changed.mock.calls.length;
    ui.dispose();
    pending.resolve();
    await settle();
    expect(ui.changed).toHaveBeenCalledTimes(changedBeforeDispose);
    expect(referenceRequest).not.toHaveBeenCalled();
  });
});
