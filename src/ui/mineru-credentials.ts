import { t } from '../i18n';
import type { KeyGuideLanguage } from '../input/key-guide-config';
import { readMinerUToken, saveMinerUToken } from '../platform/document-credentials';
import { THEME_VARS } from './theme';

export interface MinerUCredentialField {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  token(): string;
  setMinerU(enabled: boolean): void;
  setDisabled(disabled: boolean): void;
  dispose(): void;
}

/** Shared explicit save/forget controls for Settings, single-file comparison and batch preparation. */
export function mineruCredentialField(
  doc: Document,
  language: () => KeyGuideLanguage,
  initialMinerU = true,
): MinerUCredentialField {
  const H = 'http://www.w3.org/1999/xhtml',
    text = (key: string): string => t(`documentCredentials.${key}`, language());
  const root = doc.createElementNS(H, 'div') as HTMLElement;
  const label = doc.createElementNS(H, 'label') as HTMLLabelElement;
  const caption = doc.createElementNS(H, 'span');
  label.append(caption);
  const input = doc.createElementNS(H, 'input') as HTMLInputElement;
  input.type = 'password';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', text('token'));
  input.style.marginInlineStart = '8px';
  label.append(input);
  const controls = doc.createElementNS(H, 'span') as HTMLElement;
  const save = doc.createElementNS(H, 'button') as HTMLButtonElement,
    clear = doc.createElementNS(H, 'button') as HTMLButtonElement;
  save.type = clear.type = 'button';
  save.textContent = text('save');
  clear.textContent = text('clear');
  controls.append(save, clear);
  const status = doc.createElementNS(H, 'small') as HTMLElement;
  status.style.cssText = `display:block;color:${THEME_VARS.muted}`;
  status.setAttribute('role', 'status');
  root.append(label, controls, status);
  let mineru = initialMinerU,
    disabled = false,
    pending = false,
    disposed = false;
  const refresh = (): void => {
    if (disposed) return;
    controls.hidden = !mineru;
    input.disabled = disabled || pending;
    save.disabled = clear.disabled = disabled || pending;
  };
  const load = (): void => {
    caption.textContent = text(mineru ? 'token' : 'temporaryToken');
    input.setAttribute('aria-label', caption.textContent);
    try {
      input.value = mineru ? readMinerUToken() : 'dummy';
      status.textContent = mineru ? text('hint') : '';
    } catch {
      input.value = '';
      status.textContent = text('unavailable');
    }
    refresh();
  };
  const write = async (clearToken: boolean): Promise<void> => {
    if (disposed || disabled || pending || !mineru) return;
    const ownedFocus = root.contains(doc.activeElement);
    const forget = clearToken || !input.value.trim();
    pending = true;
    refresh();
    try {
      await saveMinerUToken(forget ? '' : input.value);
      if (!disposed) {
        if (forget) input.value = '';
        status.textContent = text(forget ? 'cleared' : 'saved');
      }
    } catch {
      if (!disposed) status.textContent = text('unavailable');
    } finally {
      pending = false;
      refresh();
      if (
        !disposed &&
        root.isConnected &&
        ownedFocus &&
        (!doc.activeElement ||
          doc.activeElement === root.closest('[role="dialog"]') ||
          doc.activeElement === doc.body ||
          doc.activeElement === doc.documentElement)
      )
        input.focus();
    }
  };
  save.addEventListener('click', () => {
    void write(false);
  });
  clear.addEventListener('click', () => {
    void write(true);
  });
  load();
  return {
    root,
    input,
    token: () => {
      try {
        return input.value || (mineru ? readMinerUToken() : '');
      } catch {
        if (!disposed) status.textContent = text('unavailable');
        return '';
      }
    },
    setMinerU: (enabled) => {
      mineru = enabled;
      load();
    },
    setDisabled: (value) => {
      disabled = value;
      refresh();
    },
    dispose: () => {
      disposed = true;
      try {
        input.value = '';
      } catch {
        /* The owning content window may already be destroyed. */
      }
    },
  };
}
