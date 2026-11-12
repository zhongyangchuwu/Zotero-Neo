import type { NativeReactViewOptions } from '../../src/ui/react/types';
import type { SettingsReactCommand, SettingsReactModel } from '../../src/main/settings-react-model';
import type { PickerReactModel } from '../../src/main/picker/react-model';
import type { MainNoticeReactModel } from '../../src/main/notice-react-model';
import type { KeyGuideReactModel } from '../../src/ui/key-guide-react-model';

type SettingsOptions = NativeReactViewOptions<SettingsReactModel, SettingsReactCommand> & {
  surface: 'settings';
};
type PickerOptions = NativeReactViewOptions<PickerReactModel, never> & { surface: 'picker' };
type NoticeOptions = NativeReactViewOptions<MainNoticeReactModel, never> & {
  surface: 'main-notice';
};
type GuideOptions = NativeReactViewOptions<KeyGuideReactModel, never> & { surface: 'key-guide' };

type Host = {
  root: HTMLElement;
  model: SettingsReactModel | PickerReactModel;
  ready: Promise<void>;
  resolve: () => void;
  disposed: boolean;
  mounted: boolean;
  parts: Map<string, HTMLElement>;
  dispatch: (command: SettingsReactCommand) => void;
};

export const nativeHosts: Host[] = [];
export const nativeNotices = new Map<HTMLElement, MainNoticeReactModel>();
export const nativeGuides = new Map<HTMLElement, KeyGuideReactModel>();
export let deferSettings = false;
export function setDeferredSettings(value: boolean): void {
  deferSettings = value;
}
export function resetNativeHosts(): void {
  nativeHosts.length = 0;
  nativeNotices.clear();
  nativeGuides.clear();
  deferSettings = false;
}

export function mountNativeReactView(
  options: SettingsOptions | PickerOptions | NoticeOptions | GuideOptions,
) {
  if (options.surface === 'key-guide') {
    const update = (model: KeyGuideReactModel) => nativeGuides.set(options.root, model);
    update(options.model);
    return {
      ready: Promise.resolve(),
      update,
      getElement: () => null,
      dispose: () => {
        nativeGuides.delete(options.root);
      },
    };
  }
  if (options.surface === 'main-notice') {
    let disposed = false;
    const update = (model: MainNoticeReactModel) => {
      if (disposed) return;
      nativeNotices.set(options.root, model);
      options.root.textContent = model.text;
    };
    update(options.model);
    return {
      ready: Promise.resolve(),
      update,
      getElement: () => null,
      dispose: () => {
        disposed = true;
        nativeNotices.delete(options.root);
      },
    };
  }
  // The project targets ES2022, before Promise.withResolvers is available.
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => undefined);
  const pending = options.surface === 'settings' && deferSettings;
  const parts = new Map<string, HTMLElement>();
  const host: Host = {
    root: options.root,
    model: options.model,
    ready,
    disposed: false,
    mounted: false,
    parts,
    resolve: () => {
      if (!host.disposed && options.isCurrent()) {
        host.mounted = true;
        const names =
          options.surface === 'settings' ? ['heading'] : ['query', 'results', 'preview', 'source'];
        for (const name of names) {
          const part = options.root.ownerDocument.createElementNS(
            'http://www.w3.org/1999/xhtml',
            name === 'query' ? 'input' : name === 'source' ? 'button' : 'div',
          );
          options.root.append(part);
          parts.set(name, part);
        }
        resolveReady();
      } else {
        rejectReady(new Error('Native UI view retired before mount'));
      }
    },
    dispatch: (command) => {
      if (host.mounted && !host.disposed && options.isCurrent() && options.surface === 'settings')
        (options as SettingsOptions).dispatch(command);
    },
  };
  nativeHosts.push(host);
  if (!pending) host.resolve();
  return {
    ready,
    update(model: SettingsReactModel | PickerReactModel) {
      host.model = model;
    },
    getElement(part: string) {
      return host.mounted && !host.disposed && options.isCurrent()
        ? (parts.get(part) ?? null)
        : null;
    },
    dispose() {
      host.disposed = true;
    },
  };
}
