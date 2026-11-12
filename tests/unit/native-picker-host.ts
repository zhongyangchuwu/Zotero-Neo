import type { MainWindowSession } from '../../src/main/session';
import type { PickerReactModel } from '../../src/main/picker/react-model';
import type { NativeReactView } from '../../src/ui/react/types';

let nextReady: Promise<void> | undefined;

export function deferNextPickerReady(): { resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  nextReady = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { resolve, reject };
}

/** Fake only the native React adapter: the controller still owns all event policy. */
export function mountNativeReactView(options: {
  root: HTMLElement;
  surface: string;
  model: PickerReactModel;
  isCurrent: () => boolean;
}): NativeReactView<PickerReactModel> {
  if (options.surface === 'main-notice') {
    return {
      ready: Promise.resolve(),
      update: () => {},
      getElement: () => null,
      dispose: () => {},
    };
  }
  const { root } = options;
  const create = (tag: string) =>
    root.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
  const parts = new Map<string, HTMLElement>();
  for (const part of [
    'query',
    'results',
    'preview',
    'count',
    'source',
    'status',
    'preview-title',
    'query-help',
    'list-help',
  ]) {
    const element = create(part === 'query' ? 'input' : part === 'source' ? 'button' : 'div');
    parts.set(part, element);
    root.append(element);
  }
  const results = parts.get('results')!;
  let model = options.model;
  let disposed = false;
  const update = (next: PickerReactModel) => {
    if (disposed || !options.isCurrent()) return;
    model = next;
    const count = next.loading ? 0 : next.rows.length;
    const rows = Array.from(results.children) as HTMLElement[];
    while (rows.length < count) {
      const row = create('div');
      row.dataset.zvPickerRow = '1';
      row.dataset.zvPickerIndex = String(rows.length);
      row.append(create('span'));
      rows.push(row);
    }
    results.replaceChildren(...rows.slice(0, count));
  };
  const ready = nextReady ?? Promise.resolve();
  nextReady = undefined;
  const view = {
    ready,
    update,
    getElement: (part: string) => parts.get(part) ?? null,
    dispose: () => {
      disposed = true;
    },
    get model() {
      return model;
    },
  };
  update(model);
  return view;
}

export function pickerModel(session: MainWindowSession): PickerReactModel {
  const view = session.picker.view as
    | (NativeReactView<PickerReactModel> & { model: PickerReactModel })
    | null;
  if (!view) throw new Error('Expected mounted picker view');
  return view.model;
}
