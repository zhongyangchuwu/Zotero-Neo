// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountSelectionActionsReactView } from '../../src/ui/react/surfaces/selection-actions';

describe('Reader selection actions presentation', () => {
  it('localizes menu and result guidance without translating contributed content', () => {
    const root = document.createElement('div');
    const model = {
      language: 'zh-CN',
      stage: 'menu',
      preview: 'Selected excerpt',
      actions: ['Custom action'],
      selected: 0,
      message: '',
      resultTitle: '',
      resultText: '',
    } as const;
    const menu = { ...model, actions: [...model.actions] };
    const view = mountSelectionActionsReactView(root, menu, () => {});
    try {
      expect(root.textContent).toContain('选区操作');
      expect(root.textContent).toContain('1–9 或 Enter 执行');
      expect(root.textContent).toContain('Custom action');
      view.update({ ...menu, stage: 'result', resultText: 'External result' });
      expect(root.textContent).toContain('操作结果');
      expect(root.textContent).toContain('y 复制结果');
      expect(root.textContent).toContain('External result');
      view.update({ ...menu, language: 'en' });
      expect(root.textContent).toContain('SELECT ACTIONS');
      expect(root.textContent).toContain('Esc close');
    } finally {
      view.dispose();
    }
  });
});
