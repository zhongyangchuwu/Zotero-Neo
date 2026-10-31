/** Minimal chooser DOM; actual focus, IME and rendering are also checked in the dedicated Zotero profile. */
export class DialogElement {
  children: DialogElement[] = [];
  parent: DialogElement | null = null;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: unknown) => void)[]>();
  value = '';
  disabled = false;
  src = '';
  text = '';
  constructor(
    readonly tagName: string,
    readonly ownerDocument: DocumentFixture,
    readonly top = false,
  ) {}
  get isConnected(): boolean {
    return this.top || !!this.parent?.isConnected;
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value: string) {
    this.replaceChildren();
    this.text = value;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
  }
  append(...nodes: DialogElement[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes: DialogElement[]) {
    for (const c of this.children) c.parent = null;
    this.children = [];
    this.text = '';
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  scrollIntoView() {}
  contains(node: DialogElement): boolean {
    return this === node || this.children.some((c) => c.contains(node));
  }
  querySelector(tag: string): DialogElement | null {
    for (const c of this.children) {
      if (c.tagName === tag) return c;
      const found = c.querySelector(tag);
      if (found) return found;
    }
    return null;
  }
  addEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  removeEventListener(name: string, listener: (event: unknown) => void) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((l) => l !== listener),
    );
  }
  emit(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener({ target: this });
  }
}
export class DocumentFixture {
  documentElement = new DialogElement('html', this, true);
  activeElement: DialogElement | null = null;
  nodes: DialogElement[] = [];
  createElementNS(_ns: string, tag: string) {
    const node = new DialogElement(tag, this);
    this.nodes.push(node);
    return node;
  }
  find(tag: string) {
    return this.nodes.find((n) => n.isConnected && n.tagName === tag)!;
  }
}
