import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 anchor, found ${count}`);
  return source.replace(before, after);
}

function replaceSection(source, start, end, replacement, label) {
  const startCount = source.split(start).length - 1;
  const endCount = source.split(end).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error(`${label}: expected unique boundaries, found start=${startCount} end=${endCount}`);
  }
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0 || endIndex <= startIndex) throw new Error(`${label}: invalid boundary order`);
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

const controllerPath = 'src/reader/controller.ts';
let controller = readFileSync(controllerPath, 'utf8');

controller = replaceOnce(
  controller,
  "import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';\nimport { verticalTextPosition } from './text-motion';",
  "import { ReaderCommentEditor, type AnnotationCommentTarget } from './comment-editor';\nimport { ReaderSmoothScroller, smoothScrollSpec } from './smooth-scroll';\nimport { verticalTextPosition } from './text-motion';",
  'smooth scroller import',
);

controller = replaceOnce(
  controller,
  `type SmoothScrollAction = Extract<
  ActionId,
  'scrollDown' | 'scrollUp' | 'scrollLeft' | 'scrollRight'
>;

const SMOOTH_SCROLL_SPECS: Readonly<
  Record<SmoothScrollAction, Readonly<{ axis: 'x' | 'y'; direction: -1 | 1 }>>
> = {
  scrollDown: { axis: 'y', direction: 1 },
  scrollUp: { axis: 'y', direction: -1 },
  scrollLeft: { axis: 'x', direction: -1 },
  scrollRight: { axis: 'x', direction: 1 },
};
`,
  '',
  'legacy smooth action specs',
);

controller = replaceOnce(
  controller,
  "  readonly #linkHints: ReaderLinkHints;\n  readonly #commentEditor: ReaderCommentEditor;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  "  readonly #linkHints: ReaderLinkHints;\n  readonly #commentEditor: ReaderCommentEditor;\n  readonly #smoothScroller: ReaderSmoothScroller;\n  readonly #themeManagers = new Map<Window, ThemeManager>();",
  'smooth scroller field',
);

controller = replaceOnce(
  controller,
  `      smoothHold: {
        active: false,
        releasing: false,
        key: null,
        axis: null,
        direction: 0,
        speed: 0,
        rafId: null,
        lastTimestamp: 0,
      },
`,
  '',
  'legacy smooth state initialization',
);

controller = replaceOnce(
  controller,
  `    this.#linkHints = new ReaderLinkHints({
`,
  `    this.#smoothScroller = new ReaderSmoothScroller({
      preferences: dependencies.controller.dependencies.preferences,
      scrollBy: (pdfWindow, x, y) => this.scrollContainer(pdfWindow).scrollBy(x, y),
    });
    this.#linkHints = new ReaderLinkHints({
