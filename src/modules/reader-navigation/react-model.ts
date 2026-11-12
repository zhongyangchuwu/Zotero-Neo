export type ReaderSidebarViewModel =
  | {
      readonly kind: 'marks';
      readonly label: string;
      readonly empty: string;
      readonly open: boolean;
      readonly entries: readonly {
        readonly char: string;
        readonly label: string;
        readonly deleteLabel: string;
      }[];
    }
  | {
      readonly kind: 'captions';
      readonly label: string;
      readonly cost: string;
      readonly status: string;
      readonly open: boolean;
      readonly groups: readonly {
        readonly kind: 'figure' | 'table';
        readonly label: string;
        readonly open: boolean;
        readonly entries: readonly {
          readonly index: number;
          readonly label: string;
          readonly title: string;
        }[];
      }[];
    };

export type ReaderSidebarCommand =
  | { readonly type: 'jump-mark' | 'delete-mark'; readonly char: string }
  | { readonly type: 'caption'; readonly index: number };
