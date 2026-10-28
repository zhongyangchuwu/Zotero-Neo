import type { ModuleHost } from '../../core/module-host';
import type { FocusDirection } from '../../input/actions';
import type { PdfWindow } from '../../reader/types';
import { READER_WORKSPACE_ACTIONS, type ReaderWorkspaceAction } from './reader-actions';

export interface ReaderWorkspaceModuleHost {
  readonly isViewCurrent: (window: PdfWindow) => boolean;
  readonly toggleSplit: (type: 'horizontal' | 'vertical') => void;
  readonly focusDirection: (direction: FocusDirection) => boolean;
  readonly canFocusDirection: (direction: FocusDirection) => boolean;
}

export interface ReaderWorkspaceModule {
  executeAction(action: ReaderWorkspaceAction, window: PdfWindow): boolean;
  focusDirection(direction: FocusDirection, window: PdfWindow): boolean;
  canFocusDirection(direction: FocusDirection): boolean;
}

/** Owns the Reader split commands for this exact Reader-session lifetime. */
export function createReaderWorkspaceModule(
  host: ModuleHost,
  ports: ReaderWorkspaceModuleHost,
): ReaderWorkspaceModule {
  return host.activate('workspace', (scope) => {
    const focusDirection = (direction: FocusDirection, window: PdfWindow): boolean => {
      if (!scope.isCurrent() || !ports.isViewCurrent(window)) return false;
      return ports.focusDirection(direction);
    };
    const performAction = (action: ReaderWorkspaceAction, window: PdfWindow): void => {
      switch (action) {
        case 'toggleReaderSplitHorizontal':
          ports.toggleSplit('horizontal');
          break;
        case 'toggleReaderSplitVertical':
          ports.toggleSplit('vertical');
          break;
        case 'focusReaderSplitLeft':
          focusDirection('left', window);
          break;
        case 'focusReaderSplitDown':
          focusDirection('down', window);
          break;
        case 'focusReaderSplitUp':
          focusDirection('up', window);
          break;
        case 'focusReaderSplitRight':
          focusDirection('right', window);
          break;
      }
    };

    const invokers = new Map<ReaderWorkspaceAction, (window: PdfWindow) => boolean>();
    for (const action of READER_WORKSPACE_ACTIONS) {
      invokers.set(
        action,
        host.bind<PdfWindow>(scope, 'reader-normal', action, (window) => {
          performAction(action, window);
        }),
      );
    }

    return {
      executeAction: (action, window) => {
        if (!scope.isCurrent() || !ports.isViewCurrent(window)) return false;
        return invokers.get(action)?.(window) ?? false;
      },
      focusDirection,
      canFocusDirection: (direction) => scope.isCurrent() && ports.canFocusDirection(direction),
    };
  });
}
