import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabGroupManager } from '../../src/modules/tab-enhancements/model';
import { importReadingSelection } from '../../src/modules/tab-enhancements/selection-import';
import type { MainResolvedTargets } from '../../src/main/action-targets';
import type { TabGroupHost } from '../../src/modules/tab-enhancements/types';
import type { MainWindow } from '../../src/core/contracts';

function pdf(key: string) {
  return { key, libraryID: 1, deleted: false, attachmentFilename: `${key}.pdf`, isRegularItem: () => false, isPDFAttachment: () => true, getField: () => key };
}
function setup(items: unknown[], missing = 0) {
  let saved = '';
  let id = 0;
  const groups = createTabGroupManager({ read: () => saved, write: (value) => { saved = value; }, createID: () => `id-${++id}` });
  const native = { id: 'host', snapshot: () => [], observe: () => () => {}, metadata: () => null };
  groups.registerHost({ native, activate: () => true } as unknown as TabGroupHost);
  const targets = { items, missing } as unknown as MainResolvedTargets;
  const options = { window: {} as MainWindow, language: 'en' as const, targets, groups, hostID: 'host', titleFormat: '{title}', create: true, isCurrent: () => true };
  return { options, groups, saved: () => saved };
}

afterEach(() => vi.unstubAllGlobals());

describe('reading group selection import', () => {
  it('pins explicit attachments and asks which PDF belongs to an ambiguous parent', () => {
    const one = pdf('ONE');
    const two = pdf('TWO');
    const parent = { deleted: false, isRegularItem: () => true, getAttachments: () => [1, 2], getField: () => 'Parent' };
    const items: unknown[] = [one, parent];
    const state = setup(items, 1);
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => id === 1 ? one : two } });
    const alerts: string[] = [];
    vi.stubGlobal('Services', { prompt: {
      alert: (_window: unknown, _title: string, text: string) => alerts.push(text),
      select: (_window: unknown, _title: string, _text: string, _count: number, _choices: string[], selected: { value: number }) => { items.splice(0); selected.value = 1; return true; },
      prompt: (_window: unknown, _title: string, _text: string, value: { value: string }) => { value.value = 'Reading'; return true; },
    } });
    importReadingSelection(state.options);
    const members = JSON.parse(state.saved()).groups[0].members;
    expect(members.map((member: { document: { key: string } }) => member.document.key)).toEqual(['ONE', 'TWO']);
    expect(alerts[0]).toContain('1');
  });
  it('does not write when an ambiguous choice is cancelled or the session retires', () => {
    const parent = { deleted: false, isRegularItem: () => true, getAttachments: () => [1, 2], getField: () => 'Parent' };
    vi.stubGlobal('Zotero', { Items: { get: (id: number) => pdf(String(id)) } });
    const state = setup([parent]);
    vi.stubGlobal('Services', { prompt: { alert: vi.fn(), select: () => false, prompt: vi.fn() } });
    importReadingSelection(state.options);
    expect(state.saved()).toBe('');
    vi.stubGlobal('Services', { prompt: { alert: vi.fn(), select: () => true, prompt: vi.fn() } });
    let calls = 0;
    importReadingSelection({ ...state.options, isCurrent: () => ++calls < 2 });
    expect(state.saved()).toBe('');
  });
});
