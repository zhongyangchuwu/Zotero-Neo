import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import type { ModuleHost } from '../../core/module-host';
import { t } from '../../i18n';
import type { ReaderAIController } from '../../reader-ai/controller';
import { ReaderAIError } from '../../reader-ai/errors';
import type { ReaderAIPort } from '../../reader-ai/reader-port';

export interface ReaderAIModule {
  open(): boolean;
  selectionActions(): readonly ReaderSelectionActionDefinition[];
}

/** Reader owns invocation context; the app owns task and accepted-result lifetime. */
export function createReaderAIModule(
  host: ModuleHost,
  controller: ReaderAIController | null,
  port: ReaderAIPort,
): ReaderAIModule {
  if (!controller) throw new ReaderAIError('unsupported');
  return host.activate('reader-ai', (scope) => {
    scope.add(controller.register(port));
    const open = host.bind<void>(scope, 'reader-normal', 'openReaderAI', () => {
      controller.open(port.reader);
    });
    return {
      open: () => open(),
      selectionActions: () => [
        {
          id: 'neo.ai.explain',
          label: t('reader.ai.explain', port.language()),
          isAvailable: (context) =>
            scope.isCurrent() && context.itemID === port.reader.itemID && !!context.text.trim(),
          run: (context) => controller.explain(port.reader, context),
        },
      ],
    };
  });
}
