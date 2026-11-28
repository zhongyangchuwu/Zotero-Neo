// @vitest-environment jsdom
import type * as CredentialChecks from '../../src/platform/credential-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { NativeReactViewOptions } from '../../src/ui/react/types';
import type { SettingsReactCommand, SettingsReactModel } from '../../src/main/settings-react-model';
import { SettingsCenter } from '../../src/main/settings-center';
import { resolveInteractionAppearance } from '../../src/main/interaction-appearance';
import { mountSettingsReactView } from '../../src/ui/react/surfaces/settings';

const credentials = vi.hoisted(() => ({
  stored: '',
  readKey: vi.fn(),
  saveKey: vi.fn(),
  commitKey: vi.fn(),
  check: vi.fn(),
  help: vi.fn(),
}));
vi.mock('../../src/platform/reference-credentials', () => ({
  readSettledReferenceKey: credentials.readKey,
  changeReferenceKey: credentials.saveKey,
}));
vi.mock('../../src/platform/credential-check', async (importOriginal) => ({
  ...(await importOriginal<typeof CredentialChecks>()),
  SEMANTIC_SCHOLAR_CREDENTIAL_HELP_URL: 'https://www.semanticscholar.org/product/api',
  checkSemanticScholarCredential: credentials.check,
  openSemanticScholarCredentialHelp: credentials.help,
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
let sharedWrites: Promise<void>;
function store(value: string | null): Promise<void> {
  const pending = sharedWrites.catch(() => {}).then(() => credentials.commitKey(value));
  sharedWrites = pending;
  return pending;
}

async function readSettled(): Promise<string> {
  for (;;) {
    const pending = sharedWrites;
    await pending.catch(() => {});
    if (pending === sharedWrites) return credentials.stored;
  }
}

function mount() {
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
    root.querySelector<HTMLInputElement>('[data-neo-ui-part="credential-semanticScholar"]')!;
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
  sharedWrites = Promise.resolve();
  credentials.stored = 'stored-s2-secret';
  credentials.readKey.mockImplementation(readSettled);
  credentials.saveKey.mockImplementation(store);
  credentials.commitKey.mockImplementation(async (value: string | null) => {
    credentials.stored = value ?? '';
  });
  credentials.check.mockResolvedValue('valid');
});

describe('Reader Settings', () => {
  describe('Semantic Scholar credentials', () => {
    const save = credentials.saveKey;
    const commit = credentials.commitKey;

    it.each(['newer-other-surface', null])(
      'admits Settings edits before a newer cross-surface value %s or deletion',
      async (newer) => {
        const pending = Promise.withResolvers<void>();
        commit.mockImplementationOnce(async (value: string) => {
          await pending.promise;
          credentials.stored = value;
        });
        const ui = mount();
        await settle();
        ui.edit('settings-A');
        await settle();
        ui.edit('settings-B');
        expect(save).toHaveBeenCalledTimes(2);
        ui.dispose();
        const latest = save(newer);
        const reopened = mount();
        await settle();
        expect(reopened.input().value).toBe('');
        pending.resolve();
        await latest;
        await settle();
        expect(save.mock.calls.map(([value]) => value)).toEqual([
          'settings-A',
          'settings-B',
          newer,
        ]);
        expect(credentials.stored).toBe(newer ?? '');
        expect(reopened.input().value).toBe(newer ?? '');
        expect(credentials.check).not.toHaveBeenCalled();
        reopened.dispose();
      },
    );

    it('prefills after other-surface writes, including writes admitted while the read waits', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored = value;
      });
      const first = save('other-surface-A');
      await settle();
      const ui = mount();
      await settle();
      expect(ui.input().value).toBe('');
      const latest = save('other-surface-B');
      pending.resolve();
      await first;
      await latest;
      await settle();
      expect(ui.input().value).toBe('other-surface-B');
      expect(ui.reader.model().semanticScholar.status).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      ui.dispose();
    });

    it('does not overwrite visible edits when an earlier prefill finishes after newer shared writes', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored = value;
      });
      const first = save('other-surface-A');
      const ui = mount();
      await settle();
      ui.edit('visible-user-edit');
      const latest = save('other-surface-C');
      pending.resolve();
      await first;
      await latest;
      await settle();
      expect(credentials.stored).toBe('other-surface-C');
      expect(ui.input().value).toBe('visible-user-edit');
      expect(ui.reader.model().semanticScholar.status).toBe('');
      ui.dispose();
    });

    it('shows only the reference credential, autosaves edits and clears on deletion without exposing secrets', async () => {
      const ui = mount();
      await settle();
      expect(ui.root.querySelectorAll('input[type="password"]')).toHaveLength(1);
      expect(ui.root.textContent).not.toContain('MinerU');
      expect(ui.input().type).toBe('password');
      expect(ui.input().value).toBe(credentials.stored);
      expect(ui.reader.model().semanticScholar.status).toBe('');
      expect(JSON.stringify(ui.reader.model())).not.toContain(credentials.stored);
      expect(ui.root.textContent).not.toContain(credentials.stored);
      expect(save).not.toHaveBeenCalled();
      ui.edit('replacement-secret');
      await settle();
      expect(save).toHaveBeenLastCalledWith('replacement-secret');
      expect(ui.input().value).toBe('replacement-secret');
      expect(JSON.stringify(ui.reader.model())).not.toContain('replacement-secret');
      ui.input().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      expect(credentials.check).not.toHaveBeenCalled();
      ui.dispose();
      const reopened = mount();
      await settle();
      expect(reopened.input().value).toBe('replacement-secret');
      reopened.edit('');
      await settle();
      expect(save).toHaveBeenLastCalledWith(null);
      reopened.dispose();
      const cleared = mount();
      await settle();
      expect(cleared.input().value).toBe('');
      expect(cleared.reader.model().semanticScholar.status).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      cleared.dispose();
    });

    it('keeps rapid and same-value edits editable, ordered and durable after page closure', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async (value: string) => {
        await pending.promise;
        credentials.stored = value;
      });
      const ui = mount();
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
      const reopened = mount();
      pending.resolve();
      await sharedWrites;
      await settle();
      expect(save.mock.calls.map(([value]) => value)).toEqual(['first', 'second', 'second', null]);
      expect(reopened.input().value).toBe('');
      expect(credentials.stored).toBe('');
      expect(credentials.check).not.toHaveBeenCalled();
      reopened.dispose();
    });

    it('persists only completed IME input and never checks on composition or blur', async () => {
      const ui = mount();
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
        credentials.stored = value;
      });
      const ui = mount();
      await settle();
      ui.edit('exact-visible-value');
      ui.verify().click();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      expect(ui.input().disabled).toBe(false);
      pending.resolve();
      await settle();
      expect(credentials.check).toHaveBeenCalledWith(
        'exact-visible-value',
        expect.any(AbortSignal),
      );
      const commands = native.commands.flatMap((command) =>
        command.type === 'reader' ? [command.command] : [],
      );
      expect(commands).toContainEqual({ type: 'credentialInput' });
      expect(commands).toContainEqual({ type: 'verifyCredential' });
      expect(JSON.stringify(native.commands)).not.toContain('exact-visible-value');
      expect(ui.reader.model().semanticScholar.error).toBe(false);
      expect(ui.reader.model().semanticScholar.status).not.toBe('');
      expect(ui.reader.model().semanticScholar.checking).toBe(false);
      const link = ui.section().querySelector('a')!;
      expect(link.href.startsWith('https://')).toBe(true);
      link.click();
      expect(credentials.help).toHaveBeenCalledOnce();
      ui.dispose();
    });

    it('aborts and ignores stale validity after an edit or page remount', async () => {
      const first = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(first.promise);
      const ui = mount();
      await settle();
      ui.verify().click();
      await settle();
      const signal = credentials.check.mock.calls[0][1] as AbortSignal;
      ui.edit('different-key');
      expect(signal.aborted).toBe(true);
      first.resolve('valid');
      await settle();
      expect(ui.reader.model().semanticScholar.status).toBe('');
      const second = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(second.promise);
      ui.verify().click();
      await settle();
      const closingSignal = credentials.check.mock.calls[1][1] as AbortSignal;
      ui.dispose();
      expect(closingSignal.aborted).toBe(true);
      const reopened = mount();
      second.resolve('valid');
      await settle();
      expect(reopened.input().value).toBe('different-key');
      expect(reopened.reader.model().semanticScholar.status).toBe('');
      reopened.dispose();
    });

    it('retires verification waiting for storage when a later edit is accepted', async () => {
      const pending = Promise.withResolvers<void>();
      commit.mockImplementationOnce(async () => pending.promise);
      const ui = mount();
      await settle();
      ui.edit('first');
      ui.verify().click();
      ui.edit('second');
      pending.resolve();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      expect(credentials.stored).toBe('second');
      expect(ui.reader.model().semanticScholar.status).toBe('');
      ui.dispose();
    });

    it('reports storage errors, recovers on later input, and does not verify a failed save', async () => {
      credentials.readKey.mockImplementationOnce(() => {
        throw new Error('Storage unavailable');
      });
      const ui = mount();
      await settle();
      expect(ui.reader.model().semanticScholar.error).toBe(true);
      const failure = Promise.withResolvers<void>();
      commit.mockReturnValueOnce(failure.promise);
      ui.edit('failed');
      ui.verify().click();
      await settle();
      expect(credentials.check).not.toHaveBeenCalled();
      failure.reject(new Error('Write failed'));
      await settle();
      expect(ui.reader.model().semanticScholar.error).toBe(true);
      expect(credentials.check).not.toHaveBeenCalled();
      ui.edit('recovered');
      await settle();
      expect(credentials.stored).toBe('recovered');
      expect(ui.reader.model().semanticScholar.status).toBe('');
      ui.dispose();
    });

    it('reloads the saved field on tab remount and retires the previous verification', async () => {
      const check = Promise.withResolvers<string>();
      credentials.check.mockReturnValueOnce(check.promise);
      const ui = mount();
      await settle();
      ui.edit('tab-persisted');
      await settle();
      ui.verify().click();
      await settle();
      const signal = credentials.check.mock.calls[0][1] as AbortSignal;
      const oldInput = ui.input();
      ui.navigate('Appearance');
      expect(signal.aborted).toBe(true);
      expect(oldInput.value).toBe('');
      ui.navigate('Reader');
      check.resolve('valid');
      await settle();
      expect(ui.input()).not.toBe(oldInput);
      expect(ui.input().value).toBe('tab-persisted');
      expect(ui.reader.model().semanticScholar.status).toBe('');
      ui.dispose();
    });

    it('preserves native keyboard ownership during composition and saves accepted input before Escape closes', async () => {
      const ui = mount();
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
      expect(credentials.stored).toBe('keyboard-accepted');
    });
  });
});
