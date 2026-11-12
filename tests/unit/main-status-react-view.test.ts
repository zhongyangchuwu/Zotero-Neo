// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountMainStatusReactView } from '../../src/ui/react/surfaces/main-status';

const colors = {
  background: '#ffffff',
  foreground: '#111111',
  border: '#222222',
  selectionPrefix: '#333333',
  visualPrefix: '#444444',
  shadow: '#555555',
};

describe('Main selection status presentation', () => {
  it('shows hidden selection counts and visual targets as the model changes', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const view = mountMainStatusReactView(root, {
      status: { kind: 'selection', total: 4, visible: 2 },
      colors,
    });
    expect(root.textContent).toBe('SEL 4 · 2 visible · 2 hidden');
    view.update({ status: { kind: 'visual', targetCount: 3, selectionCount: 4 }, colors });
    expect(root.textContent).toBe('VISUAL 3 · SEL 4');
    expect(root.querySelector<HTMLElement>('.zotero-neo-status-visual')?.style.color).toBe(
      'rgb(68, 68, 68)',
    );
    view.update({ status: { kind: 'message', text: 'Selection cleared' }, colors });
    expect(root.textContent).toBe('Selection cleared');
    view.dispose();
    root.remove();
  });
});