`,
  'smooth scroller construction',
);

controller = replaceOnce(
  controller,
  `  dispose(): void {
    this.#commentEditor.dispose();
    this.stopSmoothHold(true);
`,
  `  dispose(): void {
    this.#commentEditor.dispose();
    this.#smoothScroller.dispose();
`,
  'smooth scroller disposal',
);

controller = replaceOnce(
  controller,
  "      const blur = (() => this.stopSmoothHold(true)) as EventListener;",
  "      const blur = (() => this.#smoothScroller.stop(true)) as EventListener;",
  'blur smooth cleanup',
);

controller = replaceOnce(
  controller,
  "        if (keyEvent) this.handleKeyUp(keyEvent, pdfWindow);",
  "        if (keyEvent) this.handleKeyUp(keyEvent);",
  'keyup listener signature',
);

controller = replaceOnce(
  controller,
  `  private releaseViewTheme(pdfWindow: PdfWindow): void {
    if (this.#outline.ownsView(pdfWindow))
`,
  `  private releaseViewTheme(pdfWindow: PdfWindow): void {
    this.#smoothScroller.releaseView(pdfWindow);
    if (this.#outline.ownsView(pdfWindow))
`,
  'view-owned smooth cleanup',
);

controller = replaceSection(
  controller,
  '  private handleKeyUp(event: KeyboardEvent, pdfWindow: PdfWindow): void {',
  '  private handleKeyDown(event: KeyboardEvent, pdfWindow: PdfWindow): void {',
  `  private handleKeyUp(event: KeyboardEvent): void {
    this.#smoothScroller.handleKeyUp(event);
  }

`,
  'keyup smooth release',
);

controller = replaceOnce(
  controller,
  "    if (mode !== 'normal') this.stopSmoothHold(true);",
  "    if (mode !== 'normal') this.#smoothScroller.stop(true);",
  'mode smooth cleanup',
);

controller = replaceSection(
  controller,
  "  private scrollMode(): 'step' | 'follow' | 'trapezoid' {",
  '  private scrollStep(): number {',
  '',
  'session scroll mode ownership',
);

controller = controller.replaceAll('this.scrollMode()', 'this.#smoothScroller.mode');

controller = replaceSection(
  controller,
  '  private startSmoothHold(event: KeyboardEvent, pdfWindow: PdfWindow, key: string): boolean {',
  '  private smoothTick(pdfWindow: PdfWindow, timestamp: number): void {',
  `  private startSmoothHold(event: KeyboardEvent, pdfWindow: PdfWindow, key: string): boolean {
    if (this.#smoothScroller.isRepeat(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
    if (
      this.#smoothScroller.mode === 'step' ||
      this.state.mode !== 'normal' ||
      this.state.countBuffer ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    const bindings = this.#dependencies.bindings();
    const directAction = bindings['normal:' + key];
    if (!this.state.keyBuffer && (!directAction || !smoothScrollSpec(directAction))) return false;
    const decision = advanceInput(
      {
        mode: 'normal',
        keyBuffer: this.state.keyBuffer,
        countBuffer: this.state.countBuffer,
        bindings,
        allowCountPrefix: true,
      },
      key,
    );
    if (decision.kind !== 'execute') return false;
    const spec = smoothScrollSpec(decision.action);
    if (!spec || !this.#smoothScroller.start(pdfWindow, event.key, spec)) return false;
    const hadPendingSequence = !!this.state.keyBuffer;
    this.state.keyBuffer = '';
    this.state.countBuffer = '';
    if (hadPendingSequence) {
      this.clearKeyTimer();
      this.clearKeyGuide();
      this.updateIndicator();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

`,
  'smooth hold input integration',
);

controller = replaceSection(
  controller,
  '  private smoothTick(pdfWindow: PdfWindow, timestamp: number): void {',
  '  private activatePdfWindow(pdfWindow: PdfWindow): void {',
  '',
  'legacy smooth lifecycle implementation',
);

for (const token of [
  'state.smoothHold',
  'stopSmoothHold(',
  'smoothTick(',
  'clearSmoothFrame(',
  'SMOOTH_SCROLL_SPECS',
  'SmoothScrollAction',
  'scrollMode()',
]) {
  if (controller.includes(token)) throw new Error(`controller still contains legacy token: ${token}`);
}
writeFileSync(controllerPath, controller);

const typesPath = 'src/reader/types.ts';
let types = readFileSync(typesPath, 'utf8');
types = replaceOnce(
  types,
  `export interface SmoothHold {
  active: boolean;
  releasing: boolean;
  key: string | null;
  axis: 'x' | 'y' | null;
  direction: -1 | 0 | 1;
  speed: number;
  rafId: number | null;
  lastTimestamp: number;
}

`,
  '',
  'SmoothHold type',
);
types = replaceOnce(types, '  smoothHold: SmoothHold;\n', '', 'ReaderSessionState smooth field');
writeFileSync(typesPath, types);

const testsPath = 'tests/unit/reader-controller.test.ts';
let tests = readFileSync(testsPath, 'utf8');
tests = replaceOnce(
  tests,
  `function releaseSmoothHold(created: SmoothTestSession, key: string) {
  const event = readerKey(key);
  const session = created.session as unknown as {
    handleKeyUp(event: KeyboardEvent, pdfWindow: PdfWindow): void;
  };
  session.handleKeyUp.call(created.session, event.event, created.pdfWindow);
  return event;
}
`,
  `function releaseSmoothHold(created: SmoothTestSession, key: string) {
  const event = readerKey(key);
  const session = created.session as unknown as {
    handleKeyUp(event: KeyboardEvent): void;
  };
  session.handleKeyUp.call(created.session, event.event);
  return event;
}
`,
  'smooth keyup test helper',
);

tests = replaceSection(
  tests,
  "describe('Reader smooth horizontal pan', () => {",
  "describe('reader split shortcuts', () => {",
  `describe('Reader smooth horizontal pan', () => {
  it('starts follow holds for zh/zl and consumes continuation repeats until keyup', () => {
    for (const [continuation, direction] of [
      ['h', -1],
      ['l', 1],
    ] as const) {
      const previousPage = vi.fn();
      const nextPage = vi.fn();
      const created = smoothSession('follow', {
        navigateToPreviousPage: previousPage,
        navigateToNextPage: nextPage,
      });

      created.session.focusAndHandle(readerKey('z').event);
      const first = readerKey(continuation);
      created.session.focusAndHandle(first.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);

      const repeat = readerKey(continuation);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      expect(previousPage).not.toHaveBeenCalled();
      expect(nextPage).not.toHaveBeenCalled();

      releaseSmoothHold(created, continuation);
      runSmoothFrame(created, 16);
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      created.session.dispose();
    }
  });

  it('keeps trapezoid release moving while repeat keydown does not restart the curve', () => {
    const created = smoothSession('trapezoid');
    created.session.focusAndHandle(readerKey('z').event);
    created.session.focusAndHandle(readerKey('l').event);
    expect(created.container.scrollBy).toHaveBeenNthCalledWith(1, 7.5, 0);

    runSmoothFrame(created, 16);
    const accelerated = created.container.scrollBy.mock.calls[1]?.[0] as number;
    expect(accelerated).toBeGreaterThan(14.4);

    const repeat = readerKey('l');
    created.session.focusAndHandle(repeat.event);
    expect(repeat.preventDefault).toHaveBeenCalledOnce();
    expect(created.container.scrollBy).toHaveBeenCalledTimes(2);

    releaseSmoothHold(created, 'l');
    runSmoothFrame(created, 32);
    const decelerating = created.container.scrollBy.mock.calls[2]?.[0] as number;
    expect(decelerating).toBeGreaterThan(0);
    expect(decelerating).toBeLessThan(accelerated);
    created.session.dispose();
  });

  it('keeps counted chords and step mode as immediate discrete pan', () => {
    const counted = smoothSession('follow');
    counted.session.focusAndHandle(readerKey('3').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('h').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(-180, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.focusAndHandle(readerKey('2').event);
    counted.session.focusAndHandle(readerKey('z').event);
    counted.session.focusAndHandle(readerKey('l').event);
    expect(counted.container.scrollBy).toHaveBeenCalledWith(120, 0);
    expect(counted.animationFrameTasks).toHaveLength(0);
    counted.session.dispose();

    const step = smoothSession('step');
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('h').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(-60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.focusAndHandle(readerKey('z').event);
    step.session.focusAndHandle(readerKey('l').event);
    expect(step.container.scrollBy).toHaveBeenCalledWith(60, 0);
    expect(step.animationFrameTasks).toHaveLength(0);
    step.session.dispose();
  });

  it('derives direct j/k and custom H/L scroll holds from their actions', () => {
    for (const [key, direction] of [
      ['j', 1],
      ['k', -1],
    ] as const) {
      const created = smoothSession('follow');
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(0, direction * 10);
      expect(created.animationFrameTasks).toHaveLength(1);
      const repeat = readerKey(key);
      created.session.focusAndHandle(repeat.event);
      expect(repeat.preventDefault).toHaveBeenCalledOnce();
      expect(created.container.scrollBy).toHaveBeenCalledTimes(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }

    const customBindings = {
      ...DEFAULT_BINDINGS,
      'normal:H': 'scrollLeft',
      'normal:L': 'scrollRight',
    } as BindingMap;
    for (const [key, direction] of [
      ['H', -1],
      ['L', 1],
    ] as const) {
      const created = smoothSession('follow', {}, customBindings);
      const press = readerKey(key);
      created.session.focusAndHandle(press.event);
      expect(created.container.scrollBy).toHaveBeenCalledWith(direction * 10, 0);
      expect(created.animationFrameTasks).toHaveLength(1);
      releaseSmoothHold(created, key);
      created.session.dispose();
    }
  });
});
`,
  'smooth Reader integration tests',
);
if (tests.includes('state.smoothHold')) throw new Error('reader-controller tests still inspect smoothHold');
writeFileSync(testsPath, tests);

const docsPath = 'docs/DEVELOPMENT.md';
let docs = readFileSync(docsPath, 'utf8');
docs = replaceOnce(
  docs,
  '## Reader sidebar ownership\n',
  `## Reader smooth-scroll ownership

\`ReaderSession\` resolves bindings and count/chord state, but continuous scroll physics are owned by
\`ReaderSmoothScroller\`. The feature owns the physical hold key, active/releasing phase, axis,
direction, speed, timestamp, requestAnimationFrame ID, and the PDF view that scheduled the frame.
Normal-mode input hands it only an already-resolved scroll action. Counted motions and step mode stay
on the ordinary discrete action path.

The owning PDF view is part of the transient state: switching a hold to another split view cancels
the old view's frame before scheduling the new one, and view release/disposal cancels the frame on
that exact window rather than whichever Reader view happens to be active later. Follow mode stops on
keyup; trapezoid mode decelerates unless \`smoothScroll.stopOnRelease\` requests an immediate stop.
Reader session state must not mirror the continuous hold/RAF fields.

## Reader sidebar ownership
`,
  'smooth scroll architecture docs',
);
writeFileSync(docsPath, docs);
