import type { ReaderEventRuntime } from '../../reader/types';
import type { ReaderRuntime } from './contracts';
import type { NativeReaderRuntime } from './private-types';
import { readerWindow } from './host';
import { TRANSLATION_CONTROL_ATTRIBUTE } from './translation-popup';
import { asElement } from '../../platform/dom';

type Role = 'all' | 'human' | 'translation';

/** Reversible sidebar-only projection, including rows rendered before this module starts. */
export class ReaderTranslationSidebar {
  readonly #reader: ReaderRuntime;
  readonly #roleTag: string;
  readonly #text: (key: string) => string;
  readonly #rows = new Set<HTMLElement>();
  readonly #nodes = new Set<Element>();
  #document: Document | null = null;
  #observer: MutationObserver | null = null;
  #root: HTMLElement | null = null;
  #role: Role = 'all';

  constructor(reader: ReaderRuntime, roleTag: string, text: (key: string) => string) {
    this.#reader = reader;
    this.#roleTag = roleTag;
    this.#text = text;
    const document = readerWindow(reader)?.document;
    if (document) this.attach(document);
  }

  show(event: ReaderEventRuntime, translation: boolean): void {
    const doc = event.doc;
    if (
      !doc ||
      !event.append ||
      !event.params?.annotation ||
      readerWindow(this.#reader)?.document !== doc
    )
      return;
    if (this.#document !== doc) this.attach(doc);
    const badge = doc.createElement('span');
    badge.setAttribute('data-zv-translation-badge', '');
    event.append(badge);
    const row = badge.closest<HTMLElement>('.annotation');
    if (!row) {
      badge.remove();
      return;
    }
    this.decorate(row, translation, badge);
    this.synchronize();
    this.apply();
  }

  private attach(doc: Document): void {
    this.#observer?.disconnect();
    this.releaseProjection();
    this.#document = doc;
    const Observer = (
      doc.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null
    )?.MutationObserver;
    if (Observer) {
      this.#observer = new Observer((records) => {
        if (this.#document === doc) this.synchronize(records);
      });
      this.#observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
    this.synchronize();
  }

  private synchronize(records?: readonly MutationRecord[]): void {
    const doc = this.#document;
    if (!doc) return;
    const root = doc.getElementById('annotationsView');
    const rows = new Set<HTMLElement>();
    if (root !== this.#root) {
      this.releaseProjection();
      this.#root = root;
      if (!root) return;
      this.mount(root);
      for (const node of root.querySelectorAll('.annotation')) {
        const row = asElement(node);
        if (row) rows.add(row as HTMLElement);
      }
    } else if (root && records) {
      for (const record of records) {
        const target = asElement(record.target);
        if (target?.closest('[data-zv-translation-badge],[data-zv-translation-filter]')) continue;
        const owner = target?.closest<HTMLElement>('.annotation');
        if (owner) {
          const role = owner.getAttribute('data-zv-translation-role');
          if (
            !role ||
            (role === 'translation' && !owner.querySelector('[data-zv-translation-badge]'))
          )
            rows.add(owner);
        }
        for (const node of record.addedNodes) {
          const element = asElement(node);
          if (!element) continue;
          if (element.matches('.annotation')) rows.add(element as HTMLElement);
          for (const child of element.querySelectorAll('.annotation')) {
            const row = asElement(child);
            if (row) rows.add(row as HTMLElement);
          }
        }
      }
    }
    if (!rows.size) return;
    const annotations =
      (this.#reader as NativeReaderRuntime)._internalReader?._state?.annotations ?? [];
    const roles = new Map<string, boolean>();
    for (const annotation of annotations) {
      if (annotation.id)
        roles.set(
          annotation.id,
          annotation.tags?.some((tag) => tag.name === this.#roleTag) ?? false,
        );
    }
    for (const row of rows) {
      const key = row.getAttribute('data-sidebar-annotation-id');
      if (key && roles.has(key)) this.decorate(row, roles.get(key)!);
    }
    this.apply();
  }

  private decorate(row: HTMLElement, translation: boolean, supplied?: HTMLElement): void {
    row.setAttribute('data-zv-translation-role', translation ? 'translation' : 'human');
    this.#rows.add(row);
    let badge = supplied ?? row.querySelector<HTMLElement>('[data-zv-translation-badge]');
    if (translation && !badge) {
      badge = row.ownerDocument.createElement('span');
      badge.setAttribute('data-zv-translation-badge', '');
      (row.querySelector('header .end') ?? row.querySelector('header') ?? row).appendChild(badge);
    }
    for (const node of row.querySelectorAll('[data-zv-translation-badge]')) {
      const old = asElement(node);
      if (old && (!translation || old !== badge)) {
        old.remove();
        this.#nodes.delete(old);
      }
    }
    if (translation && badge) {
      const label = this.#text('badge');
      if (badge.textContent !== label) badge.textContent = label;
      badge.style.cssText =
        'font-size:11px;margin-inline:4px;padding:0 3px;border:1px solid currentColor;border-radius:3px;opacity:.8';
      this.#nodes.add(badge);
    }
  }

  private mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const bar = doc.createElement('div');
    bar.setAttribute('data-zv-translation-filter', '');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', this.#text('filterGroup'));
    bar.title = this.#text('filterGroup');
    bar.style.cssText = 'display:flex;gap:4px;padding:4px;flex-wrap:wrap';
    for (const [role, key] of [
      ['all', 'filterAll'],
      ['human', 'filterHuman'],
      ['translation', 'filterTranslation'],
    ] as const) {
      const button = doc.createElement('button');
      button.textContent = this.#text(key);
      button.setAttribute(TRANSLATION_CONTROL_ATTRIBUTE, '');
      button.setAttribute('data-zv-role', role);
      button.addEventListener('click', () => {
        this.#role = role;
        this.apply();
      });
      bar.appendChild(button);
    }
    const style = doc.createElement('style');
    style.textContent =
      '[data-zv-translation-role][data-zv-role-hidden] { display:none!important; }';
    bar.appendChild(style);
    root.prepend(bar);
    this.#nodes.add(bar);
  }

  private apply(): void {
    for (const row of this.#rows) {
      if (!row.isConnected) {
        this.#rows.delete(row);
        continue;
      }
      row.toggleAttribute(
        'data-zv-role-hidden',
        this.#role !== 'all' && row.getAttribute('data-zv-translation-role') !== this.#role,
      );
    }
    for (const node of this.#root?.querySelectorAll('[data-zv-role]') ?? []) {
      const button = asElement(node);
      if (button)
        button.setAttribute(
          'aria-pressed',
          String(button.getAttribute('data-zv-role') === this.#role),
        );
    }
    for (const node of this.#nodes) if (!node.isConnected) this.#nodes.delete(node);
  }

  private releaseProjection(): void {
    for (const row of this.#rows) {
      try {
        row.removeAttribute('data-zv-translation-role');
        row.removeAttribute('data-zv-role-hidden');
      } catch {
        /* Retired native document. */
      }
    }
    this.#rows.clear();
    for (const node of this.#nodes) {
      try {
        node.remove();
      } catch {
        /* Retired native document. */
      }
    }
    this.#nodes.clear();
    this.#root = null;
  }

  dispose(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.releaseProjection();
    this.#document = null;
  }
}
