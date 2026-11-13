import { CleanupFailure } from '../../core/cleanup';
import { asElement } from '../../platform/dom';
import { isDeadObject } from '../../platform/cross-compartment';
import type { ReaderRuntime } from './contracts';
import { createAIQAWindowHost, type AIQAWindowHost } from '../../platform/ai-qa-ui';
import { readerByTabID, readerOwnerWindow } from './host';

const H = 'http://www.w3.org/1999/xhtml';
const RESOURCE = 'zotero-neo-ai-qa.ftl';

interface NativeDetails extends Element {
  readonly tabID?: string;
  scrollToPane?(paneID: string, behavior?: string): void;
}
interface NativeSection extends Element {
  open: boolean;
}
interface PanelWindow extends Window {
  readonly Zotero_Tabs?: { select(id: string): void };
  readonly ZoteroContextPane?: { collapsed: boolean; update(): void };
}

export interface AIQAPanelLease {
  readonly root: HTMLElement;
  readonly window: Window;
  readonly reader: ReaderRuntime;
  /** Owned tool windows need their own short-lived UI resources, unlike native shared chrome. */
  readonly ownsWindow: boolean;
  isCurrent(): boolean;
}

interface Mount {
  readonly lease: AIQAPanelLease;
  readonly details: NativeDetails;
  readonly section: NativeSection;
  readonly tabID: string;
  readonly release: () => void;
}

interface ToolWindowMount {
  readonly window: Window;
  lease: AIQAPanelLease | null;
  isCurrent(): boolean;
  release(): void;
}

export interface AIQAPanelCallbacks {
  readonly entryLabel: (window: Window) => string;
  readonly mount: (lease: AIQAPanelLease) => () => void;
  readonly activate: (lease: AIQAPanelLease) => void;
  readonly changed: (lease: AIQAPanelLease) => void;
  readonly failed: (reader: ReaderRuntime, error: unknown) => void;
}

/** Native tab sections and standalone tool windows share exact Reader leases, never an active-tab fallback. */
export class AIQAPanelHost {
  readonly #mounts = new Map<HTMLElement, Mount>();
  readonly #toolWindows = new Map<ReaderRuntime, ToolWindowMount>();
  readonly #toolWindowHost: AIQAWindowHost;
  readonly #documents = new Set<Document>();
  readonly #callbacks: AIQAPanelCallbacks;
  readonly #paneID: string;
  #disposed = false;

