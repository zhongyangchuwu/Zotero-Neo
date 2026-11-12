import { ZoteroLogger } from '../core/logging';
import type { KeyGuideEntry } from '../input/key-guide';
import { formatGuideKey, formatGuidePrefix } from '../input/key-guide';
import { mountNativeReactView } from '../platform/native-ui';
import type { NativeReactView } from './react/types';
import type { KeyGuideReactModel } from './key-guide-react-model';
import type { ThemeRoot } from './theme';

export interface KeyGuideThemeHost {
  add(root: ThemeRoot): () => void;
}

/** A non-interactive continuation panel; input remains owned by the existing matcher. */
export class KeyGuide {
  #element: HTMLElement | null = null;
  #document: Document | null = null;
  #view: NativeReactView<KeyGuideReactModel> | null = null;
  #themeCleanup: (() => void) | null = null;

  get visible(): boolean {
    return this.#element !== null;
  }

  show(
    document: Document,
    theme: KeyGuideThemeHost,
    prefix: string,
    entries: readonly KeyGuideEntry[],
    fontSizePx: number,
  ): void {
    if (!entries.length) {
      this.hide();
      return;
    }
    if (this.#document !== document) this.hide();
    const model: KeyGuideReactModel = {
      prefix: formatGuidePrefix(prefix),
      entries: entries.map((entry) => ({
        key: formatGuideKey(entry.key),
        label: entry.isGroup ? `+ ${entry.label}` : entry.label,
      })),
      fontSizePx,
    };
    if (this.#view) {
      this.#view.update(model);
      return;
    }
    const root = document.createElement('div');
    root.id = 'zotero-neo-key-guide';
    root.setAttribute('aria-live', 'polite');
    (document.body ?? document.documentElement).appendChild(root);
    this.#element = root;
    this.#document = document;
    this.#themeCleanup = theme.add(root as ThemeRoot);
    this.#view = mountNativeReactView({
      surface: 'key-guide',
      root,
      model,
      dispatch: () => {},
      isCurrent: () => this.#element === root && this.#document === document && root.isConnected,
      loadingText: '',
      errorText: '',
      onError: (error) => new ZoteroLogger().debug(`Key guide view failed: ${String(error)}`),
    });
  }

  hide(): void {
    this.#view?.dispose();
    this.#view = null;
    this.#themeCleanup?.();
    this.#themeCleanup = null;
    this.#element?.remove();
    this.#element = null;
    this.#document = null;
  }
}
