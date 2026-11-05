import { t } from '../i18n';
import type { SettingsLanguage } from '../main/settings-i18n';
import { createReferenceMetadataService } from '../references/metadata';
import { THEME_VARS } from './theme';

export interface ReferenceCredentialField {
  readonly root: HTMLElement;
  dispose(): void;
}

/** Owns one Settings page's explicit Semantic Scholar credential controls and metadata service. */
export function referenceCredentialField(
  doc: Document,
  language: () => SettingsLanguage,
): ReferenceCredentialField {
  const service = createReferenceMetadataService();
  const text = (key: string): string => t(`reader.references.credentials.${key}`, language());
  const root = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement;
  const title = doc.createElementNS('http://www.w3.org/1999/xhtml', 'h3') as HTMLHeadingElement;
  title.textContent = text('title');
  const hint = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p') as HTMLParagraphElement;
  hint.textContent = text('hint');

  const label = doc.createElementNS('http://www.w3.org/1999/xhtml', 'label') as HTMLLabelElement;
  const caption = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
  const keyLabel = text('key');
  caption.textContent = keyLabel;
  label.append(caption);
  const input = doc.createElementNS('http://www.w3.org/1999/xhtml', 'input') as HTMLInputElement;
  input.type = 'password';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', keyLabel);
  input.style.marginInlineStart = '8px';
  label.append(input);

  const controls = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span') as HTMLSpanElement;
  controls.style.cssText = 'display:inline-flex;gap:8px;margin-top:8px';
  const save = doc.createElementNS('http://www.w3.org/1999/xhtml', 'button') as HTMLButtonElement;
  const forget = doc.createElementNS('http://www.w3.org/1999/xhtml', 'button') as HTMLButtonElement;
  save.type = forget.type = 'button';
  save.textContent = text('save');
  forget.textContent = text('forget');
  controls.append(save, forget);

  const status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'small') as HTMLElement;
  status.style.cssText = `display:block;color:${THEME_VARS.muted}`;
  status.setAttribute('role', 'status');
  root.append(title, hint, label, controls, status);

  let disposed = false;
  let pending = true;
  let revision = 0;
  const refresh = (): void => {
    if (disposed) return;
    input.disabled = pending;
    save.disabled = forget.disabled = pending;
  };
  const current = (token: number): boolean => !disposed && token === revision;
  const write = async (key: string | null): Promise<void> => {
    if (disposed || pending) return;
    const token = ++revision;
    pending = true;
    try {
      input.value = '';
    } catch {
      /* The Settings window may be closing. */
    }
    status.textContent = text('saving');
    refresh();
    try {
      await service.setSemanticScholarKey(key);
      if (current(token)) status.textContent = text(key === null ? 'forgotten' : 'saved');
    } catch {
      if (current(token)) status.textContent = text('unavailable');
    } finally {
      if (current(token)) {
        pending = false;
        refresh();
      }
    }
  };
  const onSave = (): void => {
    if (disposed || pending) return;
    const key = input.value;
    if (!key.trim()) {
      status.textContent = text('required');
      return;
    }
    void write(key);
  };
  const onForget = (): void => {
    void write(null);
  };
  save.addEventListener('click', onSave);
  forget.addEventListener('click', onForget);

  const token = ++revision;
  status.textContent = text('checking');
  refresh();
  void service
    .hasSemanticScholarKey()
    .then((exists) => {
      if (current(token)) status.textContent = text(exists ? 'configured' : 'notConfigured');
    })
    .catch(() => {
      if (current(token)) status.textContent = text('unavailable');
    })
    .finally(() => {
      if (current(token)) {
        pending = false;
        refresh();
      }
    });

  return {
    root,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      revision++;
      input.disabled = save.disabled = forget.disabled = true;
      save.removeEventListener('click', onSave);
      forget.removeEventListener('click', onForget);
      try {
        input.value = '';
      } catch {
        /* The Settings window may already be destroyed. */
      }
      service.dispose();
    },
  };
}
