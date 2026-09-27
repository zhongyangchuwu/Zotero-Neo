import type { MainWindow } from '../core/contracts';
import { InputRuntime } from '../input/runtime';

export type NoteMode = 'normal' | 'insert';

/** Neo runtime state for the currently attached Note editor host. */
export class NoteSurfaceRuntime {
  editorWindow: Window | null = null;
  editorDocument: Document | null = null;
  handler: EventListener | null = null;
  itemID: number | null = null;
  mode: NoteMode = 'normal';
  readonly input: InputRuntime;
  yank = '';

  constructor(timerHost: MainWindow) {
    this.input = new InputRuntime(timerHost);
  }

  resetInteraction(): void {
    this.input.reset();
    this.itemID = null;
    this.mode = 'normal';
    this.yank = '';
  }
}