  constructor(pluginID: string, rootURI: string, callbacks: AIQAPanelCallbacks) {
    this.#toolWindowHost = createAIQAWindowHost(rootURI);
    this.#callbacks = callbacks;
    const addResource = (doc: Document): void => {
      if (this.#documents.has(doc)) return;
      const localization = doc.l10n;
      if (!localization) throw new Error('Native AI Q&A localization unavailable');
      localization.addResourceIds([RESOURCE]);
      this.#documents.add(doc);
    };
    const sync = (body: HTMLDivElement, doc: Document, tabType?: string): void => {
      addResource(doc);
      if (tabType !== 'reader' || !body.isConnected) return;
      const details = body.closest('item-details') as NativeDetails | null;
      const section = body.closest('item-pane-custom-section') as NativeSection | null;
      const tabID = details?.tabID;
      const owner = doc.defaultView;
      const reader = tabID && readerByTabID(tabID);
      if (!details || !section || !tabID || !owner || !reader) return;
      const previous = this.#mounts.get(body);
      if (previous?.lease.reader === reader && previous.lease.isCurrent()) {
        callbacks.changed(previous.lease);
        return;
      }
      if (previous) this.#release(body);
      let retired = false;
      const lease: AIQAPanelLease = {
        root: body,
        window: owner,
        reader,
        ownsWindow: false,
        isCurrent: () =>
          !this.#disposed &&
          !retired &&
          !isDeadObject(owner) &&
          !owner.closed &&
          body.isConnected &&
          section.isConnected &&
          details.isConnected &&
          body.ownerDocument === doc &&
          body.closest('item-details') === details &&
          details.tabID === tabID &&
          readerByTabID(tabID) === reader,
      };
      body.dataset.zoteroNeoAiRoot = 'true';
      const entry = doc.createElementNS(H, 'button');
      entry.textContent = callbacks.entryLabel(owner);
      entry.addEventListener('click', () => {
        if (lease.isCurrent()) callbacks.activate(lease);
      });
      body.replaceChildren(entry);
      let dispose: () => void;
      try {
        dispose = callbacks.mount(lease);
      } catch (error) {
        retired = true;
        body.replaceChildren();
        delete body.dataset.zoteroNeoAiRoot;
        throw error;
      }
      this.#mounts.set(body, {
        lease,
        details,
        section,
        tabID,
        release: () => {
          retired = true;
          dispose();
        },
      });
    };
    const paneID = Zotero.ItemPaneManager.registerSection({
      paneID: 'ai-qa',
      pluginID,
      header: { l10nID: 'zotero-neo-ai-qa-section', icon: `${rootURI}icons/icon-32x32.png` },
      sidenav: { l10nID: 'zotero-neo-ai-qa-sidenav', icon: `${rootURI}icons/icon-32x32.png` },
      onInit: ({ doc }) => addResource(doc),
      onItemChange: (props) => {
        props.setEnabled(props.tabType === 'reader');
        sync(props.body, props.doc, props.tabType);
      },
      onRender: (props) => sync(props.body, props.doc, props.tabType),
      onDestroy: ({ body }) => this.#release(body),
    });
    if (!paneID) throw new Error('AI Q&A section registration failed');
    this.#paneID = paneID;
  }

  /** Opens only the section belonging to this exact Reader handle; never redirects to the active tab. */
  open(reader: ReaderRuntime): boolean {
    const mount = [...this.#mounts.values()].find(
      (m) => m.lease.reader === reader && m.lease.isCurrent(),
    );
    if (!mount) return this.#openToolWindow(reader);
    const owner = mount.lease.window as PanelWindow;
    owner.Zotero_Tabs?.select(mount.tabID);
    if (owner.ZoteroContextPane) {
      owner.ZoteroContextPane.collapsed = false;
      owner.ZoteroContextPane.update();
    }
    mount.section.open = true;
    mount.details.scrollToPane?.(this.#paneID, 'instant');
    this.#callbacks.activate(mount.lease);
    return true;
  }

  close(reader: ReaderRuntime): void {
    const tool = this.#toolWindows.get(reader);
    if (tool) {
      tool.release();
      return;
    }
    const mount = [...this.#mounts.values()].find(
      (m) => m.lease.reader === reader && m.lease.isCurrent(),
    );
    if (mount) mount.section.open = false;
  }

  /** Retire UI owned by this Reader without cancelling its app-owned, already accepted task. */
  releaseReader(reader: ReaderRuntime): void {
    const failure = new CleanupFailure();
    const tool = this.#toolWindows.get(reader);
    if (tool) failure.run(() => tool.release());
    for (const [body, mount] of this.#mounts)
      if (mount.lease.reader === reader) failure.run(() => this.#release(body));
    failure.rethrow();
  }

  #openToolWindow(reader: ReaderRuntime): boolean {
    if (this.#disposed) return false;
    const parent = readerOwnerWindow(reader);
    if (
      !parent ||
      isDeadObject(parent) ||
      parent.closed ||
      parent.location.href !== 'chrome://zotero/content/reader.xhtml'
    )
      return false;
    const previous = this.#toolWindows.get(reader);
    if (previous?.isCurrent()) {
      previous.window.focus();
      return true;
    }
    previous?.release();
    let window: Window;
    try {
      window = this.#toolWindowHost.open(parent);
    } catch (error) {
      this.#callbacks.failed(reader, error);
      return false;
    }
    let retired = false;
    let releaseMount: (() => void) | null = null;
    let releaseClosed: (() => void) | null = null;
    const retire = (closeWindow: boolean): void => {
      if (retired) return;
      retired = true;
      if (this.#toolWindows.get(reader) === tool) this.#toolWindows.delete(reader);
      const failure = new CleanupFailure();
      if (!isDeadObject(window)) {
        failure.run(() => window.removeEventListener('load', onLoad));
        failure.run(() => window.removeEventListener('unload', onUnload));
      }
      if (!isDeadObject(parent))
        failure.run(() => parent.removeEventListener('unload', onParentUnload));
      failure.run(() => releaseClosed?.());
      releaseClosed = null;
      failure.run(() => releaseMount?.());
      releaseMount = null;
      if (closeWindow && !isDeadObject(window) && !window.closed) failure.run(() => window.close());
      failure.rethrow();
    };
    // Initial about:blank unloads before the chrome document arrives; it is not a tool-window close.
    const onUnload = (event: Event): void => {
      if (tool.lease && event.target === tool.lease.root.ownerDocument) retire(false);
    };
    const onParentUnload = (): void => retire(true);
    const tool: ToolWindowMount = {
      window,
      lease: null,
      isCurrent: () =>
        !this.#disposed &&
        !retired &&
        this.#toolWindows.get(reader) === tool &&
        !isDeadObject(parent) &&
        !parent.closed &&
        !isDeadObject(window) &&
        !window.closed &&
        readerOwnerWindow(reader) === parent,
      release: () => retire(true),
    };
    const onLoad = (event?: Event): void => {
      if (!tool.isCurrent() || tool.lease) return;
      const doc = window.document;
      if ((event && event.target !== doc) || doc.documentURI !== this.#toolWindowHost.uri) return;
      window.removeEventListener('load', onLoad);
      try {
        const root = doc.getElementById('zotero-neo-ai-qa-root') as HTMLElement | null;
        if (!root) throw new Error('AI Q&A tool window root unavailable');
        const lease: AIQAPanelLease = {
          root,
          window,
          reader,
          ownsWindow: true,
          isCurrent: () =>
            tool.isCurrent() &&
            tool.lease === lease &&
            root.isConnected &&
            root.ownerDocument === doc &&
            window.document === doc,
        };
        tool.lease = lease;
        root.dataset.zoteroNeoAiRoot = 'true';
        doc.title = this.#callbacks.entryLabel(window);
        releaseMount = this.#callbacks.mount(lease);
        this.#callbacks.activate(lease);
        window.focus();
      } catch (error) {
        try {
          retire(true);
        } finally {
          this.#callbacks.failed(reader, error);
        }
      }
    };
    this.#toolWindows.set(reader, tool);
    try {
      releaseClosed = this.#toolWindowHost.observeClosed(window, () => retire(false));
      window.addEventListener('load', onLoad);
      window.addEventListener('unload', onUnload);
      parent.addEventListener('unload', onParentUnload);
      if (window.document.readyState === 'complete') onLoad();
    } catch (error) {
      try {
        retire(true);
      } finally {
        this.#callbacks.failed(reader, error);
      }
    }
    return !retired;
  }

  ownsTarget(target: EventTarget | null): boolean {
    const element = asElement(target);
    if (!element) return false;
    for (const { lease } of this.#mounts.values()) {
      if (lease.isCurrent() && lease.root.contains(element)) return true;
    }
    for (const { lease } of this.#toolWindows.values()) {
      if (lease?.isCurrent() && lease.root.contains(element)) return true;
    }
    return false;
  }

  #release(body: HTMLElement): void {
    const mount = this.#mounts.get(body);
    if (!mount) return;
    this.#mounts.delete(body);
    try {
      mount.release();
    } finally {
      if (!isDeadObject(body)) {
        delete body.dataset.zoteroNeoAiRoot;
        body.replaceChildren();
      }
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const failure = new CleanupFailure();
    for (const tool of [...this.#toolWindows.values()]) failure.run(() => tool.release());
    for (const body of [...this.#mounts.keys()]) failure.run(() => this.#release(body));
    failure.run(() => {
      Zotero.ItemPaneManager.unregisterSection(this.#paneID);
    });
    for (const doc of this.#documents) {
      if (!isDeadObject(doc))
        failure.run(() => {
          doc.l10n?.removeResourceIds([RESOURCE]);
        });
    }
    this.#documents.clear();
    failure.run(() => this.#toolWindowHost.dispose());
    failure.rethrow();
  }
}
