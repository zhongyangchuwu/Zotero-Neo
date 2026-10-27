import type { ModuleHost } from '../../core/module-host';
import type { PdfWindow } from '../../reader/types';
import { ReaderCopyHints } from './copy-hints';
import { ReaderLinkHints, type ReaderLinkHintsHost } from './link-hints';

export interface ReaderHintsModuleHost extends Omit<ReaderLinkHintsHost, 'isCurrent'> {
  readonly copyText: (text: string) => void;
}

export interface ReaderHintsModule {
  readonly copy: Pick<
    ReaderCopyHints,
    'hasHints' | 'ownsView' | 'handleKey' | 'onViewportChange' | 'releaseView' | 'close'
  >;
  readonly links: Pick<
    ReaderLinkHints,
    | 'hasHints'
    | 'ownsView'
    | 'handleKey'
    | 'onViewportChange'
    | 'releaseView'
    | 'cancelHints'
    | 'close'
  >;
  copyTarget(window: PdfWindow): boolean;
  followLink(window: PdfWindow): boolean;
}

/** Owns one Reader's hints and native activations; input and navigation policy stay with the Surface. */
export function createReaderHintsModule(
  host: ModuleHost,
  ports: ReaderHintsModuleHost,
): ReaderHintsModule {
  return host.activate('reader-hints', (scope) => {
    const scoped = {
      ...ports,
      isCurrent: () => scope.isCurrent(),
      viewForWindow: (window: PdfWindow) =>
        scope.isCurrent() ? ports.viewForWindow(window) : null,
      showStatus: (message: string, duration?: number) => {
        if (scope.isCurrent()) ports.showStatus(message, duration);
      },
      copyText: (text: string) => {
        if (scope.isCurrent()) ports.copyText(text);
      },
    };
    const links = new ReaderLinkHints(scoped);
    scope.add(() => links.close());
    const copy = new ReaderCopyHints(scoped);
    scope.add(() => copy.close());
    return {
      copy,
      links,
      followLink: host.bind<PdfWindow>(scope, 'reader-normal', 'followLink', (window) =>
        links.open(window),
      ),
      copyTarget: host.bind<PdfWindow>(scope, 'reader-normal', 'copyTarget', (window) =>
        copy.open(window),
      ),
    };
  });
}
