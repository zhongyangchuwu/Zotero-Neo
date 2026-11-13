export interface MainNoticeReactModel {
  readonly text: string;
  readonly kind: 'success' | 'info' | 'error';
  readonly visible: boolean;
}
