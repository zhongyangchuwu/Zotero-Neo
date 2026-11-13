import type { ReactNode } from 'react';
import { React, createRoot, flushSync } from './runtime';
import type { ReactView } from './types';

/**
 * Keeps legacy host input/focus code synchronous with committed React DOM.
 * Call from host commands/events, not React render or lifecycle callbacks.
 */
export function createReactView<Model>(
  root: HTMLElement,
  render: (model: Model) => ReactNode,
  initialModel: Model,
): ReactView<Model> {
  let failed = false;
  let renderError: unknown;
  const reactRoot = createRoot(root, {
    onUncaughtError(error) {
      failed = true;
      renderError = error;
    },
  });
  let disposed = false;
  const update = (model: Model): void => {
    if (disposed) return;
    flushSync(() => reactRoot.render(<>{render(model)}</>));
    if (failed) {
      failed = false;
      throw renderError;
    }
  };
  try {
    update(initialModel);
  } catch (error) {
    disposed = true;
    reactRoot.unmount();
    throw error;
  }
  return {
    update,
    getElement(part) {
      if (disposed) return null;
      return root.querySelector<HTMLElement>(`[data-neo-ui-part="${part}"]`);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reactRoot.unmount();
    },
  };
}
