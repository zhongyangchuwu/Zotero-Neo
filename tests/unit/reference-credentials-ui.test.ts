// @vitest-environment jsdom
import type * as CredentialChecks from '../../src/platform/credential-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { NativeReactViewOptions } from '../../src/ui/react/types';
import type { SettingsReactCommand, SettingsReactModel } from '../../src/main/settings-react-model';
import { SettingsCenter } from '../../src/main/settings-center';
import { resolveInteractionAppearance } from '../../src/main/interaction-appearance';
import type { CredentialProvider } from '../../src/platform/credential-check';
import { mountSettingsReactView } from '../../src/ui/react/surfaces/settings';

const credentials = vi.hoisted(() => ({
  stored: { mineru: '', semanticScholar: '' },
  readMinerU: vi.fn(),
  saveMinerU: vi.fn(),
  readKey: vi.fn(),
  saveKey: vi.fn(),
  commitMinerU: vi.fn(),
  commitKey: vi.fn(),
  check: vi.fn(),
  help: vi.fn(),
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readSettledReferenceKey: credentials.readKey,
  changeReferenceKey: credentials.saveKey,
}));
vi.mock('../../src/platform/document-credentials', () => ({
  readSettledMinerUToken: credentials.readMinerU,
  saveMinerUToken: credentials.saveMinerU,
}));
vi.mock('../../src/platform/credential-check', async (importOriginal) => ({
  ...(await importOriginal<typeof CredentialChecks>()),
  CREDENTIAL_HELP_URLS: {
    mineru: 'https://mineru.net/apiManage/token',
    semanticScholar: 'https://www.semanticscholar.org/product/api',
  },
  checkCredential: credentials.check,
  openCredentialHelp: credentials.help,
}));

const native = vi.hoisted(() => ({
  model: null as SettingsReactModel | null,
  commands: [] as SettingsReactCommand[],
}));
vi.mock('../../src/platform/native-ui', () => {
  return {
    mountNativeReactView(
      options: NativeReactViewOptions<SettingsReactModel, SettingsReactCommand>,
    ) {
      native.model = options.model;
      const view = mountSettingsReactView(options.root, options.model, (command) => {
        const copy = JSON.parse(JSON.stringify(command)) as SettingsReactCommand;
        native.commands.push(copy);
        if (options.isCurrent()) options.dispatch(copy);
      });
      return {
        ready: Promise.resolve(),
        update(model: SettingsReactModel) {
          native.model = model;
          view.update(model);
        },
        getElement(part: string) {
          return options.isCurrent() ? view.getElement(part) : null;
        },
        dispose: () => view.dispose(),
      };
    },
  };
});

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

// Model the shared storage boundary, not a page-local write queue.
let sharedWrites: Record<CredentialProvider, Promise<void>>;
function store(provider: CredentialProvider, value: string | null): Promise<void> {
  const pending = sharedWrites[provider]
    .catch(() => {})
    .then(() =>
      provider === 'mineru' ? credentials.commitMinerU(value) : credentials.commitKey(value),
    );
  sharedWrites[provider] = pending;
  return pending;
}

async function readSettled(provider: CredentialProvider): Promise<string> {
  for (;;) {
    const pending = sharedWrites[provider];
    await pending.catch(() => {});
    if (pending === sharedWrites[provider]) return credentials.stored[provider];
  }
}

