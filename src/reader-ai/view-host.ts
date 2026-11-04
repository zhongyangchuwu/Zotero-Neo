import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { exportReaderAIDispatch, loadReaderAIUI } from '../platform/reader-ai-ui';
import type { ReaderAIPanelLease } from '../toolkit/reader';
import type { ReaderAICommand, ReaderAIView, ReaderAIViewModel } from './view-contracts';

/** Mount only in the native window and panel represented by this exact lease. */
export async function mountReaderAIView(
  rootURI: string,
  lease: ReaderAIPanelLease,
  model: ReaderAIViewModel,
  dispatch: (command: ReaderAICommand) => void,
): Promise<ReaderAIView> {
  if (!lease.isCurrent()) throw new Error('Reader AI panel lease is no longer current');
  const owner = lease.window;
  const runtime = await loadReaderAIUI(rootURI, owner);
  if (!lease.isCurrent()) throw new Error('Reader AI panel lease is no longer current');

  let disposed = false;
  const callback = exportReaderAIDispatch(owner, (command) => {
    if (!disposed && lease.isCurrent()) dispatch(command);
  });
  const view = runtime.mount(lease.root, cloneInto(model, owner), callback);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (isDeadObject(owner) || isDeadObject(lease.root)) return;
    try {
      view.dispose();
    } catch (error) {
      // A window can die during unmount; live cleanup errors must remain visible.
      if (!isDeadObject(owner) && !isDeadObject(lease.root)) throw error;
    }
  };
  if (!lease.isCurrent()) {
    dispose();
    throw new Error('Reader AI panel lease is no longer current');
  }
  return {
    update(nextModel): void {
      if (!disposed && lease.isCurrent()) view.update(cloneInto(nextModel, owner));
    },
    dispose,
  };
}
