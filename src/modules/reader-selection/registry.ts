import type { ReaderSelectionActionDefinition, ReaderSelectionContext } from '../../core/contracts';

/** App-lifetime registry behind the public selection-action extension seam. */
export class ReaderSelectionActionRegistry {
  readonly #actions = new Map<string, ReaderSelectionActionDefinition>();

  register(action: ReaderSelectionActionDefinition): () => void {
    const id = action.id.trim();
    const label = action.label.trim();
    if (!id || !label || typeof action.run !== 'function')
      throw new Error('Selection action requires id, label, and run');
    if (this.#actions.has(id)) throw new Error(`Selection action already registered: ${id}`);
    const stored = { ...action, id, label };
    this.#actions.set(id, stored);
    return () => {
      if (this.#actions.get(id) === stored) this.#actions.delete(id);
    };
  }

  available(
    context: ReaderSelectionContext,
    isCurrent: () => boolean,
  ): ReaderSelectionActionDefinition[] {
    const result: ReaderSelectionActionDefinition[] = [];
    for (const action of this.#actions.values()) {
      if (!isCurrent()) return [];
      let available = true;
      try {
        if (action.isAvailable) available = action.isAvailable(context);
      } catch {
        // A third-party availability predicate must not break the selection workflow.
        available = false;
      }
      if (!isCurrent()) return [];
      if (available) result.push(action);
    }
    return result;
  }

  clear(): void {
    this.#actions.clear();
  }
}
