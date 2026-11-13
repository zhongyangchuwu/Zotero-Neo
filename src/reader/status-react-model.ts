export interface ReaderStatusReactModel {
  readonly visible: boolean;
  readonly text: string;
  readonly kind: 'normal' | 'visual' | 'insert' | 'success' | 'info' | 'error';
}