function mount(provider: CredentialProvider) {
  const preferences = {
    get: (_key: string, fallback: unknown) => fallback,
    has: () => false,
    set: () => {},
    clear: () => {},
  } as unknown as PreferenceStore;
  const center = new SettingsCenter(
    window as unknown as MainWindow,
    { add: () => () => {} } as never,
    {
      observe: () => () => {},
      get appearance() {
        return resolveInteractionAppearance(preferences, 'light');
      },
    } as never,
    preferences,
    {} as never,
  );
  center.openWorkspace();
  const root = document.getElementById('zotero-neo-settings-center')!;
  const navigate = (section: 'Reader' | 'Appearance') => {
    const button = Array.from<HTMLButtonElement>(
      root.querySelectorAll<HTMLButtonElement>('nav button'),
    ).find((candidate) => candidate.textContent === section)!;
    button.click();
  };
  navigate('Reader');
  const reader = {
    model() {
      const page = native.model!.page;
      if (page.kind !== 'reader') throw new Error('Reader page is not active');
      return page.model;
    },
  };
  const input = () =>
    root.querySelector<HTMLInputElement>(`[data-neo-ui-part="credential-${provider}"]`)!;
  const section = () => input().closest('section')!;
  const verify = () => section().querySelector('button')!;
  const edit = (value: string) => {
    input().value = value;
    input().dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const dispose = () => center.close();
  return { root, reader, input, section, verify, edit, navigate, dispose };
}

beforeEach(() => {
  vi.resetAllMocks();
  native.commands.length = 0;
  sharedWrites = { mineru: Promise.resolve(), semanticScholar: Promise.resolve() };
  credentials.stored.mineru = 'stored-mineru-secret';
  credentials.stored.semanticScholar = 'stored-s2-secret';
  credentials.readMinerU.mockImplementation(() => readSettled('mineru'));
  credentials.readKey.mockImplementation(() => readSettled('semanticScholar'));
  credentials.saveMinerU.mockImplementation((value: string) => store('mineru', value));
  credentials.saveKey.mockImplementation((value: string | null) => store('semanticScholar', value));
  credentials.commitMinerU.mockImplementation(async (value: string) => {
    credentials.stored.mineru = value;
  });
  credentials.commitKey.mockImplementation(async (value: string | null) => {
    credentials.stored.semanticScholar = value ?? '';
  });
  credentials.check.mockResolvedValue('valid');
});

describe.each(['mineru', 'semanticScholar'] as const)(
  'Reader Settings %s credentials',
  (provider) => {
    const save = provider === 'mineru' ? credentials.saveMinerU : credentials.saveKey;
    const commit = provider === 'mineru' ? credentials.commitMinerU : credentials.commitKey;

    it.each(['newer-other-surface', null])(
      'admits Settings edits before a newer cross-surface value %s or deletion',
      async (newer) => {
        const pending = Promise.withResolvers<void>();
        commit.mockImplementationOnce(async (value: string) => {
          await pending.promise;
          credentials.stored[provider] = value;
        });
        const ui = mount(provider);
        await settle();
        ui.edit('settings-A');
        await settle();
        ui.edit('settings-B');
        expect(save).toHaveBeenCalledTimes(2);
        ui.dispose();
        const latest = save(newer ?? (provider === 'mineru' ? '' : null));
        const reopened = mount(provider);
        await settle();
        expect(reopened.input().value).toBe('');
        pending.resolve();
        await latest;
        await settle();
        expect(save.mock.calls.map(([value]) => value)).toEqual([
          'settings-A',
          'settings-B',
          newer ?? (provider === 'mineru' ? '' : null),
        ]);
        expect(credentials.stored[provider]).toBe(newer ?? '');
        expect(reopened.input().value).toBe(newer ?? '');
        expect(credentials.check).not.toHaveBeenCalled();
        reopened.dispose();
      },
    );

    it('prefills after other-surface writes, including writes admitted while the read waits', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored[provider] = value;
      });
      const first = save('other-surface-A');
      await settle();
      const ui = mount(provider);
      await settle();
      expect(ui.input().value).toBe('');
      const latest = save('other-surface-B');
      pending.resolve();
      await first;
      await latest;
      await settle();
      expect(ui.input().value).toBe('other-surface-B');
      expect(ui.reader.model()[provider].status).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      ui.dispose();
    });

    it('does not overwrite visible edits when an earlier prefill finishes after newer shared writes', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored[provider] = value;
      });
      const first = save('other-surface-A');
      const ui = mount(provider);
      await settle();
      ui.edit('visible-user-edit');
      const latest = save('other-surface-C');
      pending.resolve();
      await first;
      await latest;
      await settle();
      expect(credentials.stored[provider]).toBe('other-surface-C');
      expect(ui.input().value).toBe('visible-user-edit');
      expect(ui.reader.model()[provider].status).toBe('');
      ui.dispose();
    });

    it('prefills both actual password inputs, autosaves edits and clears on deletion without exposing secrets', async () => {
      const ui = mount(provider);
      await settle();
      for (const id of ['mineru', 'semanticScholar'] as const) {
        const input = ui.root.querySelector<HTMLInputElement>(
          `[data-neo-ui-part="credential-${id}"]`,
        )!;
        expect(input.type).toBe('password');
        expect(input.value).toBe(credentials.stored[id]);
        expect(ui.reader.model()[id].status).toBe('');
        expect(JSON.stringify(ui.reader.model())).not.toContain(credentials.stored[id]);
        expect(ui.root.textContent).not.toContain(credentials.stored[id]);
      }
      expect(save).not.toHaveBeenCalled();
      ui.edit('replacement-secret');
      await settle();
      expect(save).toHaveBeenLastCalledWith('replacement-secret');
      expect(ui.input().value).toBe('replacement-secret');
      expect(JSON.stringify(ui.reader.model())).not.toContain('replacement-secret');
      ui.input().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      expect(credentials.check).not.toHaveBeenCalled();
      ui.dispose();
      const reopened = mount(provider);
      await settle();
      expect(reopened.input().value).toBe('replacement-secret');
      reopened.edit('');
      await settle();
      expect(save).toHaveBeenLastCalledWith(provider === 'mineru' ? '' : null);
      reopened.dispose();
      const cleared = mount(provider);
      await settle();
      expect(cleared.input().value).toBe('');
      expect(cleared.reader.model()[provider].status).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      cleared.dispose();
    });

    it('keeps rapid and same-value edits editable, ordered and durable after page closure', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored[provider] = value;
      });
      const ui = mount(provider);
      await settle();
      ui.edit('first');
      await settle();
      ui.edit('second');
      ui.edit('second');
      ui.edit('');
      expect(ui.input().disabled).toBe(false);
      expect(save).toHaveBeenCalledTimes(4);
      expect(commit).toHaveBeenCalledTimes(1);
      const oldInput = ui.input();
      ui.dispose();
      expect(oldInput.value).toBe('');
      const reopened = mount(provider);
      pending.resolve();
      await sharedWrites[provider];
      await settle();
      expect(save.mock.calls.map(([value]) => value)).toEqual([
        'first',
        'second',
        'second',
        provider === 'mineru' ? '' : null,
      ]);
      expect(reopened.input().value).toBe('');
      expect(credentials.stored[provider]).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      reopened.dispose();
    });

    it('persists only completed IME input and never checks on composition or blur', async () => {
      const ui = mount(provider);
      await settle();
      ui.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      ui.edit('partial');
      expect(save).not.toHaveBeenCalled();
      ui.input().value = 'completed';
      ui.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await settle();
      expect(save).toHaveBeenLastCalledWith('completed');
      ui.input().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      expect(credentials.check).not.toHaveBeenCalled();
      ui.dispose();
    });

    it('checks the exact visible value only after Verify and current storage has completed', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored[provider] = value;
      });
      const ui = mount(provider);
      await settle();
      ui.edit('exact-visible-value');
      ui.verify().click();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      expect(ui.input().disabled).toBe(false);
      pending.resolve();
      await settle();
      expect(credentials.check).toHaveBeenCalledWith(
        provider,
        'exact-visible-value',
        expect.any(AbortSignal),
      );
      const commands = native.commands.flatMap((command) =>
        command.type === 'reader' ? [command.command] : [],
      );
      expect(commands).toContainEqual({ type: 'credentialInput', provider });
      expect(commands).toContainEqual({ type: 'verifyCredential', provider });
      expect(JSON.stringify(native.commands)).not.toContain('exact-visible-value');
      expect(ui.reader.model()[provider].error).toBe(false);
      expect(ui.reader.model()[provider].status).not.toBe('');
      expect(ui.reader.model()[provider].checking).toBe(false);
      const link = ui.section().querySelector('a')!;
      expect(link.href.startsWith('https://')).toBe(true);
      link.click();
      expect(credentials.help).toHaveBeenCalledWith(provider);
      ui.dispose();
    });

    it('aborts and ignores stale validity after an edit or page remount', async () => {
      const first = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(first.promise);
      const ui = mount(provider);
      await settle();
      ui.verify().click();
      await settle();
      const signal = credentials.check.mock.calls[0][2] as AbortSignal;
      ui.edit('different-key');
      expect(signal.aborted).toBe(true);
      first.resolve('valid');
      await settle();
      expect(ui.reader.model()[provider].status).toBe('');
      const second = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(second.promise);
      ui.verify().click();
      await settle();
      const closingSignal = credentials.check.mock.calls[1][2] as AbortSignal;
      ui.dispose();
      expect(closingSignal.aborted).toBe(true);
      const reopened = mount(provider);
      second.resolve('valid');
      await settle();
      expect(reopened.input().value).toBe('different-key');
      expect(reopened.reader.model()[provider].status).toBe('');
      reopened.dispose();
    });

    it('retires verification waiting for storage when a later edit is accepted', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async () => pending.promise);
      const ui = mount(provider);
      await settle();
      ui.edit('first');
      ui.verify().click();
      ui.edit('second');
      pending.resolve();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      expect(credentials.stored[provider]).toBe('second');
      expect(ui.reader.model()[provider].status).toBe('');
      ui.dispose();
    });

    it('reports storage errors, recovers on later input, and does not verify a failed save', async () => {
      const read = provider === 'mineru' ? credentials.readMinerU : credentials.readKey;
      read.mockImplementationOnce(() => {
        throw new Error('Storage unavailable');
      });
      const ui = mount(provider);
      await settle();
      expect(ui.reader.model()[provider].error).toBe(true);
      const failure = Promise.withResolvers<void>();
      commit.mockReturnValueOnce(failure.promise);
      ui.edit('failed');
      ui.verify().click();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      failure.reject(new Error('Write failed'));
      await settle();
      expect(ui.reader.model()[provider].error).toBe(true);
      expect(credentials.check).not.toHaveBeenCalled();
      ui.edit('recovered');
      await settle();
      expect(credentials.stored[provider]).toBe('recovered');
      expect(ui.reader.model()[provider].status).toBe('');
      ui.dispose();
    });

    it('reloads the saved field on tab remount and retires the previous verification', async () => {
      const check = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(check.promise);
      const ui = mount(provider);
      await settle();
      ui.edit('tab-persisted');
      await settle();
      ui.verify().click();
      await settle();
      const signal = credentials.check.mock.calls[0][2] as AbortSignal;
      const oldInput = ui.input();
      ui.navigate('Appearance');
      expect(signal.aborted).toBe(true);
      expect(oldInput.value).toBe('');
      ui.navigate('Reader');
      check.resolve('valid');
      await settle();
      expect(ui.input()).not.toBe(oldInput);
      expect(ui.input().value).toBe('tab-persisted');
      expect(ui.reader.model()[provider].status).toBe('');
      ui.dispose();
    });

    it('preserves native keyboard ownership during composition and saves accepted input before Escape closes', async () => {
      const ui = mount(provider);
      await settle();
      ui.input().focus();
      ui.input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      ui.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ui.root.isConnected).toBe(true);
      ui.input().value = 'keyboard-accepted';
      ui.input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      ui.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(credentials.check).not.toHaveBeenCalled();
      ui.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ui.root.isConnected).toBe(false);
      await settle();
      expect(credentials.stored[provider]).toBe('keyboard-accepted');
    });
  },
);
