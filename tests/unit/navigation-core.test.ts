import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import type { ReaderJumpLocation } from '../../src/core/contracts';
import type { ActionId } from '../../src/input/actions';
import { NavigationCoordinator } from '../../src/navigation/coordinator';
import { NavigationHistoryState } from '../../src/navigation/history';
import { resolveHistoryPolicy } from '../../src/navigation/history-policy';
import type {
  NavigationCompletion,
  NavigationIntent,
  NavigationLocation,
  NavigationOutcome,
} from '../../src/navigation/types';

function tab(tabID: string): NavigationLocation {
  return { kind: 'tab', tabID };
}

function reader(tabID: string, pageIndex: number): ReaderJumpLocation {
  return {
    kind: 'reader',
    tabID,
    libraryID: 1,
    itemID: 10,
    position: { primary: true, pageIndex, top: 0, left: 0 },
  };
}

function actionIntent(
  action: ActionId,
  surface: NavigationIntent['surface'] = 'main',
): NavigationIntent {
  return { cause: { kind: 'action', action }, surface };
}

function createCoordinator(initial: NavigationLocation = tab('A')) {
  let current = initial;
  let sessionCurrent = true;
  const captures: NavigationLocation[] = [];
  const history = new NavigationHistoryState();
  const coordinator = new NavigationCoordinator(history, {
    capture: () => {
      captures.push(current);
      return current;
    },
    isCurrent: () => sessionCurrent,
  });
  return {
    history,
    coordinator,
    captures,
    setCurrent: (location: NavigationLocation) => {
      current = location;
    },
    setSessionCurrent: (value: boolean) => {
      sessionCurrent = value;
    },
  };
}

function immediate(outcome: NavigationOutcome): NavigationCompletion {
  return { kind: 'immediate', outcome };
}

describe('navigation history policy', () => {
  it('resolves context, path, and evidence centrally with ignore as the default', () => {
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'mainNavFirst' },
        surface: 'main',
        context: { mainPanel: 'items' },
      }),
    ).toEqual({ kind: 'record', evidence: 'settled-change' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'mainNavFirst' },
        surface: 'main',
        context: { mainPanel: 'collections' },
      }),
    ).toEqual({ kind: 'ignore' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'findNext' },
        surface: 'main',
        context: { mainPanel: 'items' },
      }),
    ).toEqual({ kind: 'record', evidence: 'settled-change' });
    expect(resolveHistoryPolicy(actionIntent('findNext'))).toEqual({ kind: 'ignore' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'firstPage' },
        surface: 'reader',
        context: { readerPath: 'explicit-page' },
      }),
    ).toEqual({ kind: 'record', evidence: 'native-hard' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'lastPage' },
        surface: 'reader',
        context: { readerPath: 'fallback-scroll' },
      }),
    ).toEqual({ kind: 'ignore' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'action', action: 'followLink' },
        surface: 'reader',
        context: { readerPath: 'external-link' },
      }),
    ).toEqual({ kind: 'ignore' });
    expect(
      resolveHistoryPolicy({
        cause: { kind: 'event', event: 'reader-mark.jump' },
        surface: 'reader',
        context: { readerPath: 'mark' },
      }),
    ).toEqual({ kind: 'record', evidence: 'managed-final' });
    expect(resolveHistoryPolicy(actionIntent('navigateBack'))).toEqual({ kind: 'traverse' });
    expect(resolveHistoryPolicy(actionIntent('scrollDown'))).toEqual({ kind: 'ignore' });
  });
});

