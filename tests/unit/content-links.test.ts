// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNoteLinks, mountReaderCommentLinks } from '../../src/modules/content-links';
import { createNoteLinkLifecycle } from '../../src/modules/content-links/note-lifecycle';

let releases: (() => void)[];

beforeEach(() => {
  releases = [];
  vi.stubGlobal('Components', { utils: { cloneInto: (value: object) => value } });
});

afterEach(() => {
  for (const release of releases) release();
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
  Reflect.deleteProperty(document, 'elementFromPoint');
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

// JSDOM correctly rejects synthetic events as untrusted; it cannot generate browser gestures.
// Supply the missing trusted event fields at the registered DOM listener boundary.
function trustedGestures() {
  const listen = vi.spyOn(window, 'addEventListener');
  return (
    type: string,
    target: EventTarget,
    fields: Partial<PointerEvent & KeyboardEvent> = {},
  ) => {
    const listener = listen.mock.calls.find(([name]) => name === type)?.[1];
    if (typeof listener !== 'function') throw new Error(`Missing gesture listener: ${type}`);
    let canceled = fields.defaultPrevented ?? false;
    let stopped = false;
    listener({
      type,
      target,
      isTrusted: true,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerdown' ? 1 : 0,
      cancelable: true,
      detail: 1,
      clientX: 18,
      clientY: 25,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...fields,
      get defaultPrevented() {
        return canceled;
      },
      preventDefault() {
        canceled = true;
      },
      stopImmediatePropagation() {
        stopped = true;
      },
    } as unknown as Event);
    return { canceled, stopped };
  };
}

// One simulated line of glyph rectangles. A caret snaps to text even outside this painted line.
function layout() {
  let node: Text;
  const createRange = document.createRange.bind(document);
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange();
    return Object.assign(range, {
      getClientRects: () =>
        range.startContainer === node && range.endContainer === node
          ? [
              new DOMRect(
                10 + 8 * range.startOffset,
                20,
                8 * (range.endOffset - range.startOffset),
                12,
              ),
            ]
          : [],
    });
  });
  Object.defineProperties(document, {
    caretPositionFromPoint: {
      configurable: true,
      value: (x: number) => ({
        offsetNode: node,
        offset: Math.max(0, Math.min(node.length, Math.round((x - 10) / 8))),
      }),
    },
    elementFromPoint: { configurable: true, value: () => node.parentElement },
  });
  return (text: Text) => {
    node = text;
  };
}

function comment(text: string, readOnly = true): string {
  return `<div class="comment"><div class="expandable-editor"><div class="editor-view">
    <div class="editor ${readOnly ? 'read-only' : ''}">
      <div class="content" role="textbox" aria-readonly="${readOnly}" contenteditable="${!readOnly}">${text}</div>
      <div class="renderer">https://renderer.example/</div>
    </div></div></div></div>`;
}

