export interface AnnotationCommentReactModel {
  comment: string;
  excerpt: string;
  hint: string;
}

// Native input and composition events remain owned by the controller.
export type AnnotationCommentReactCommand = never;