describe('NavigationCoordinator', () => {
  it('records Reader and Note chooser confirmations through their original surfaces', () => {
    const confirmations = [
      ['findAllItems', 'reader'],
      ['findCollectionItems', 'reader'],
      ['findNotes', 'note'],
    ] as const;
    for (const [action, surface] of confirmations) {
      const source = tab(`${surface}-source`);
      const destination = tab('library');
      const h = createCoordinator(source);
      const execution = h.coordinator.execute(actionIntent(action, surface), {
        dispatch: 'inline',
        start: () => {
          h.setCurrent(destination);
          return immediate({ kind: 'completed', evidence: 'settled-change' });
        },
      });
      expect(execution.pending).toBe(false);
      expect(execution.result).toMatchObject({ kind: 'completed', recorded: true });
      expect(h.history.locations).toEqual([source, destination]);
    }
  });

  it('commits inline A-to-B-to-C destinations before returning', () => {
    const h = createCoordinator(tab('A'));
    const first = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'inline',
      start: () => {
        h.setCurrent(tab('B'));
        return immediate({ kind: 'completed', evidence: 'settled-change' });
      },
    });
    const second = h.coordinator.execute(actionIntent('nextTab'), {
      dispatch: 'inline',
      start: () => {
        h.setCurrent(tab('C'));
        return immediate({ kind: 'completed', evidence: 'settled-change' });
      },
    });

    expect(first.pending).toBe(false);
    expect(second.pending).toBe(false);
    expect(first.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(second.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(h.history.locations).toEqual([tab('A'), tab('B'), tab('C')]);
  });

  it('waits for a foreign-realm completion before traversing its recorded destination', async () => {
    const h = createCoordinator(tab('A'));
    const {
      promise: settled,
      resolve: complete,
    }: {
      promise: Promise<NavigationOutcome>;
      resolve: (outcome: NavigationOutcome) => void;
    } = runInNewContext('Promise.withResolvers()');
    const jump = h.coordinator.execute(actionIntent('nextTab'), {
      dispatch: 'inline',
      start: () => {
        h.setCurrent(tab('B'));
        return { kind: 'deferred', settled };
      },
    });
    let traversalStarted = false;
    const back = h.coordinator.execute(actionIntent('navigateBack'), {
      dispatch: 'serial-traversal',
      start: () => {
        traversalStarted = true;
        h.setCurrent(tab('A'));
        return immediate({ kind: 'completed', evidence: 'managed-final', targetIndex: 0 });
      },
    });
    expect(jump.pending).toBe(true);
    await Promise.resolve();
    expect(traversalStarted).toBe(false);
    complete({ kind: 'completed', evidence: 'settled-change' });
    expect(await jump.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(await back.result).toMatchObject({ kind: 'completed', recorded: false });
    expect(h.history.locations).toEqual([tab('A'), tab('B')]);
    expect(h.history.index).toBe(0);
  });

  it('runs ignored motion without snapshot capture, history admission, or a deferred result', () => {
    const h = createCoordinator();
    let policy = 'unset';
    const execution = h.coordinator.execute(actionIntent('scrollDown'), {
      dispatch: 'inline',
      admission: 'motion',
      start: (attempt) => {
        policy = attempt.policy.kind;
        return immediate({ kind: 'completed', evidence: 'settled-change' });
      },
    });

    expect(policy).toBe('ignore');
    expect(execution.pending).toBe(false);
    expect(execution.result).toMatchObject({ kind: 'completed', recorded: false });
    expect(h.captures).toEqual([]);
    expect(h.history.revision).toBe(0);
    expect(h.history.locations).toEqual([]);
  });

  it('lets a newer no-op explicit action retire already-running work', async () => {
    const h = createCoordinator();
    const { promise: firstCompletion, resolve: finishFirst } =
      Promise.withResolvers<NavigationOutcome>();
    const { promise: started, resolve: announceStart } = Promise.withResolvers<void>();
    const first = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'serial-navigation',
      start: () => {
        announceStart();
        return {
          kind: 'deferred',
          settled: firstCompletion,
        };
      },
    });
    await started;
    const noOp = h.coordinator.execute(actionIntent('nextTab'), {
      dispatch: 'inline',
      start: () => immediate({ kind: 'unavailable' }),
    });
    finishFirst({ kind: 'completed', evidence: 'settled-change', destination: tab('B') });

    expect(await first.result).toMatchObject({ kind: 'stale', recorded: false });
    expect(noOp.result).toMatchObject({ kind: 'unavailable', recorded: false });
    expect(noOp.isCurrent()).toBe(true);
    expect(h.history.locations).toEqual([]);
  });

  it('drains stale serial work before capturing the latest request source', async () => {
    const h = createCoordinator(tab('A'));
    const { promise: firstCompletion, resolve: finishFirst } =
      Promise.withResolvers<NavigationOutcome>();
    const { promise: started, resolve: announceStart } = Promise.withResolvers<void>();
    const stale = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'serial-navigation',
      start: () => {
        announceStart();
        return {
          kind: 'deferred',
          settled: firstCompletion,
        };
      },
    });
    await started;
    const latest = h.coordinator.execute(actionIntent('nextTab'), {
      dispatch: 'serial-navigation',
      start: () => {
        h.setCurrent(tab('C'));
        return immediate({ kind: 'completed', evidence: 'settled-change', destination: tab('C') });
      },
    });
    h.setCurrent(tab('B'));
    finishFirst({ kind: 'completed', evidence: 'settled-change', destination: tab('B') });

    expect(await stale.result).toMatchObject({ kind: 'stale', recorded: false });
    expect(await latest.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(h.captures).toEqual([tab('A'), tab('B')]);
    expect(h.history.locations).toEqual([tab('B'), tab('C')]);
  });

  it('fences Back behind an inline Reader completion and shares the traversal epoch', async () => {
    const h = createCoordinator(tab('B'));
    const baseEpoch = h.history.invalidate();
    h.history.append(tab('A'), tab('B'), baseEpoch);
    const { promise: readerCompletion, resolve: finishReader } =
      Promise.withResolvers<NavigationOutcome>();
    let readerEpoch = -1;
    const readerJump = h.coordinator.execute(
      {
        cause: { kind: 'action', action: 'firstPage' },
        surface: 'reader',
        context: { readerPath: 'explicit-page' },
      },
      {
        dispatch: 'inline',
        capture: () => tab('B'),
        start: (attempt) => {
          readerEpoch = attempt.token.epoch;
          return {
            kind: 'deferred',
            settled: readerCompletion,
          };
        },
      },
    );
    const traversalIndexes: number[] = [];
    const traversalEpochs: number[] = [];
    const back = (): NavigationCompletion => ({
      kind: 'immediate',
      outcome: {
        kind: 'completed',
        evidence: 'managed-final',
        targetIndex: h.history.index - 1,
      },
    });
    const firstBack = h.coordinator.execute(actionIntent('navigateBack'), {
      dispatch: 'serial-traversal',
      start: (attempt) => {
        traversalIndexes.push(h.history.index);
        traversalEpochs.push(attempt.token.epoch);
        return back();
      },
    });
    const secondBack = h.coordinator.execute(actionIntent('navigateBack'), {
      dispatch: 'serial-traversal',
      start: (attempt) => {
        traversalIndexes.push(h.history.index);
        traversalEpochs.push(attempt.token.epoch);
        return back();
      },
    });
    h.setCurrent(tab('C'));
    finishReader({ kind: 'completed', evidence: 'native-hard', destination: tab('C') });

    expect(await readerJump.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(await firstBack.result).toMatchObject({ kind: 'completed', recorded: false });
    expect(await secondBack.result).toMatchObject({ kind: 'completed', recorded: false });
    expect(traversalIndexes).toEqual([2, 1]);
    expect(traversalEpochs).toEqual([readerEpoch, readerEpoch]);
    expect(h.history.locations).toEqual([tab('A'), tab('B'), tab('C')]);
    expect(h.history.index).toBe(0);
  });

  it('requires the policy evidence and admits only current changed native receipts', () => {
    const source = reader('reader-A', 0);
    const destination = reader('reader-A', 3);
    const h = createCoordinator(source);
    const search = h.coordinator.execute(
      {
        cause: { kind: 'action', action: 'findNext' },
        surface: 'reader',
        context: { readerPath: 'search' },
      },
      {
        dispatch: 'inline',
        capture: () => source,
        start: () => immediate({ kind: 'completed', evidence: 'settled-change', destination }),
      },
    );
    expect(search.result).toMatchObject({ kind: 'completed', recorded: false });
    expect(search.isCurrent()).toBe(true);
    expect(h.history.locations).toEqual([]);

    const revision = h.history.revision;
    h.coordinator.observeNative({ source, destination, isCurrent: () => false });
    expect(h.history.revision).toBe(revision);
    h.coordinator.observeNative({ source: destination, destination, isCurrent: () => true });
    expect(h.history.revision).toBe(revision);

    h.coordinator.observeNative({ source, destination, isCurrent: () => true });
    expect(h.history.revision).toBe(revision + 1);
    expect(h.history.locations).toEqual([source, destination]);
  });

  it('retires cancelled ownership without committing a later completion', async () => {
    const h = createCoordinator(tab('A'));
    const { promise: settled, resolve: finish } = Promise.withResolvers<NavigationOutcome>();
    const execution = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'inline',
      start: () => ({
        kind: 'deferred',
        settled,
      }),
    });
    execution.cancel();
    h.setCurrent(tab('B'));
    finish({ kind: 'completed', evidence: 'settled-change', destination: tab('B') });

    expect(await execution.result).toMatchObject({ kind: 'stale', recorded: false });
    expect(execution.isCurrent()).toBe(false);
    expect(h.history.locations).toEqual([]);
  });

  it('rejects a late completion after its owning session becomes stale', async () => {
    const h = createCoordinator(tab('A'));
    const { promise: settled, resolve: finish } = Promise.withResolvers<NavigationOutcome>();
    const execution = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'inline',
      start: () => ({
        kind: 'deferred',
        settled,
      }),
    });
    h.setSessionCurrent(false);
    finish({ kind: 'completed', evidence: 'settled-change', destination: tab('B') });

    expect(await execution.result).toMatchObject({ kind: 'stale', recorded: false });
    expect(h.history.locations).toEqual([]);
  });

  it('continues the serial lane after a deferred host rejection', async () => {
    const h = createCoordinator(tab('A'));
    const failed = h.coordinator.execute(actionIntent('previousTab'), {
      dispatch: 'serial-navigation',
      start: () => ({ kind: 'deferred', settled: Promise.reject(new Error('host failed')) }),
    });
    expect(await failed.result).toMatchObject({ kind: 'failed', recorded: false });

    const next = h.coordinator.execute(actionIntent('nextTab'), {
      dispatch: 'serial-navigation',
      start: () => {
        h.setCurrent(tab('B'));
        return immediate({ kind: 'completed', evidence: 'settled-change' });
      },
    });
    expect(await next.result).toMatchObject({ kind: 'completed', recorded: true });
    expect(h.history.locations).toEqual([tab('A'), tab('B')]);
  });
});
