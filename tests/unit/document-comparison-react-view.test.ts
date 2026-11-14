// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDocumentComparisonReactView } from '../../src/ui/react/surfaces/document-comparison';
import type { DocumentComparisonModel } from '../../src/modules/document-comparison/react-model';

const model: DocumentComparisonModel = {
  title: 'Comparison',
  description: 'Description',
  providerLabel: 'Provider',
  endpointLabel: 'Endpoint',
  provider: 'oxr',
  endpoint: 'https://example.com',
  credentialLabel: 'Credential',
  credentialVerifyLabel: 'Verify',
  credentialHelpLabel: 'MinerU documentation',
  credentialHelpURL: 'https://mineru.net',
  credentialHint: 'Used for MinerU parsing.',
  credentialStatus: '',
  credentialChecking: false,
  busy: false,
  ready: true,
  parseLabel: 'Parse',
  refreshLabel: 'Refresh',
  copyLabel: 'Copy',
  closeLabel: 'Close',
  status: 'Ready',
  vocabularyLabel: 'Vocabulary',
  vocabulary: '',
  corrections: {
    hint: 'Choose, then save. Tab and Enter work.',
    body: 'Save as body',
    restore: 'Restore original',
    caption: 'Save caption',
    target: 'Same-page body',
    choose: 'Choose body',
    saved: 'Correction saved',
    undo: 'Undo last save',
    undoColumns: [0],
    busy: false,
  },
  columns: [
    {
      label: 'Native',
      error: '',
      summary: 'Summary',
      cache: '',
      truncated: '',
      page: 0,
      pageCount: 2,
      previousLabel: 'Previous',
      nextLabel: 'Next',
      targets: [
        {
          id: 'caption-target',
          title: 'Caption',
          text: 'Figure 1. Evidence',
          action: 'Locate',
          correction: {
            regionID: 'caption',
            column: 0,
            corrected: true,
            bodies: [{ id: 'body', title: 'Page 1 · image · body · [10, 10, 100, 100]' }],
          },
        },
      ],
    },
  ],
};
afterEach(() => document.body.replaceChildren());

describe('document comparison local correction controls', () => {
  it('requires an explicit body choice and routes mouse and native form submission to the same save command', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountDocumentComparisonReactView(root, model, dispatch);
    const form = root.querySelector('form')!;
    const select = form.querySelector('select')!;
    expect(select.required).toBe(true);
    expect(select.closest('label')?.textContent).toContain('Same-page body');
    form.querySelector('button')!.click();
    expect(dispatch).not.toHaveBeenCalled();
    select.focus();
    select.value = 'body';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dispatch).not.toHaveBeenCalled();
    form.requestSubmit();
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'correct-caption',
      column: 0,
      regionID: 'caption',
      bodyID: 'body',
    });
    dispatch.mockClear();
    form.querySelector('button')!.click();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'correct-caption',
      column: 0,
      regionID: 'caption',
      bodyID: 'body',
    });
    view.update({ ...model, busy: true, corrections: { ...model.corrections, busy: true } });
    expect(form.querySelector('select')).toBe(select);
    expect(select.disabled).toBe(true);
    expect(form.querySelector('button')!.disabled).toBe(true);
    view.dispose();
  });

  it('exposes restore, undo and later region pages as native buttons without nested interactive controls', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountDocumentComparisonReactView(root, model, dispatch);
    const button = (label: string) =>
      (Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]).find(
        (button) => button.textContent === label,
      )!;
    button('Save as body').click();
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'correct-body',
      column: 0,
      regionID: 'caption',
    });
    button('Restore original').click();
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'correct-restore',
      column: 0,
      regionID: 'caption',
    });
    button('Undo last save').click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'correct-undo', column: 0 });
    button('Next').click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'regions-page', column: 0, page: 1 });
    expect(button('Previous').disabled).toBe(true);
    expect(root.querySelector('button button, button form, summary button')).toBeNull();
    view.dispose();
  });
});

describe('document comparison credential input', () => {
  it('keeps secrets in the editable DOM and commits only completed IME input', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const dispatch = vi.fn();
    const view = mountDocumentComparisonReactView(root, { ...model, provider: 'mineru' }, dispatch);
    const input = root.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(dispatch).not.toHaveBeenCalled();
    input.value = 'local-secret';
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-change' });
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-composition' });
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-change' });
    view.update({ ...model, provider: 'mineru', credentialChecking: true });
    expect(root.querySelector('input[type="password"]')).toBe(input);
    expect(input.value).toBe('local-secret');
    expect(input.disabled).toBe(false);
    expect(JSON.stringify(dispatch.mock.calls)).not.toContain('local-secret');
    view.update({ ...model, provider: 'mineru' });
    Array.from<HTMLButtonElement>(root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Verify')!
      .click();
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'credential-verify' });
    view.dispose();
  });
});
