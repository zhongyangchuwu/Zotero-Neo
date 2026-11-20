import type { InstalledPlugin } from './host';

export type ExtensionsInlineModel =
  | { readonly kind: 'source'; readonly resolving: boolean; readonly curated: readonly string[] }
  | {
      readonly kind: 'choose';
      readonly candidates: readonly { name: string; version?: string }[];
      readonly selected: number;
    }
  | {
      readonly kind: 'install';
      readonly name: string;
      readonly url: string;
      readonly version?: string;
    }
  | { readonly kind: 'uninstall'; readonly name: string; readonly version: string };

/** Plain data passed to the packaged React compartment. */
export interface ExtensionsReactModel {
  readonly chinese: boolean;
  readonly plugins: readonly InstalledPlugin[];
  readonly selected: number;
  readonly query: string;
  readonly count: string;
  readonly listMessage: string;
  readonly listStatus: 'normal' | 'muted' | 'error';
  readonly loading: boolean;
  readonly canStop: boolean;
  readonly canInstall: boolean;
  readonly canUpdate: boolean;
  readonly canUpdateAll: boolean;
  readonly canUninstall: boolean;
  readonly needsRestart: boolean;
  readonly inline: ExtensionsInlineModel | null;
  readonly notice: string;
  readonly report: readonly string[];
  readonly shortcuts: string;
  readonly footer: string;
}

export type ExtensionsReactCommand =
  | { readonly type: 'stop' }
  | {
      readonly type: 'action';
      readonly action: 'pluginsInstall' | 'pluginsUpdate' | 'pluginsUpdateAll' | 'pluginsUninstall';
    }
  | { readonly type: 'inline-submit' }
  | { readonly type: 'inline-dismiss' }
  | { readonly type: 'choose'; readonly index: number }
  | { readonly type: 'curated'; readonly index: number }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'link'; readonly kind: 'homepage' | 'repository' | 'readme' | 'git-log' };
