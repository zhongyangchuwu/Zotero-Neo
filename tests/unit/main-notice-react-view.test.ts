// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountMainNoticeReactView } from '../../src/ui/react/surfaces/main-notice';

describe('Main notice React presentation', () => {
  it('updates the visible message and hides a dismissed status', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountMainNoticeReactView(root, { text: 'First', kind: 'info', visible: true });
    const notice = root.querySelector<HTMLElement>('.neo-main-notice')!;
    expect(notice.textContent).toBe('First');
    expect(notice.hidden).toBe(false);
    view.update({ text: 'Saved', kind: 'success', visible: true });
    expect(notice.textContent).toBe('Saved');
    expect(notice.dataset.kind).toBe('success');
    view.update({ text: 'Saved', kind: 'success', visible: false });
    expect(notice.hidden).toBe(true);
    view.dispose();
    root.remove();
  });
});
