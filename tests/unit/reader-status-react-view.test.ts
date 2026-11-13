// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountReaderStatusReactView } from '../../src/ui/react/surfaces/reader-status';

describe('Reader status presentation', () => {
  it('updates the visible status and hides it without leaving stale content on screen', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountReaderStatusReactView(root, {
      visible: true,
      text: '-- NATIVE --',
      kind: 'insert',
    });
    const status = root.querySelector<HTMLElement>('.neo-reader-status')!;
    expect(status.textContent).toBe('-- NATIVE --');
    expect(status.dataset.kind).toBe('insert');
    view.update({ visible: true, text: '✓ copied', kind: 'success' });
    expect(status.textContent).toBe('✓ copied');
    expect(status.dataset.kind).toBe('success');
    view.update({ visible: false, text: '✓ copied', kind: 'success' });
    expect(status.hidden).toBe(true);
    view.dispose();
    root.remove();
  });
});
