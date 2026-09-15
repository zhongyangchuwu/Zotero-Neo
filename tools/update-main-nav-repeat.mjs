import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`missing anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function write(path, text) {
  fs.writeFileSync(path, text);
}

{
  const path = 'src/main/controller.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    "const NAVIGATION_REPEAT_INTERVAL_MS = 80;\n",
    '',
    'navigation repeat interval',
  );
  text = replaceOnce(
    text,
    `      if (this.acceptNavigationRepeat(decision.action, event, session)) {\n        this.execute(decision.action, window, session, decision.count);\n      }\n`,
    `      this.execute(decision.action, window, session, decision.count, event.repeat);\n`,
    'keydown navigation repeat dispatch',
  );
  text = replaceOnce(
    text,
    `  private acceptNavigationRepeat(\n    action: ActionId,\n    event: KeyboardEvent,\n    session: MainWindowSession,\n  ): boolean {\n    if (action !== 'mainNavDown' && action !== 'mainNavUp') return true;\n    const now = Date.now();\n    if (\n      event.repeat &&\n      session.navigationRepeatAction === action &&\n      now - session.navigationRepeatAt < NAVIGATION_REPEAT_INTERVAL_MS\n    ) {\n      return false;\n    }\n    session.navigationRepeatAction = action;\n    session.navigationRepeatAt = now;\n    return true;\n  }\n\n`,
    '',
    'navigation repeat throttle method',
  );
  text = replaceOnce(
    text,
    `  private execute(\n    action: ActionId,\n    window: MainWindow,\n    session: MainWindowSession,\n    count: number,\n  ): void {\n`,
    `  private execute(\n    action: ActionId,\n    window: MainWindow,\n    session: MainWindowSession,\n    count: number,\n    shouldDebounce = false,\n  ): void {\n`,
    'execute signature',
  );
  text = replaceOnce(
    text,
    `    this.executeMain(action, window, session, count);\n`,
    `    this.executeMain(action, window, session, count, shouldDebounce);\n`,
    'execute forwarding',
  );
  text = replaceOnce(
    text,
    `  private executeMain(\n    action: MainExecutableAction,\n    window: MainWindow,\n    session: MainWindowSession,\n    count: number,\n  ): void {\n`,
    `  private executeMain(\n    action: MainExecutableAction,\n    window: MainWindow,\n    session: MainWindowSession,\n    count: number,\n    shouldDebounce = false,\n  ): void {\n`,
    'executeMain signature',
  );
  text = replaceOnce(
    text,
    `      case 'mainNavDown':\n        this.#navigation.navigate(window, session, 1, count);\n        break;\n      case 'mainNavUp':\n        this.#navigation.navigate(window, session, -1, count);\n        break;\n`,
    `      case 'mainNavDown':\n        this.#navigation.navigate(window, session, 1, count, shouldDebounce);\n        break;\n      case 'mainNavUp':\n        this.#navigation.navigate(window, session, -1, count, shouldDebounce);\n        break;\n`,
    'navigation execution',
  );
  write(path, text);
}

{
  const path = 'src/main/navigation.ts';
  let text = read(path);
  text = replaceOnce(
    text,
    `type Selection = { focused?: number; count?: number; select?(index: number): void };\n`,
    `type Selection = {\n  focused?: number;\n  count?: number;\n  select?(index: number, shouldDebounce?: boolean): void;\n};\n`,
    'selection type',
  );
  text = replaceOnce(
    text,
    `  navigate(\n    window: MainWindow,\n    session: MainWindowSession,\n    direction: 1 | -1 | 'first' | 'last',\n    count: number,\n  ): void {\n`,
    `  navigate(\n    window: MainWindow,\n    session: MainWindowSession,\n    direction: 1 | -1 | 'first' | 'last',\n    count: number,\n    shouldDebounce = false,\n  ): void {\n`,
    'navigate signature',
  );
  text = replaceOnce(
    text,
    `    view.selection.select?.(next);\n    view.ensureRowIsVisible?.(next);\n`,
    `    view.selection.select?.(next, shouldDebounce);\n`,
    'native selection scroll',
  );
  write(path, text);
}

{
  const path = 'src/main/session.ts';
  let text = read(path);
  text = replaceOnce(text, `import type { ActionId } from '../input/actions';\n`, '', 'ActionId import');
  text = replaceOnce(
    text,
    `  navigationRepeatAction: Extract<ActionId, 'mainNavDown' | 'mainNavUp'> | null = null;\n  navigationRepeatAt = 0;\n`,
    '',
    'repeat session state',
  );
  write(path, text);
}

{
  const path = 'tests/unit/main-window.test.ts';
  let text = read(path);
  const anchor = `    expect(selected).toBe(3);\n    expect(session.activePanel).toBe('collections');\n  });\n});\n`;
  const replacement = `    expect(selected).toBe(3);\n    expect(session.activePanel).toBe('collections');\n  });\n\n  it('uses Zotero repeat debouncing and native selection scrolling for held j/k', () => {\n    const active = { id: 'collection-tree-row-2' } as Element;\n    const select = vi.fn();\n    const ensureRowIsVisible = vi.fn();\n    const view: TreeView = {\n      tree: { focus: () => {} },\n      domEl: { contains: (node: unknown) => node === active } as HTMLElement,\n      rowCount: 6,\n      selection: { count: 1, focused: 2, select },\n      ensureRowIsVisible,\n    };\n    const window = {\n      document: {\n        activeElement: active,\n        getElementById: () => null,\n        querySelector: () => null,\n      },\n      ZoteroPane: { collectionsView: view },\n    } as unknown as MainWindow;\n    const session = { activePanel: 'items' } as MainWindowSession;\n    const navigation = new MainNavigation(logger, () => {});\n\n    navigation.navigate(window, session, 1, 1, true);\n\n    expect(select).toHaveBeenCalledWith(3, true);\n    expect(ensureRowIsVisible).not.toHaveBeenCalled();\n    expect(session.activePanel).toBe('collections');\n  });\n});\n`;
  text = replaceOnce(text, anchor, replacement, 'main navigation repeat test');
  text = replaceOnce(
    text,
    `describe('collection navigation repeat pacing', () => {\n  it('moves one row at a time while dropping only over-frequent auto-repeat events', () => {\n`,
    `describe('collection navigation repeat pacing', () => {\n  it('keeps every repeat movement while debouncing Zotero selection work', () => {\n`,
    'legacy repeat test title',
  );
  text = replaceOnce(
    text,
    `    const selectedRows: number[] = [];\n`,
    `    const selections: Array<{ index: number; shouldDebounce: boolean | undefined }> = [];\n`,
    'legacy repeat selection log',
  );
  text = replaceOnce(
    text,
    `      select(index: number) {\n        this.focused = index;\n        selectedRows.push(index);\n      },\n`,
    `      select(index: number, shouldDebounce?: boolean) {\n        this.focused = index;\n        selections.push({ index, shouldDebounce });\n      },\n`,
    'legacy repeat selection callback',
  );
  text = replaceOnce(
    text,
    `    const now = vi.spyOn(Date, 'now');\n    const press = (timestamp: number, repeat: boolean): void => {\n      now.mockReturnValue(timestamp);\n      keydown?.({\n`,
    `    const press = (repeat: boolean): void => {\n      keydown?.({\n`,
    'legacy repeat press helper',
  );
  text = replaceOnce(
    text,
    `    press(0, false);\n    press(10, true);\n    press(30, true);\n    press(85, true);\n    press(100, true);\n    press(170, true);\n`,
    `    press(false);\n    press(true);\n    press(true);\n    press(true);\n    press(true);\n    press(true);\n`,
    'legacy repeat events',
  );
  text = replaceOnce(
    text,
    `    expect(selectedRows).toEqual([1, 2, 3]);\n`,
    `    expect(selections).toEqual([\n      { index: 1, shouldDebounce: false },\n      { index: 2, shouldDebounce: true },\n      { index: 3, shouldDebounce: true },\n      { index: 4, shouldDebounce: true },\n      { index: 5, shouldDebounce: true },\n      { index: 6, shouldDebounce: true },\n    ]);\n`,
    'legacy repeat expectation',
  );
  write(path, text);
}
