/** Small source-mapped DOM fixture; real Gecko behavior is verified separately in the dedicated profile. */
export function textAdmissionFixture(reading = false) {
  const attributes = new Map<string, string>();
  const page = {
    dataset: { pageNumber: '1' },
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 800 }),
  };
  const nodes: Text[] = [];
  const elements: HTMLElement[] = [];
  const boxes = [
    { left: 10, top: 10, right: 50, bottom: 20, width: 40, height: 10 },
    { left: 100, top: 20, right: 150, bottom: 30, width: 50, height: 10 },
    { left: 10, top: 30, right: 50, bottom: 40, width: 40, height: 10 },
  ];
  const root = { nodeType: 1 };
  const document = {
    documentElement: {
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    },
    getElementById: () => (reading ? { id: 'sdt-content' } : null),
    querySelectorAll: (selector: string) => (selector.startsWith('.page') ? [page] : elements),
    createTreeWalker: () => {
      let index = -1;
      return {
        nextNode: () => nodes[++index] ?? null,
        get currentNode() {
          return nodes[index] ?? root;
        },
        set currentNode(node: Node) {
          index = nodes.indexOf(node as Text);
        },
      };
    },
    createRange: () => range(),
  } as unknown as Document;
  for (const [index, value] of ['alpha', 'CHART', 'omega'].entries()) {
    const attrs = new Map<string, string>();
    const element = {
      isConnected: true,
      dataset: { refPath: String(index) },
      closest: (selector: string) =>
        selector.includes('.page') ? page : selector.includes('data-ref-path') ? element : null,
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name),
      getBoundingClientRect: () => boxes[index],
      firstChild: null as unknown as Text,
    } as unknown as HTMLElement;
    const node = {
      nodeType: 3,
      data: value,
      length: value.length,
      isConnected: true,
      parentElement: element,
      ownerDocument: document,
    } as unknown as Text;
    Reflect.set(element, 'firstChild', node);
    elements.push(element);
    nodes.push(node);
  }
  function point(node: Node, offset: number): number {
    const index = nodes.indexOf(node as Text);
    return (
      nodes.slice(0, index < 0 ? offset : index).reduce((sum, text) => sum + text.length, 0) +
      (index < 0 ? 0 : offset)
    );
  }
  function range(start = nodes[0]!, startOffset = 0, end = start, endOffset = start.length): Range {
    const value = {
      startContainer: start as Node,
      startOffset,
      endContainer: end as Node,
      endOffset,
      get commonAncestorContainer() {
        return value.startContainer === value.endContainer ? value.startContainer : root;
      },
      setStart: (node: Node, offset: number) => {
        value.startContainer = node;
        value.startOffset = offset;
      },
      setEnd: (node: Node, offset: number) => {
        value.endContainer = node;
        value.endOffset = offset;
      },
      collapse: (toStart: boolean) => {
        if (toStart) {
          value.endContainer = value.startContainer;
          value.endOffset = value.startOffset;
        } else {
          value.startContainer = value.endContainer;
          value.startOffset = value.endOffset;
        }
      },
      selectNodeContents: (node: Node) => {
        value.startContainer = value.endContainer = node;
        value.startOffset = 0;
        value.endOffset = (node as Text).length;
      },
      intersectsNode: (node: Node) =>
        point(node, (node as Text).length) > point(value.startContainer, value.startOffset) &&
        point(node, 0) < point(value.endContainer, value.endOffset),
      comparePoint: (node: Node, offset: number) => {
        const position = point(node, offset);
        return position < point(value.startContainer, value.startOffset)
          ? -1
          : position > point(value.endContainer, value.endOffset)
            ? 1
            : 0;
      },
      getBoundingClientRect: () => boxes[nodes.indexOf(value.startContainer as Text)],
      getClientRects: () =>
        nodes
          .slice(
            nodes.indexOf(value.startContainer as Text),
            nodes.indexOf(value.endContainer as Text) + 1,
          )
          .map((node) => boxes[nodes.indexOf(node)]),
      toString: () =>
        nodes
          .slice(
            nodes.indexOf(value.startContainer as Text),
            nodes.indexOf(value.endContainer as Text) + 1,
          )
          .map((node) =>
            node.data.slice(
              node === value.startContainer ? value.startOffset : 0,
              node === value.endContainer ? value.endOffset : node.length,
            ),
          )
          .join(''),
    };
    return value as unknown as Range;
  }
  const selected = range(nodes[0], 0, nodes[2], 5);
  const selection = {
    anchorNode: nodes[0],
    anchorOffset: 0,
    focusNode: nodes[2],
    focusOffset: 5,
    rangeCount: 1,
    getRangeAt: () => selected,
    toString: () =>
      attributes.has('data-zv-select-active')
        ? nodes
            .filter((node) => !node.parentElement!.getAttribute('data-zv-text-excluded'))
            .map((node) => node.data)
            .join(' ')
        : selected.toString(),
  } as unknown as Selection;
  const window = {
    document,
    getSelection: () => selection,
    PDFViewerApplication: {
      pdfViewer: {
        _pages: [
          { viewport: { height: 800, convertToPdfPoint: (x: number, y: number) => [x, 800 - y] } },
        ],
      },
    },
  } as unknown as Window;
  return { window, document, nodes, elements, selection, range };
}
