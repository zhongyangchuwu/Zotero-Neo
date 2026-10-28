import type { MainWindow } from '../core/contracts';
import { InputRuntime } from '../input/runtime';

/** Neo runtime state for the currently attached Note editor host. */
export class NoteSurfaceRuntime {
  editorWindow: Window | null = null;
  editorDocument: Document | null = null;
  handler: EventListener | null = null;
  itemID: number | null = null;
  revision = 0;
  readonly input: InputRuntime;

  constructor(timerHost: MainWindow) {
    this.input = new InputRuntime(timerHost);
  }

  deactivateInteraction(): void {
    this.input.reset();
  }

  resetInteraction(): void {
    this.input.reset();
    this.itemID = null;
  }
}