describe('Reader annotation comment links', () => {
  it('only highlights and opens read-only visible text; rebuilds and removes owned ranges', async () => {
    document.body.innerHTML = `<div id="annotations">
      <div class="annotation">${comment('https://example.test/a，普通文字')}</div>
      <div class="annotation">${comment('https://editable.test/', false)}</div>
    </div>
    <div class="annotation-popup">${comment('（zotero://select/library/items/ABCDEF12）')}</div>
    <div contenteditable="true" class="annotation-popup">${comment('https://nested.test/')}</div>`;
    const [shown, editable, popup, nested] = Array.from(
      document.querySelectorAll('.content'),
    ) as HTMLElement[];
    const registry = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { highlights: registry });
    vi.stubGlobal('Highlight', Set);
    const paint = layout();
    const fire = trustedGestures();
    const open = vi.fn(() => true);
    const reader = { itemID: 1, _iframeWindow: window };
    const release = mountReaderCommentLinks(reader, open);
    releases.push(release);
    const highlight = [...registry.values()][0]!;
    expect([...highlight].map((range) => range.toString())).toEqual([
      'https://example.test/a',
      'zotero://select/library/items/ABCDEF12',
    ]);

    const before = document.body.innerHTML;
    const shownText = shown!.firstChild as Text;
    paint(shownText);
    expect(fire('pointerdown', shown!)).toEqual({ canceled: false, stopped: false });
    expect(fire('click', shown!)).toEqual({ canceled: true, stopped: true });
    expect(open).toHaveBeenLastCalledWith({ kind: 'external', href: 'https://example.test/a' });
    expect(document.body.innerHTML).toBe(before);
    expect(shown!.firstChild).toBe(shownText);

    for (const target of [editable!, nested!]) {
      paint(target.firstChild as Text);
      fire('pointerdown', target);
      expect(fire('click', target).canceled).toBe(false);
    }
    paint(shownText);
    const afterLink = { clientX: 10 + 8 * 'https://example.test/a'.length + 2 };
    fire('pointerdown', shown!, afterLink);
    expect(fire('click', shown!, afterLink).canceled).toBe(false);
    fire('pointerdown', shown!, { clientY: 19 });
    expect(fire('click', shown!, { clientY: 19 }).canceled).toBe(false);
    fire('pointerdown', shown!);
    fire('pointermove', shown!, { clientX: 70, buttons: 1 });
    expect(fire('click', shown!).canceled).toBe(false);
    document.getSelection()!.setBaseAndExtent(shownText, 1, shownText, 5);
    fire('pointerdown', shown!);
    expect(fire('click', shown!).canceled).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    document.getSelection()!.removeAllRanges();

    open.mockReturnValueOnce(false);
    fire('pointerdown', shown!);
    expect(fire('click', shown!)).toEqual({ canceled: false, stopped: false });

    popup!.closest('.annotation-popup')!.remove();
    shown!.setAttribute('contenteditable', 'true');
    document
      .getElementById('annotations')!
      .insertAdjacentHTML(
        'beforeend',
        `<div class="annotation">${comment('https://replacement.test/')}</div>`,
      );
    await Promise.resolve();
    expect([...highlight].map((range) => range.toString())).toEqual(['https://replacement.test/']);
    const replacement = document.querySelector('#annotations .annotation:last-child .content')!;
    paint(replacement.firstChild as Text);
    fire('pointerdown', replacement);
    expect(fire('click', replacement).canceled).toBe(true);
    expect(open).toHaveBeenLastCalledWith({ kind: 'external', href: 'https://replacement.test/' });

    release();
    expect(registry.size).toBe(0);
    expect(document.querySelector('[data-zv-comment-link-underlines]')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
    fire('pointerdown', replacement);
    expect(fire('click', replacement).canceled).toBe(false);
  });

  it('limits the underline to visible URL glyphs inside the scrollport', () => {
    const url = 'https://example.test/a';
    document.body.innerHTML = `<div id="annotations" style="overflow-x:hidden;overflow-y:auto">
      <div class="annotation">${comment(`${url}。`)}</div>
    </div>`;
    const content = document.querySelector('.content')!;
    const scrollport = document.getElementById('annotations')!;
    const rectangle = new DOMRect(0, 0, 105, 100);
    vi.spyOn(content, 'getClientRects').mockReturnValue([rectangle] as unknown as DOMRectList);
    vi.spyOn(scrollport, 'getBoundingClientRect').mockReturnValue(rectangle);
    Object.defineProperties(scrollport, {
      clientWidth: { value: 105 },
      clientHeight: { configurable: true, value: 100 },
    });
    const place = layout();
    place(content.firstChild as Text);
    vi.stubGlobal('CSS', { highlights: new Map() });
    vi.stubGlobal('Highlight', Set);
    const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const reader = { itemID: 1, _iframeWindow: window };
    releases.push(mountReaderCommentLinks(reader, () => true));
    const line = document.querySelector('[data-zv-comment-link-underlines] path')!;
    request.mock.calls[0]![0](0);
    expect(line.getAttribute('d')).toBe('M10 31H105');
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(scrollport, 'clientHeight', { value: 28 });
    request.mock.calls[1]![0](0);
    expect(line.getAttribute('d')).toBe('');
  });
});

