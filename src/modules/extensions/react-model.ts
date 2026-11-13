import type { InstalledPlugin } from './host';

/** Plain data passed to the packaged React compartment. */
export interface ExtensionsReactModel {
  readonly plugins: readonly InstalledPlugin[];
  readonly selected: number;
  readonly query: string;
  readonly count: string;
  readonly listMessage: string;
  readonly listStatus: 'normal' | 'muted' | 'error';
  readonly loading: boolean;
  readonly canCancel: boolean;
  readonly shortcuts: string;
  readonly footer: string;
}

export type ExtensionsReactCommand =
  | { readonly type: 'cancel' }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'link'; readonly kind: 'homepage' | 'repository' | 'readme' | 'git-log' };
