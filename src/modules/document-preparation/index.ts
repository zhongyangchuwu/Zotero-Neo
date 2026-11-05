import type { Cleanup } from '../../core/cleanup';
import type { ModuleHost } from '../../core/module-host';
import type { DocumentPreparationPort, PreparationPresentation } from './controller';

export { DocumentPreparationController } from './controller';
export type { DocumentPreparationPort, PreparationPresentation } from './controller';

export interface DocumentPreparationModule {
  open(presentation: PreparationPresentation): boolean;
}

/** The scoped presentation borrows the application-owned queue. */
export function createDocumentPreparationModule(
  host: ModuleHost,
  context: 'main-normal' | 'reader-normal',
  service: DocumentPreparationPort,
): DocumentPreparationModule {
  return host.activate('document-preparation', (scope) => {
    let release: Cleanup | null = null;
    scope.add(() => {
      release?.();
      release = null;
    });
    const open = host.bind<PreparationPresentation>(
      scope,
      context,
      'prepareDocuments',
      (presentation) => {
        release?.();
        release = service.open({
          ...presentation,
          isCurrent: () => scope.isCurrent() && presentation.isCurrent(),
        });
      },
    );
    return { open };
  });
}
