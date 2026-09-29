export interface AnnotationDeletionTarget {
  eraseTx?(): Promise<unknown>;
}

/** Permanently delete the explicitly resolved Reader annotation. */
export async function deleteAnnotation(annotation: AnnotationDeletionTarget): Promise<void> {
  if (!annotation.eraseTx) throw new Error('Annotation cannot be deleted');
  await annotation.eraseTx();
}
