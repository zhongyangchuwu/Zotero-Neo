import { beforeEach, describe, expect, it, vi } from 'vitest';
import { referenceCredentialField } from '../../src/ui/reference-credentials';

vi.mock('../../src/platform/reference-credentials', () => ({
  readReferenceKey: vi.fn(),
  changeReferenceKey: vi.fn(),
}));
vi.mock('../../src/platform/reference-http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform/reference-http')>()),
  referenceRequest: vi.fn(),
}));

import { changeReferenceKey, readReferenceKey } from '../../src/platform/reference-credentials';
import { referenceRequest } from '../../src/platform/reference-http';

class ElementFake {
  readonly children: ElementFake[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style: Record<string, string> = { cssText: '', marginInlineStart: '' };
  textContent = '';
  value = '';
  type = '';
  autocomplete = '';
  disabled = false;

  constructor(readonly tag: string) {}

  append(...children: ElementFake[]): void {
    this.children.push(...children);
  }

  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }

  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }

  addEventListener(type: string, listener: () => void): void {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  click(): void {
    for (const listener of this.listeners.get('click') ?? []) listener();
  }

  all(): ElementFake[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }

  byAria(label: string): ElementFake {
    const match = this.all().find((node) => node.getAttribute('aria-label') === label);
    if (!match) throw new Error(`Missing control: ${label}`);
    return match;
  }

  button(label: string): ElementFake {
    const match = this.all().find((node) => node.tag === 'button' && node.textContent === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }

  status(): ElementFake {
    const match = this.all().find((node) => node.getAttribute('role') === 'status');
    if (!match) throw new Error('Missing credential status');
    return match;
  }
}

function mount() {
  const document = {
    createElementNS: (_namespace: string, tag: string) => new ElementFake(tag),
  } as unknown as Document;
  const field = referenceCredentialField(document, () => 'en');
  return { field, root: field.root as unknown as ElementFake };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

const readKey = vi.mocked(readReferenceKey);
const changeKey = vi.mocked(changeReferenceKey);
const request = vi.mocked(referenceRequest);

beforeEach(() => {
  vi.resetAllMocks();
  readKey.mockReturnValue('stored-secret');
  changeKey.mockResolvedValue(undefined);
});

describe('Reference credentials settings field', () => {
  it('keeps stored credentials blank and mutates them only after explicit Save or Forget', async () => {
    const { field, root } = mount();
    await settle();

    expect(root.byAria('API key').type).toBe('password');
    expect(root.byAria('API key').value).toBe('');
    expect(readKey).toHaveBeenCalledTimes(1);
    expect(changeKey).not.toHaveBeenCalled();
    expect(root.status().textContent).toContain('A key is stored');
    expect(
      root
        .all()
        .map((node) => node.textContent)
        .join(' '),
    ).not.toContain('stored-secret');

    root.byAria('API key').value = 'replacement-secret';
    root.button('Save key').click();
    expect(changeKey).toHaveBeenCalledWith('replacement-secret');
    expect(root.byAria('API key').value).toBe('');
    await settle();
    expect(
      root
        .all()
        .map((node) => node.textContent)
        .join(' '),
    ).not.toContain('replacement-secret');

    root.button('Forget key').click();
    expect(changeKey).toHaveBeenLastCalledWith(null);
    await settle();
    expect(root.byAria('API key').value).toBe('');
    expect(request).not.toHaveBeenCalled();
    field.dispose();
  });

  it('keeps anonymous use when no key exists and rejects a blank save without mutating credentials', async () => {
    readKey.mockReturnValue('');
    const { field, root } = mount();
    await settle();

    expect(root.byAria('API key').value).toBe('');
    expect(root.status().textContent).toContain('No key is stored');
    root.button('Save key').click();
    expect(root.status().textContent).toContain('Enter a key to save');
    expect(changeKey).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    field.dispose();
  });

  it('clears input and ignores late mutation completion after disposal', async () => {
    const { promise: save, resolve: resolveSave } = Promise.withResolvers<void>();
    changeKey.mockReturnValue(save);
    const { field, root } = mount();
    await settle();

    const input = root.byAria('API key');
    input.value = 'late-secret';
    root.button('Save key').click();
    const statusBeforeDispose = root.status().textContent;
    expect(input.value).toBe('');
    field.dispose();
    expect(input.value).toBe('');
    input.value = 'ignored-secret';
    root.button('Save key').click();
    expect(changeKey).toHaveBeenCalledTimes(1);
    resolveSave();
    await settle();
    expect(root.status().textContent).toBe(statusBeforeDispose);
    expect(
      root
        .all()
        .map((node) => node.textContent)
        .join(' '),
    ).not.toContain('late-secret');
  });
});
