export interface AnnotationCommentReactModel {
  comment: string;
  excerpt: string;
  hint: string;
  status: string;
  retry: string;
  overwrite: string;
  discard: string;
  canRetry: boolean;
  canOverwrite: boolean;
  canDiscard: boolean;
}

// Native input and composition events remain owned by the controller.
export type AnnotationCommentReactCommand = 'retry' | 'overwrite' | 'discard';
