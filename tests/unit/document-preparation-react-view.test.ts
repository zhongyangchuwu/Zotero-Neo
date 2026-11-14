// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDocumentPreparationReactView } from '../../src/ui/react/surfaces/document-preparation';
import type { PreparationReactModel } from '../../src/modules/document-preparation/react-model';

const model: PreparationReactModel = {
  title: 'MinerU preparation',
  help: 'Prepare selected PDFs.',
  selection: 'Selection',
  names: ['Paper'],
  token: 'MinerU API token',
  verify: 'Verify',
  credentialHelp: 'MinerU documentation',
  credentialHelpURL: 'https://mineru.net',
  credentialHint: 'Used for MinerU parsing.',
  credentialChecking: false,
  credentialStatus: '',
  start: 'Prepare',
  retry: 'Retry',
  stop: 'Stop',
  close: 'Close',
  status: '',
  busy: false,
  startDisabled: false,
  retryDisabled: true,
  stopDisabled: true,
  rows: [],
};

afterEach(() => document.body.replaceChildren());

describe('preparation credential input', () => {
  it('keeps the actual prefilled input editable and dispatches no secret or automatic verification', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountDocumentPreparationReactView(root, model, dispatch);
    const input = root.querySelector<HTMLInputElement>('input[type="password"]')!;
    input.value = 'prefilled-secret';
    expect(dispatch).not.toHaveBeenCalled();
    input.value = 'edited-secret';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-change' });
    view.update({ ...model, credentialChecking: true });
    expect(root.querySelector('input[type="password"]')).toBe(input);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('edited-secret');
    input.value = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-change' });
    expect(JSON.stringify(dispatch.mock.calls)).not.toMatch(/prefilled-secret|edited-secret/);
    view.dispose();
  });

  it('distinguishes composition from completed input and exposes explicit verification', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountDocumentPreparationReactView(root, model, dispatch);
    const input = root.querySelector<HTMLInputElement>('input[type="password"]')!;
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(
      dispatch.mock.calls.every(([command]) => command.type === 'credential-composition'),
    ).toBe(true);
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-change' });
    Array.from<HTMLButtonElement>(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Verify')!
      .click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-verify' });
    view.dispose();
  });
});
