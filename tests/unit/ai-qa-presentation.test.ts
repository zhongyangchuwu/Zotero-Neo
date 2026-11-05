import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIQAPanelCallbacks, AIQAPanelLease, ReaderRuntime } from '../../src/toolkit/reader';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { AIQAReaderPresentationPort } from '../../src/ai-qa/reader-port';
import { AI_QA_TEXT_KEYS, type AIQAView, type AIQAViewModel } from '../../src/ai-qa/view-contracts';
import { AIQAPresentation } from '../../src/ai-qa/presentation';

const native = vi.hoisted(() => ({
  callbacks: null as unknown,
  mounts: new Map<unknown, { release: () => void; retire: () => void }>(),
  mountView: vi.fn(),
  releaseUI: vi.fn(),
}));

vi.mock('../../src/toolkit/reader', () => ({
  AIQAPanelHost: class {
    constructor(_pluginID: string, _rootURI: string, callbacks: unknown) {
      native.callbacks = callbacks;
    }
    open(): boolean {
      return true;
    }
    close(): void {}
    releaseReader(reader: unknown): void {
      for (const [lease, mount] of [...native.mounts]) {
        if ((lease as AIQAPanelLease).reader !== reader) continue;
        native.mounts.delete(lease);
        mount.retire();
        mount.release();
      }
    }
    ownsTarget(): boolean {
      return false;
    }
    dispose(): void {
      for (const [lease, mount] of [...native.mounts]) {
        native.mounts.delete(lease);
        mount.retire();
        mount.release();
      }
    }
  },
}));
vi.mock('../../src/platform/ai-qa-ui', () => ({ releaseAIQAUI: native.releaseUI }));
vi.mock('../../src/ai-qa/view-host', () => ({ mountAIQAView: native.mountView }));
vi.mock('../../src/ui/theme', () => ({
  ThemeManager: class {
    add(): () => void {
      return () => {};
    }
    dispose(): void {}
  },
}));
vi.mock('../../src/core/preferences', () => ({ neoCommandLanguage: () => 'en' }));
vi.mock('../../src/i18n', () => ({ t: (key: string) => key }));

const model: AIQAViewModel = {
  labels: Object.fromEntries(AI_QA_TEXT_KEYS.map((key) => [key, key])) as AIQAViewModel['labels'],
  configuration: {
    api: 'openai-chat-completions',
    endpoint: '',
    model: '',
    maxOutputTokens: 2048,
    sendImages: false,
    configured: false,
    hasCredential: false,
  },
  source: null,
  contextTitle: '',
  hasSelection: false,
  sections: [],
  selectedSectionID: null,
  limitedContext: false,
  task: { itemID: 1, taskID: null, kind: null, phase: 'idle', error: null, resultID: null },
  records: [],
  preview: null,
  error: null,
  notice: null,
  loading: false,
};
let presentations: AIQAPresentation[];

function harness() {
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const capture = vi.fn(() => true);
  const load = vi.fn();
  const dispatch = vi.fn();
  const mountFailed = vi.fn();
  const readModel = vi.fn(() => model);
  const presentation = new AIQAPresentation({
    pluginID: 'fixture',
    rootURI: 'file:///fixture/',
    preferences: {} as PreferenceStore,
    logger,
    readModel,
    capture,
    load,
    dispatch,
    mountFailed,
  });
  presentations.push(presentation);
  const callbacks = native.callbacks as AIQAPanelCallbacks;
  const mount = (reader: ReaderRuntime, window: Window) => {
    let current = true;
    const button = { textContent: '', addEventListener: vi.fn() };
    const root = {
      ownerDocument: { createElementNS: vi.fn(() => button) },
      replaceChildren: vi.fn(),
      contains: vi.fn(() => false),
      textContent: '',
    } as unknown as HTMLElement;
    const lease: AIQAPanelLease = {
      root,
      window,
      reader,
      ownsWindow: false,
      isCurrent: () => current,
    };
    const release = callbacks.mount(lease);
    native.mounts.set(lease, { release, retire: () => (current = false) });
    callbacks.activate(lease);
    return lease;
  };
  const register = (reader: ReaderRuntime): (() => void) => {
    const port: AIQAReaderPresentationPort = {
      reader,
      language: () => 'en',
      themeRoot: vi.fn(() => () => {}),
      showStatus: vi.fn(),
    };
    return presentation.register(port);
  };
  return {
    presentation,
    callbacks,
    capture,
    load,
    dispatch,
    mountFailed,
    readModel,
    mount,
    register,
  };
}

async function flushMount(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  native.callbacks = null;
  native.mounts.clear();
  native.mountView.mockReset();
  native.releaseUI.mockReset();
  presentations = [];
});
afterEach(() => {
  for (const presentation of presentations) presentation.dispose();
});

describe('AI Q&A presentation lifecycle', () => {
  it('disposes a view that resolves after its Reader lease is released', async () => {
    const pending = Promise.withResolvers<AIQAView>();
    const view: AIQAView = { update: vi.fn(), dispose: vi.fn() };
    native.mountView.mockReturnValueOnce(pending.promise);
    const h = harness();
    const reader = { itemID: 1 } as ReaderRuntime;
    const window = {} as Window;
    const unregister = h.register(reader);
    h.mount(reader, window);

    unregister();
    h.presentation.refresh(reader);
    expect(native.releaseUI).toHaveBeenCalledOnce();

    pending.resolve(view);
    await flushMount();

    expect(view.dispose).toHaveBeenCalledOnce();
    expect(view.update).not.toHaveBeenCalled();
    expect(h.mountFailed).not.toHaveBeenCalled();
  });

  it('keeps a shared window runtime until its last current Reader mount releases', async () => {
    const firstView: AIQAView = { update: vi.fn(), dispose: vi.fn() };
    const secondUpdate = vi.fn();
    const secondView: AIQAView = { update: secondUpdate, dispose: vi.fn() };
    native.mountView.mockReturnValueOnce(Promise.resolve(firstView));
    native.mountView.mockReturnValueOnce(Promise.resolve(secondView));
    const h = harness();
    const firstReader = { itemID: 1 } as ReaderRuntime;
    const secondReader = { itemID: 2 } as ReaderRuntime;
    const window = {} as Window;
    const unregisterFirst = h.register(firstReader);
    const unregisterSecond = h.register(secondReader);
    h.mount(firstReader, window);
    h.mount(secondReader, window);
    await flushMount();

    unregisterFirst();
    expect(firstView.dispose).toHaveBeenCalledOnce();
    expect(native.releaseUI).not.toHaveBeenCalled();

    secondUpdate.mockClear();
    h.presentation.refresh(secondReader);
    expect(secondUpdate).toHaveBeenCalledOnce();

    unregisterSecond();
    expect(secondView.dispose).toHaveBeenCalledOnce();
    expect(native.releaseUI).toHaveBeenCalledOnce();
    expect(native.releaseUI).toHaveBeenCalledWith(window);
  });
});
