import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import type { ModuleHost } from '../../core/module-host';
import { t } from '../../i18n';
import type { AIQAController } from '../../ai-qa/controller';
import { AIQAError } from '../../ai-qa/errors';
import type { AIQAReaderPort } from '../../ai-qa/reader-port';

export interface AIQAModule {
  open(): boolean;
  selectionActions(): readonly ReaderSelectionActionDefinition[];
}

/** Reader owns invocation context; the app owns task and accepted-result lifetime. */
export function createAIQAModule(
  host: ModuleHost,
  controller: AIQAController | null,
  port: AIQAReaderPort,
): AIQAModule {
  if (!controller) throw new AIQAError('unsupported');
  return host.activate('ai-qa', (scope) => {
    scope.add(controller.register(port));
    const open = host.bind<void>(scope, 'reader-normal', 'openAIQA', () => {
      controller.open(port.reader);
    });
    return {
      open: () => open(),
      selectionActions: () => [
        {
          id: 'neo.ai-qa.explain',
          label: t('reader.ai.explain', port.language()),
          isAvailable: (context) =>
            scope.isCurrent() && context.itemID === port.reader.itemID && !!context.text.trim(),
          run: (context) => controller.explain(port.reader, context),
        },
      ],
    };
  });
}
