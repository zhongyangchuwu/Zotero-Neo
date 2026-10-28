import type {
  ReaderNoteCaptureResult,
  ReaderSelectionActionDefinition,
  ReaderSelectionContext,
} from '../../core/contracts';
import type { ModuleHost } from '../../core/module-host';
import type { KeyGuideLanguage } from '../../input/key-guide-config';

export interface ReaderCaptureModule {
  selectionAction(language: KeyGuideLanguage): ReaderSelectionActionDefinition;
}

/** Owns the Reader capture contribution for one Reader session lifetime. */
export function createReaderCaptureModule(
  host: ModuleHost,
  capture: (context: ReaderSelectionContext) => Promise<ReaderNoteCaptureResult>,
): ReaderCaptureModule {
  return host.activate('capture', (scope) => ({
    selectionAction(language) {
      return {
        id: 'neo.capture-note',
        label: language === 'zh-CN' ? '捕获到笔记' : 'Capture to note',
        isAvailable: (selection) =>
          scope.isCurrent() && selection.itemID !== null && !!selection.text.trim(),
        run: async (selection) => {
          if (!scope.isCurrent()) return { retired: true };
          const result = await capture(selection);
          if (!scope.isCurrent() || (result && 'retired' in result)) return { retired: true };
          if (!result) return;
          return {
            status:
              language === 'zh-CN'
                ? `✓ 已保存到「${result.noteTitle}」`
                : `✓ Saved to “${result.noteTitle}”`,
          };
        },
      };
    },
  }));
}
