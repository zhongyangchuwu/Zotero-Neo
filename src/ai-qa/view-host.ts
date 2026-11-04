import { cloneInto, isDeadObject } from '../platform/cross-compartment';
import { exportAIQADispatch, loadAIQAUI } from '../platform/ai-qa-ui';
import type { AIQAPanelLease } from '../toolkit/reader';
import type { AIQACommand, AIQAView, AIQAViewModel } from './view-contracts';

/** Mount only in the native window and panel represented by this exact lease. */
export async function mountAIQAView(
  rootURI: string,
  lease: AIQAPanelLease,
  model: AIQAViewModel,
  dispatch: (command: AIQACommand) => void,
): Promise<AIQAView> {
  if (!lease.isCurrent()) throw new Error('AI Q&A panel lease is no longer current');
  const owner = lease.window;
  const runtime = await loadAIQAUI(rootURI, owner);
  if (!lease.isCurrent()) throw new Error('AI Q&A panel lease is no longer current');

  let disposed = false;
  const callback = exportAIQADispatch(owner, (command) => {
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
    throw new Error('AI Q&A panel lease is no longer current');
  }
  return {
    update(nextModel): void {
      if (!disposed && lease.isCurrent()) view.update(cloneInto(nextModel, owner));
    },
    dispose,
  };
}
