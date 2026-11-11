import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceStore } from '../../src/core/preference-store';
import {
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY as COLOR,
  ANNOTATION_COMMENT_EDITOR_ENABLED_PREFERENCE_KEY as COMMENT,
  READER_MARKS_PERSIST_PREFERENCE_KEY as MARKS,
  READER_SCROLL_MODE_PREFERENCE_KEY as MODE,
  READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY as VISUAL,
} from '../../src/core/preferences';
import { SettingsReader } from '../../src/main/settings-reader';

const credentials = vi.hoisted(() => ({
  readMinerU: vi.fn(), saveMinerU: vi.fn(), hasKey: vi.fn(), setKey: vi.fn(), dispose: vi.fn(),
}));
vi.mock('../../src/platform/document-credentials', () => ({ readMinerUToken: credentials.readMinerU, saveMinerUToken: credentials.saveMinerU }));
vi.mock('../../src/references/metadata', () => ({ createReferenceMetadataService: () => ({ hasSemanticScholarKey: credentials.hasKey, setSemanticScholarKey: credentials.setKey, dispose: credentials.dispose }) }));

class Preferences implements PreferenceStore {
  readonly values = new Map<string, boolean | number | string>();
  readonly observers = new Map<string, Set<() => void>>();
  readonly writes: Array<[string, boolean | number | string]> = [];
  failKey: string | null = null;
  has(key: string): boolean { return this.values.has(key); }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string { return this.values.get(key) ?? fallback; }
  set(key: string, value: boolean | number | string): void {
    if (key === this.failKey) throw new Error('Write failed');
    this.values.set(key, value);
    this.writes.push([key, value]);
    for (const listener of this.observers.get(key) ?? []) listener();
  }
  clear(key: string): void { this.values.delete(key); for (const listener of this.observers.get(key) ?? []) listener(); }
  observe(key: string, listener: () => void): () => void {
    const group = this.observers.get(key) ?? new Set();
    group.add(listener); this.observers.set(key, group);
    return () => group.delete(listener);
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  credentials.readMinerU.mockReturnValue('stored-mineru-secret');
  credentials.saveMinerU.mockResolvedValue(undefined);
  credentials.hasKey.mockResolvedValue(true);
  credentials.setKey.mockResolvedValue(undefined);
});

function mount() {
  const preferences = new Preferences();
  const changed = vi.fn();
  const page = new SettingsReader({} as never, preferences, 'en', changed);
  return { page, preferences, changed };
}

describe('Reader Settings', () => {
  it('switches models and applies canonical numeric normalization, including dependent maximum speed', () => {
    const { page, preferences } = mount();
    page.dispatch({ type: 'mode', value: 'step' });
    page.dispatch({ type: 'number', setting: 'scrollStep', value: '9999' });
    expect(preferences.writes).toContainEqual([MODE, 'step']);
    expect(page.model().scroll.scrollStep).toBe(500);
    page.dispatch({ type: 'mode', value: 'trapezoid' });
    page.dispatch({ type: 'number', setting: 'initialSpeed', value: '-20' });
    expect(page.model().scroll.initialSpeed).toBe(50);
    page.dispatch({ type: 'number', setting: 'initialSpeed', value: '1800' });
    page.dispatch({ type: 'number', setting: 'maxSpeed', value: '100' });
    expect(page.model().scroll.maxSpeed).toBe(1800);
    page.dispatch({ type: 'number', setting: 'scrollStep', value: '' });
    expect(page.model().scroll.scrollStep).toBe(60);
    page.dispose();
  });

  it('writes preferences immediately, reports failures, observes external writes and releases observers', () => {
    const { page, preferences, changed } = mount();
    page.dispatch({ type: 'visual', value: false });
    page.dispatch({ type: 'comment', value: false });
    page.dispatch({ type: 'marks', value: true });
    page.dispatch({ type: 'color', value: 'purple' });
    expect(preferences.writes).toEqual([[VISUAL, false], [COMMENT, false], [MARKS, true], [COLOR, 'purple']]);
    preferences.failKey = MODE;
    page.dispatch({ type: 'mode', value: 'trapezoid' });
    expect(page.model().scroll.mode).not.toBe('trapezoid');
    expect(page.model().status).not.toBe('');
    preferences.failKey = null;
    preferences.set(MODE, 'step');
    expect(page.model().scroll.mode).toBe('step');
    expect(page.model().status).toBe('');
    page.dispose();
    changed.mockClear();
    preferences.set(MARKS, false);
    page.dispatch({ type: 'marks', value: true });
    expect(changed).not.toHaveBeenCalled();
    expect([...preferences.observers.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('keeps stored credentials out of the model and explicitly saves and forgets both providers', async () => {
    const { page } = mount();
    await Promise.resolve();
    expect(page.model().mineru.configured).toBe(true);
    expect(page.model().semanticScholar.configured).toBe(true);
    expect(JSON.stringify(page.model())).not.toContain('stored-mineru-secret');
    page.dispatch({ type: 'saveCredential', provider: 'mineru', value: 'new-token' });
    expect(credentials.saveMinerU).toHaveBeenCalledWith('new-token');
    expect(JSON.stringify(page.model())).not.toContain('new-token');
    await Promise.resolve();
    page.dispatch({ type: 'forgetCredential', provider: 'mineru' });
    expect(credentials.saveMinerU).toHaveBeenLastCalledWith('');
    page.dispatch({ type: 'saveCredential', provider: 'semanticScholar', value: 'new-key' });
    expect(credentials.setKey).toHaveBeenCalledWith('new-key');
    expect(JSON.stringify(page.model())).not.toContain('new-key');
    await Promise.resolve();
    page.dispatch({ type: 'forgetCredential', provider: 'semanticScholar' });
    expect(credentials.setKey).toHaveBeenLastCalledWith(null);
    page.dispose();
  });

  it('reports credential failures and ignores completions after disposal', async () => {
    let finish!: () => void;
    credentials.saveMinerU.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    credentials.setKey.mockRejectedValue(new Error('storage failed'));
    const { page, changed } = mount();
    await Promise.resolve();
    page.dispatch({ type: 'saveCredential', provider: 'semanticScholar', value: 'key' });
    await Promise.resolve();
    expect(page.model().semanticScholar.error).toBe(true);
    page.dispatch({ type: 'saveCredential', provider: 'mineru', value: 'token' });
    expect(page.model().mineru.pending).toBe(true);
    page.dispose(); changed.mockClear(); finish();
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
    expect(credentials.dispose).toHaveBeenCalled();
  });
});
