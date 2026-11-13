import type { KeyGuideLanguage } from '../../input/key-guide-config';
import type { TabSidebarView } from './types';

export interface TabSidebarReactModel {
  readonly view: TabSidebarView;
  readonly language: KeyGuideLanguage;
  readonly top?: boolean;
  readonly collapsed: boolean;
  readonly query: string;
  readonly editing: null | {
    readonly groupID: string | null;
    readonly memberID?: string;
    readonly initialName: string;
  };
  readonly menu: null | {
    readonly kind: 'blank' | 'group' | 'entry';
    readonly groupID: string | null;
    readonly entryID?: string;
    readonly x: number;
    readonly y: number;
  };
  readonly status: string;
}

// Native event delegation owns keyboard, input, drag/drop and menu commands.
export type TabSidebarReactCommand = never;
