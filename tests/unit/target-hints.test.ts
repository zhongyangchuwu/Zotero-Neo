import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderTargetHints } from '../../src/reader/target-hints';
import type { PdfWindow } from '../../src/reader/types';

const originalComponents = Reflect.get(globalThis, 'Components');
beforeEach(() => Reflect.set(globalThis, 'Components', { utils: { isDeadWrapper: () => false } }));
afterEach(() => {
  if (originalComponents === undefined) Reflect.deleteProperty(globalThis, 'Components');
  else Reflect.set(globalThis, 'Components', originalComponents);
});

function host() {
  const nodes: HTMLElement[] = [];
  const document = {
    documentElement: { clientWidth: 800, clientHeight: 600 },
    body: { appendChild: (node: HTMLElement) => nodes.push(node) },
    createElement: () => {
      const node = {
        dataset: {} as Record<string, string>,
        hidden: false,
        textContent: '',
        style: { cssText: '', left: '', top: '' },
        getBoundingClientRect: (): DOMRect => {
          const width = node.textContent.length * 7 + 8;
          const left = Number.parseFloat(node.style.left) || 0;
          const top = Number.parseFloat(node.style.top) || 0;
          return { left, top, right: left + width, bottom: top + 16, width, height: 16 } as DOMRect;
        },
        remove: () => {
          const index = nodes.indexOf(node as unknown as HTMLElement);
          if (index >= 0) nodes.splice(index, 1);
        },
      };
      return node;
    },
  };
  const window = {
    document,
    innerWidth: 800,
    innerHeight: 600,
    focus: vi.fn(),
    requestAnimationFrame: vi.fn(),
    cancelAnimationFrame: vi.fn(),
  } as unknown as PdfWindow;
  const choose = vi.fn();
  const hints = new ReaderTargetHints<string>({
    attribute: 'zoteroNeoCopyHint',
    isCurrent: () => true,
    choose,
  });
  const press = (key: string) =>
    hints.handleKey(
      {
        key,
        target: null,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      } as unknown as KeyboardEvent,
      window,
    );
  return { nodes, window, hints, choose, press };
}

describe('grouped Reader target hints', () => {
  it('keeps excerpt/comment labels adjacent while avoiding an overlapping identifier and choosing only the requested role', () => {
    const created = host();
    const rect = [100, 100, 300, 120];
    created.hints.open(created.window, [
      {
        value: 'Full excerpt containing 10.1000/Alpha',
        caption: 'Excerpt',
        group: 'annotation',
        rect,
        currentRect: () => rect,
      },
      {
        value: 'Comment body',
        caption: 'Comment',
        group: 'annotation',
        rect,
        currentRect: () => rect,
      },
      { value: '10.1000/Alpha', caption: 'DOI', rect, currentRect: () => rect },
    ]);
    const [excerpt, comment, doi] = created.nodes;
    const first = excerpt!.getBoundingClientRect(),
      second = comment!.getBoundingClientRect(),
      third = doi!.getBoundingClientRect();
    expect(second.top).toBe(first.top);
    expect(second.left).toBeGreaterThanOrEqual(first.right);
    expect(third.bottom <= first.top || third.top >= first.bottom).toBe(true);
    created.press(comment!.textContent!.split(' ')[0]!);
    expect(created.choose).toHaveBeenCalledExactlyOnceWith(created.window, 'Comment body');
    expect(created.nodes).toEqual([]);
  });

  it('refuses an annotation role whose shared source becomes stale before confirmation', () => {
    const created = host();
    const rect = [100, 100, 300, 120];
    let current = true;
    const currentRect = () => (current ? rect : null);
    created.hints.open(created.window, [
      { value: 'Old excerpt', caption: 'Excerpt', group: 'annotation', rect, currentRect },
      { value: 'Old comment', caption: 'Comment', group: 'annotation', rect, currentRect },
    ]);
    const label = created.nodes[1]!.textContent!.split(' ')[0]!;
    current = false;
    created.press(label);
    expect(created.choose).not.toHaveBeenCalled();
    created.press('Escape');
    expect(created.nodes).toEqual([]);
  });

  it('keeps every role visible without overlap when a short pane exhausts one label column', () => {
    const created = host();
    Reflect.set(created.window, 'innerHeight', 100);
    const targets = Array.from({ length: 6 }, (_, index) => {
      const top = 10 + index * 14;
      const rect = [100, top, 260, top + 10];
      return ['Excerpt', 'Comment'].map((caption) => ({
        value: `${index}:${caption}`,
        caption,
        group: `annotation-${index}`,
        rect,
        currentRect: () => rect,
      }));
    }).flat();
    created.hints.open(created.window, targets);
    const boxes = created.nodes.map((node) => node.getBoundingClientRect());
    expect(boxes).toHaveLength(targets.length);
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index]!;
      expect(box.left >= 0 && box.top >= 0 && box.right <= 800 && box.bottom <= 100).toBe(true);
      for (const other of boxes.slice(index + 1)) {
        expect(
          box.right <= other.left ||
            box.left >= other.right ||
            box.bottom <= other.top ||
            box.top >= other.bottom,
        ).toBe(true);
      }
    }
    created.hints.cancel();
  });
});