describe('Note modifier links', () => {
  it.each([
    { platform: 'Linux x86_64', modifier: { ctrlKey: true }, wrong: { metaKey: true } },
    { platform: 'MacIntel', modifier: { metaKey: true }, wrong: { ctrlKey: true } },
  ])(
    'opens anchors and exact bare-text hits on $platform without touching the editor',
    ({ platform, modifier, wrong }) => {
      vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);
      document.body.innerHTML = `<div class="primary-editor ProseMirror" contenteditable="true">
      <p>Keep the existing caret <a href="https://anchor.test/path"><em>label</em></a></p>
      <p id="bare">https://bare.test/path next</p>
      <p><a id="unsafe" href="file:///tmp/private">Refuse file</a></p>
      <p><a id="fragment" href="#heading">Native heading</a></p>
      <p><span contenteditable="false"><a href="https://widget.test/">Widget</a></span></p>
    </div>`;
      const target = document.querySelector('a em')!;
      const bare = document.querySelector('#bare')!;
      const widget = document.querySelector('[contenteditable="false"] a')!;
      const text = bare.firstChild as Text;
      const paint = layout();
      paint(text);
      const selection = document.getSelection()!;
      const caret = target.closest('p')!.firstChild!;
      selection.collapse(caret, 3);
      const before = document.body.innerHTML;
      const fire = trustedGestures();
      const open = vi.fn(() => true);
      const release = mountNoteLinks(window, open);
      releases.push(release);

      for (const element of [target, bare]) {
        for (const keys of [
          {},
          wrong,
          { ...modifier, shiftKey: true },
          { ctrlKey: true, metaKey: true },
        ]) {
          expect(fire('pointerdown', element, keys).canceled).toBe(false);
          expect(fire('click', element, keys)).toEqual({ canceled: false, stopped: false });
        }
        expect(fire('pointerdown', element, { ...modifier, button: 1 }).canceled).toBe(false);
        expect(fire('pointerdown', element, { ...modifier, isTrusted: false }).canceled).toBe(
          false,
        );
        expect(fire('click', element, modifier).canceled).toBe(false);
      }
      expect(fire('pointerdown', bare, { ...modifier, clientY: 19 }).canceled).toBe(false);
      expect(fire('pointerdown', widget, modifier).canceled).toBe(false);
      const unsafe = document.querySelector('#unsafe')!;
      const fragment = document.querySelector('#fragment')!;
      expect(fire('pointerdown', unsafe, modifier).canceled).toBe(true);
      expect(fire('click', unsafe, modifier)).toEqual({ canceled: true, stopped: true });
      expect(fire('pointerdown', fragment, modifier).canceled).toBe(false);
      expect(fire('click', fragment, modifier).canceled).toBe(false);
      fire('compositionstart', bare);
      expect(fire('pointerdown', bare, modifier).canceled).toBe(false);
      fire('compositionend', bare);
      expect(open).not.toHaveBeenCalled();

      const native = vi.fn((event: Event) => event.preventDefault());
      target.addEventListener('click', native);
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier }),
      );
      expect(native).toHaveBeenCalledOnce();
      expect(open).not.toHaveBeenCalled();

      for (const element of [target, bare]) {
        expect(fire('pointerdown', element, modifier)).toEqual({ canceled: true, stopped: false });
        expect(fire('mousedown', element, modifier)).toEqual({ canceled: true, stopped: true });
        expect(fire('mouseup', element, modifier)).toEqual({ canceled: true, stopped: true });
        expect(fire('click', element, modifier)).toEqual({ canceled: true, stopped: true });
      }
      expect(open.mock.calls).toHaveLength(2);
      expect(open).toHaveBeenNthCalledWith(1, {
        kind: 'external',
        href: 'https://anchor.test/path',
      });
      expect(open).toHaveBeenNthCalledWith(2, { kind: 'external', href: 'https://bare.test/path' });
      expect(document.body.innerHTML).toBe(before);
      expect(selection.anchorNode).toBe(caret);
      expect(selection.focusNode).toBe(caret);
      expect(selection.anchorOffset).toBe(3);
      expect(selection.focusOffset).toBe(3);

      const style = document.head.querySelector('style')!;
      fire('pointermove', bare);
      expect(style.media).toBe('not all');
      fire('keydown', bare, modifier);
      expect(style.media).toBe('all');
      fire('keyup', bare);
      expect(style.media).toBe('not all');
      fire('keydown', bare, modifier);
      expect(style.media).toBe('all');
      fire('blur', window);
      expect(style.media).toBe('not all');
      fire('keydown', bare, modifier);
      expect(style.media).toBe('not all');

      const editor = bare.closest('.ProseMirror')!;
      const successor = editor.cloneNode(true) as Element;
      editor.replaceWith(successor);
      const successorLink = successor.querySelector('a em')!;
      expect(fire('pointerdown', successorLink, modifier).canceled).toBe(true);
      expect(fire('click', successorLink, modifier).canceled).toBe(true);
      expect(open).toHaveBeenCalledTimes(3);
      release();
      expect(style.isConnected).toBe(false);
    },
  );

  it('keeps both Note documents mounted and disposes only the editor removed from view', () => {
    const mainPane = document.createElement('iframe');
    const readerPane = document.createElement('iframe');
    const replacement = document.createElement('iframe');
    document.body.append(mainPane, readerPane, replacement);
    const mainEditor = mainPane.contentWindow!;
    const readerEditor = readerPane.contentWindow!;
    const replacementEditor = replacement.contentWindow!;
    const reportError = vi.fn();
    const lifecycle = createNoteLinkLifecycle(window, reportError);
    releases.push(() => lifecycle.dispose());

    lifecycle.sync([mainEditor, readerEditor]);
    const mainStyle = mainEditor.document.head.querySelector('style')!;
    const readerStyle = readerEditor.document.head.querySelector('style')!;
    expect(mainStyle.isConnected).toBe(true);
    expect(readerStyle.isConnected).toBe(true);

    lifecycle.sync([readerEditor, replacementEditor]);
    expect(mainStyle.isConnected).toBe(false);
    expect(readerEditor.document.head.querySelector('style')).toBe(readerStyle);
    const replacementStyle = replacementEditor.document.head.querySelector('style')!;
    expect(replacementStyle.isConnected).toBe(true);
    lifecycle.dispose();
    expect(readerStyle.isConnected).toBe(false);
    expect(replacementStyle.isConnected).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });
});
