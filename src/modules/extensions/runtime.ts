import type { CompositionState } from '../../input/composition';
import type { LocalBindingRuntime } from '../../input/local-binding-runtime';
import type { InstalledPlugin } from './host';
import type { ExtensionCandidate } from './sources';

export type ExtensionPanelInline =
  | { readonly kind: 'source' }
  | {
      readonly kind: 'choose';
      readonly candidates: readonly ExtensionCandidate[];
      readonly selected: number;
    }
  | { readonly kind: 'install'; readonly candidate: ExtensionCandidate }
  | { readonly kind: 'uninstall'; readonly plugin: InstalledPlugin };

export interface ExtensionPanelOperation {
  readonly controller: AbortController;
  cancel: (() => void) | null;
  stoppable: boolean;
}

/** Mutable interaction state owned by one window's extensions module. */
export class PluginManagerRuntime {
  open = false;
  generation = 0;
  loading = false;
  operation: ExtensionPanelOperation | null = null;
  get busy(): boolean {
    return this.operation !== null;
  }
  inline: ExtensionPanelInline | null = null;
  // A settled mutation may need restart before the latest native list shows its pending state.
  // Keep that result for the owning window's lifetime, not just this overlay opening.
  operationNeedsRestart = false;
  error = '';
  notice = '';
  report: string[] = [];
  plugins: InstalledPlugin[] = [];
  filtered: InstalledPlugin[] = [];
  selected = 0;
  query = '';
  composition: CompositionState = { active: false };
  sourceComposition: CompositionState = { active: false };
  localBindings: LocalBindingRuntime | null = null;
  overlay: HTMLElement | null = null;
  list: HTMLElement | null = null;
  details: HTMLElement | null = null;
  count: HTMLElement | null = null;
  input: HTMLInputElement | null = null;
  sourceInput: HTMLInputElement | null = null;
  footer: HTMLElement | null = null;
  previousElement: Element | null = null;
  inputCleanup: (() => void) | null = null;
  sourceInputCleanup: (() => void) | null = null;
  themeCleanup: (() => void) | null = null;
}
