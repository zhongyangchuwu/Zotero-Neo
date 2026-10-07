# Unified Navigation Execution and History Policy

**Status:** implemented and verified with automated contracts and supported-host smoke. The runtime owns one per-window `NavigationHistoryState` and routes policy, admission, completion, and commits through `NavigationCoordinator`. See [Navigation and the shared jumplist](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) for command behavior and [Development Guide](DEVELOPMENT.md#runtime-architecture) for private Reader transport constraints. Historical source observations and contract-model evidence below remain rationale, not current acceptance evidence.

## Contents

- [Intent and decisions](#intent-and-decisions)
- [Baseline coupling and evidence (historical)](#baseline-coupling-and-evidence-historical)
- [Ownership and dependency direction](#ownership-and-dependency-direction)
- [One execution contract](#one-execution-contract)
- [One history policy source](#one-history-policy-source)
- [Admission, scheduling, and completion](#admission-scheduling-and-completion)
- [Reader provenance and native completion](#reader-provenance-and-native-completion)
- [Location and restoration contract](#location-and-restoration-contract)
- [Lifecycle and performance](#lifecycle-and-performance)
- [Implementation state and acceptance](#implementation-state-and-acceptance)
- [Acceptance matrix](#acceptance-matrix)
- [Historical proposal evidence, limits, and rejected alternatives](#historical-proposal-evidence-limits-and-rejected-alternatives)

## Intent and decisions

The maintainer must be able to see which navigation actions enter Neo history in one file and change that policy without finding and editing command-specific history wrappers. All admitted Neo-initiated navigation uses one execution interface. Synchronous and asynchronous completion are adapter details, not separate history APIs.

Implemented contract:

1. `history-policy.ts` is the sole typed source for action/event recording policy. Unconfigured actions default to Ignore; named non-Action events use the same policy.
2. `NavigationCoordinator.execute()` is the one Neo-initiated execution/commit path. Reader native observation uses the same coordinator through `NavigationPort.observeNative()`; callers do not select a history implementation.
3. Adapters declare inline, serial-navigation, or serial-traversal dispatch before host work and report immediate/deferred navigation completion. Completion is not inferred from an arbitrary host Promise.
4. `NavigationHistoryState` is the one window-owned stack and retains the bounded stack/equality/refresh/remap contract.
5. Each admitted execution stamps immutable cause/context and ownership. Native producers and delayed callbacks retain that ownership; ignored, superseded, completed, or disposed ownership never becomes generic native navigation.
6. The default evidence rules remain context-sensitive. Explicit Reader navigation establishes its epoch at launch; Back/Forward waits for admitted Reader completion. These implemented concurrency rules remain subject to integrated acceptance.
7. Direct completion ports are used; there is no event bus, plugin registration framework, universal command executor, preference UI, or runtime package dependency.

**Scope:** policy centralization, navigation execution/completion, provenance, cancellation, and clean caller migration. **Not in scope:** new bindings/count semantics, recording all native tab clicks, persistent history, zoom/layout/Note-caret snapshots, full UI rollback, or external plugin APIs.

## Baseline coupling and evidence (historical)

This table describes the pre-cutover runtime at `adba932b9219b40ee568603220607257cc9d4f1b`, not current owners.

| Baseline path | Baseline history coupling | Pre-cutover issue |
| --- | --- | --- |
| Main/Note/Reader `H/L` | Main facade or dispatch wraps `MainNavigation.cycleTab()` in `navigateNow()` | Whether to record is encoded at call sites. |
| Tab chooser | Confirmation uses the same synchronous `navigateNow()` around `selectMainTab()` | Opening the chooser is not navigation; confirmation must carry its semantic origin. |
| Main Items `gg/G` | Controller conditionally wraps navigation only in Items | Context-sensitive recording is scattered in dispatch. |
| Main local find | Owner receives an injected history-wrapped move callback | Prompt confirmation has no ActionId of its own. |
| Open/reveal/item/note chooser | `requestNavigation()` / `requestLibrarySelection()` | Async scheduling and recording are coupled in different APIs. |
| Reader PDF destinations | `ReaderJumpHistoryBridge` observes hard `history.save()` | Observation currently has source/destination but no operation cause. |
| Reader marks | Managed wrapper holds intermediate saves, then calls `recordReaderJump()` | One excursion is correct, but policy and suppression are Reader-local. |
| Back/Forward | Queued restoration with a retained revision | Traversal is not a new record and must retain batch semantics. |

Historical source owners: [Main history](../src/main/jump-history.ts), [Main dispatch](../src/main/controller.ts), [local find](../src/main/local-find.ts), [Selection Panel](../src/main/selection-panel.ts), [Reader bridge](../src/reader/jump-history-bridge.ts), [Reader controller](../src/reader/controller.ts), and [composition contracts](../src/core/contracts.ts).

Current ownership is `src/navigation/history.ts` (`NavigationHistoryState`),
`src/navigation/history-policy.ts` (only typed eligibility/evidence rules), and
`src/navigation/coordinator.ts` (`NavigationCoordinator`, the admission,
currentness, lane, completion, and commit owner). `NavigationPort.execute()` and
`observeNative()` are the only public recording entrances. `src/main/jump-history.ts`
exports `MainNavigationExecutor`, Main's host adapter/facade for building
operations and capturing/restoring locations; it delegates all commits to the
coordinator. Reader execution uses that same port. No legacy wrapper or parallel
Recorder API remains.

The pinned Zotero method inspection established that PDF `navigate()` calls `_pushHistoryPoint()` without awaiting it. `_pushHistoryPoint()` waits for scroll settling, reads actual PDF XYZ geometry, and then calls native history save. Thus `await navigate()` is **not** the settled destination contract. The current bridge associates the hard save with the exact producer's terminal completion instead of inferring it from `navigate()` or a global save queue.

The source check is pinned to Zotero stable **10.0.5** and its Reader submodule `9d821fa2c1941bdfdd7bee3199936401b45be852`: [PDF view](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-view.js) and [find controller](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-find-controller.js). Search uses `_findController`, not upstream master's newer grouped-navigation/search APIs. These are private SDK assumptions and must be revalidated on every supported host update.

## Ownership and dependency direction

```text
Input / capability / semantic owner
  resolves target, count, surface and confirmation
                |
                v
NavigationCoordinator.execute(intent, operation)
  policy -> admission -> dispatch -> real completion -> commit
       |                                      ^
       v                                      |
Main / tab / Reader / managed adapters --------+
  execute host work and report its actual result
                |
                v
Zotero / PDF.js

Coordinator -> NavigationHistoryState
               append / refresh / move / remap
```

Implemented module responsibilities:

| Module | Responsibility | Must not own |
| --- | --- | --- |
| `src/navigation/types.ts` | DOM-free locations; typed causes, intents, tokens, outcomes and completion contracts | Input matching or host execution |
| `src/navigation/history-policy.ts` | Recording decisions and named context predicates; complete configured-cause lookup | Async queues, target mutation, host patching |
| `src/navigation/coordinator.ts` | One execute entry; operation admission, completion fences, currentness, private commit | Picker search/ranking, Reader geometry algorithms |
| `src/navigation/history.ts` | Existing bounded stack/equality/refresh/remap behavior | Cause classification or host calls |
| Main `MainNavigationExecutor` | Main/tab operation building and library capture/restore, using `main/navigation.ts`, `host.ts`, and View owners; exposes the shared coordinator port | History policy or direct append |
| Reader navigation/completion adapters | Page/search/link/outline/mark/motion execution, exact-view completion and native provenance | Another traversal stack |
| `src/addon.ts` and Main window lifecycle | Compose ports and attach/dispose the one navigation session | A second window registry or fallback to a different window |

These are responsibility boundaries, not a requirement to create a file for every method. Keep existing Main and Reader feature owners; move only shared history/coordinator responsibilities. MainWindowSession remains the lifecycle owner. Reader and Note use its navigation capability through the existing composition boundary; they never borrow Main Selection or redispatch an ActionId merely to execute it.

## One execution contract

These are the implemented typed execution contracts (abridged):

```ts
type NavigationSurface = 'main' | 'reader' | 'note';

type NavigationCause =
  | { readonly kind: 'action'; readonly action: ActionId }
  | { readonly kind: 'event'; readonly event: NavigationEventId };

interface NavigationIntent {
  readonly cause: NavigationCause;
  readonly surface: NavigationSurface;
  readonly context?: NavigationContext;
}

type NavigationCompletion =
  | { readonly kind: 'immediate'; readonly outcome: NavigationOutcome }
  | {
      readonly kind: 'deferred';
      readonly settled: Promise<NavigationOutcome>;
    };

interface NavigationOperation {
  readonly dispatch: 'inline' | 'serial-navigation' | 'serial-traversal';
  readonly admission?: 'replace' | 'motion';
  readonly capture?: () => NavigationLocation | null;
  readonly destinationPanel?: 'collections' | 'items';
  start(attempt: NavigationAttempt): NavigationCompletion;
}

interface NavigationPort {
  execute(intent: NavigationIntent, operation: NavigationOperation): NavigationExecution;
  observeNative(receipt: NativeNavigationReceipt): void;
}

interface NavigationCoordinator {
  execute(
    intent: NavigationIntent,
    operation: NavigationOperation,
  ): NavigationExecution;
  observeNative(receipt: NativeNavigationReceipt): void;
}
```

`NavigationContext` carries optional Main panel or Reader path/currentness context. Window/session identity belongs to the coordinator's host boundary; Reader view and callback ownership is carried by its adapters, not stored in history locations. Context is transient, not persisted. The coordinator stamps/freezes the intent at admission; do not retain a mutable picker row or read the then-focused input as the semantic target.

`NavigationAttempt` exposes the immutable token, policy decision, currentness check, and cancel function. Operation ID and history epoch are separate: consecutive Back requests have different IDs but intentionally share an epoch. Reader callback binding and lifecycle cleanup are implemented by scoped bridge/adapters, not by a public callback-binding method on the attempt.

`NavigationOutcome` distinguishes completed, unchanged, unavailable, cancelled, failed, and stale; completed outcomes carry the required evidence and may carry a destination. Reader adapters validate native hard receipts against the exact producer/view and settled final geometry before reporting `native-hard`; an ordinary geometry change alone is insufficient. Successful host execution and successful append are separate results: missing snapshots, equality, or unmet evidence policy may yield a successful outcome with `recorded: false`. Unexpected host failures retain normal logging; stale attempts do not publish success or failure into a newer UI invocation.

The coordinator captures destination synchronously for an immediate outcome. A deferred outcome is resolved only by the adapter's real completion receipt. Callers use one `NavigationExecution` result shape with an immediate result or pending result/currentness handle; async UI callers may await the pending result. Key dispatch does not create a Promise merely to process an immediate navigation.

### H/L and chooser use the same interface

- `H/L`: resolve a relative tab operation and call `execute()` immediately.
- Chooser: opening/query/browsing do not call `execute()`; its semantic confirmation supplies the selected tab operation and original surface.
- Both use the same tab adapter and post-switch maintenance. The adapter synchronously checks the actual selected ID. It owns Reader rescans/focus maintenance for both relative and absolute selection.
- History captures the source at execution, not when the chooser was opened. Candidate providers remain data-only. Capture-to-note reuses a Notes provider but is a content mutation, not a `findNotes` navigation.

## One history policy source

`history-policy.ts` contains typed action rules, event rules, and named predicates. Policy decisions are Record, Ignore, or Traverse. A Record rule also declares its required completion evidence: `settled-change`, `native-hard`, or `managed-final`. Cheap cause/context/path checks resolve eligibility before source capture; the private commit checks the receipt against the evidence requirement after completion. Traverse is a semantic role that cannot be converted into append by a flag.

A rule such as `mainNavFirst: recordWhen(mainItems)` replaces the Controller's ad-hoc `if (panel === 'items')` history wrapper. The operation still knows how to move the cursor; it does not decide whether that move enters history. A shared ActionId can have different surface/path predicates, for example Main and Reader `findNext`.

Implemented central default policy inventory:

| Cause | Context / moment | Default policy |
| --- | --- | --- |
| `previousTab`, `nextTab` | Actual selected-tab cycle, Main/Reader/Note | Record |
| `switchTab` | Successful chooser confirmation only | Record |
| `mainNavFirst`, `mainNavLast` | Main Items; Collections is excluded | Record when Items |
| `findNext`, `findPrevious` | Main visible-row repeat / Reader supported search destination | Main: settled change; Reader: owned native hard point only |
| `main-local-find.confirm` | Enter commits query and moves to the first match | Record |
| `mainOpenPDF` | Main Cursor or captured Note-context target | Record after successful navigation |
| `mainActivate` | Items opens Cursor; collection activation is View mutation | Record when Items |
| `findAllItems`, `findCollectionItems`, `findNotes` | Semantic chooser confirmation, not provider/query activity | Record |
| `showInLibrary` | Reader/Note contextual target successfully revealed | Record |
| `main-selection-panel.reveal` | Available member revealed by this panel invocation | Record |
| `firstPage`, `lastPage` | Supported explicit Reader page path | Record on owned native hard point |
| `prevAnnotation`, `nextAnnotation` | Supported Reader destination, not mere selection UI | Record on owned native hard point |
| `followLink` | Confirmed internal/citation destination; external URL excluded | Record on owned native hard point |
| `reader-outline.confirm` | Outline destination confirmation; opening/browsing excluded | Record on owned native hard point |
| `reader-mark.jump` | One managed mark excursion; set/delete/browse excluded | Record once on managed final destination |
| `reader-native.hard` | Unowned non-transient native destination in the selected Reader tab | Record on native hard point |
| `navigateBack`, `navigateForward` | Counted or uncounted traversal | Traverse, never append |
| Main `j/k`, Reader `h/l`, scroll/viewport motions | Navigation-capable ordinary movement | Ignore by default |
| Native tab-bar selection/close; manual scope/filter changes | Not current standalone jump events | Ignore |
| Selection/caret editing, zoom/layout, annotation/tag/item mutations, overlay launch/browse | Not navigation destinations | No recording rule |

A named event is used where there is no executable ActionId; do not invent an ActionId merely to fit policy. Delayed chooser callbacks carry their semantic action cause. Delayed outline and link confirmation carry their owning navigation cause, not the current key or provider name.

The Reader hard-point default does not imply that every listed command emits a hard point. In the pinned host, search's `_onNavigate` calls `navigateToPosition()` without a hard save, and `setSelectedAnnotationIDs()` updates selection without declaring a destination. Those routes may complete successfully without an entry. Their adapters return the real completion/no-op and preserve ownership; no settled-change entry is inferred without changing the central evidence rule and proving that route's completion/provenance contract. Outline closes on successful completed or unchanged host outcome independently of whether history append succeeds.

The rule controls the **transition**, not whether a location can ever appear in history. An ignored motion can establish the actual departure of a later recorded jump; that location may legitimately become that later jump's source.

### What a policy-only edit must do

Turning Record off:

1. Execute the same host operation with the same target/count.
2. Do not append or truncate the Forward suffix for that operation.
3. Keep explicit operation cancellation/currentness rules; disabling recording does not revive older host work.
4. Keep native Zotero history intact. Do not implement Ignore by passing `skipHistory` to a normal host command.
5. Keep native/transient baselines up to date, so later jumps and departure refresh use actual positions.
6. Retain owned provenance until all emitted child completions settle. A disabled Reader action cannot reappear under `reader-native.hard`.

Promoting a default-ignored **navigation-capable** motion to Record is allowed only when its existing adapter implements actual completion/capture. Main row motion can complete inline; Reader page-turn/scroll needs its own completion signal even when it emits no hard save. The adapter's supported paths and the configured policy are validated together. A non-navigation mutation does not become navigation by adding its ID to a table. Adding a new navigation family requires one adapter integration; changing the policy of an already integrated family requires only the policy file.

Unsupported `gg/G` uses the existing scroll fallback. The default page rule requires the explicit-page path, so fallback neither gains a hard entry nor a jump-admission fence. Counts and host target validation remain unchanged.

## Admission, scheduling, and completion

Separate four decisions:

1. **Policy:** should this completed transition append?
2. **Admission:** which earlier execution ownership does this intent supersede?
3. **Dispatch:** may host work run inline, or must it wait for the window's serial lane?
4. **Completion:** when is an actual outcome available?

A deferred result does not imply queued dispatch. Reader page navigation can start inline and complete later. H/L and confirmed tab selection are inline and immediate. Main open/library reveal is serial and deferred. Adapters declare the dispatch lane before their thunk is called; inspecting a returned Promise after executing the thunk is too late to choose scheduling.

### Immediate path

Evaluate the rule and cheap context checks; capture a source only if needed; perform; validate currentness; capture/commit the destination before returning. No unconditional `await` occurs on this path.

For synchronous `A -> B -> C`, the first execution must capture B before the second mutates the tab to C. Universal await would permit `A -> C` and lose an intermediate destination.

### Serial Main path

Admit/version the request before queueing, but capture its departure and invoke its thunk only at its eligible queue turn. Superseded waiting requests do not execute. An already-running stale host call still drains before the next serial host operation starts; its actual partial UI effects are the next operation's departure. A rejected result must not poison the queue tail.

Cancellation is not rollback or proof that native work stopped. A stale or cancelled root is ineligible to commit; physical host drainage is still tracked where serial correctness requires it.

### Reader launch and traversal fences: deliberate normalization

An admitted explicit Neo Reader jump establishes its window epoch at launch, like a Main jump. This supersedes an older explicit operation even if recording for the new action is disabled. The Reader host call still dispatches inline; deferred completion registers a fence for later Back/Forward without queueing the jump itself. Back/Forward waits for that actual outcome, then computes its target from resulting history. This implemented normalization supersedes the baseline's accepted-record-time invalidation and awaits integrated acceptance.

Ordinary default-ignored motion keeps its no-epoch fast path. Independently, the existing Reader input transition must retire an in-flight mark even for an unbound/prefix/ordinary key. Execution ownership cancellation and history-epoch advancement are not the same thing.

### Traversal

Consecutive Back/Forward requests share the admitted epoch and run serially. Refresh the actual departure and calculate the target index at execution time. A newer explicit navigation invalidates that batch. Only current, fully successful restoration moves the index; traversal and its native echo never append.

### Root state and at-most-once commit

```text
admitted -> waiting -> running -> settling -> completed / unchanged / failed
    |          |          |          |
    +----------+----------+----------+----> retired / stale

running/settling retirement may still require host drainage
completed/retired ownership is never reclassified as native
```

A root has a unique operation ID, epoch, cause, context stamps, recording decision, and terminal/commit state. Child native producers inherit the root; they do not create additional history roots. Completion validates window/session, target tab/item, view identity, invocation generation, and epoch as appropriate. At most one successful commit is possible per root.

Genuinely unowned native work enters through the adapter's observation port, not by redispatching the host command. Preserve the current native bridge's accepted-completion-time window admission: the producer ticket captures source, view and native cause at invocation, but only an eligible, changed, current completion admits a native history root and supersedes window work. An owned ticket never becomes such a root, even after its original epoch ends. Background/cold-initialization observations only update their baseline. This keeps native observation separate from the two deliberate **explicit Neo Reader jump** scheduling changes above, while sharing the same private commit.

## Reader provenance and native completion

This is the highest-risk implementation seam. A central action table is ineffective if delayed native saves have lost the action cause. A host Promise, a current-action variable, a 750 ms window, or a matching XYZ position does not establish ownership.

Required provenance protocol:

1. Begin an operation with an immutable token and capture its source at the correct adapter boundary.
2. Bind Neo-owned asynchronous callbacks to that token at registration/invocation ownership boundaries. Callback binding restores provenance only for the callback's synchronous work; it does not borrow whichever token happens to be latest on the view.
3. At native history **producer invocation**, create a producer ticket carrying the inherited operation token, exact view/history identity, and producer lifecycle. Unowned producer invocation is a native cause; an owned but retired invocation remains owned-and-rejected.
4. Delegate the original native producer exactly once, retaining receiver, arguments, returned value/Promise identity, and rejection behavior. The producer's real settlement, not `navigate()` resolution, is the native completion fence.
5. Continue observing native save payloads to retain actual hard/transient geometry. Only a provenance-bound completion receipt may complete a Neo root or a native root; the raw save observer is not another append path.
6. Managed marks own their intermediate producers and report one final destination. Restore producers are traversal children. Completed, ignored, cancelled, and retired child tickets remain non-recording until their native work settles.
7. Disposal removes owned listeners/patches and retires receipts. Late callbacks cannot use another window/view or fall through to generic native recording.

Primary and secondary views are observed. Native eligibility means the owning Reader tab is selected, not that the particular split view currently has focus. Background-tab native saves continue normally but neither append nor supersede active window work.

### Pinned route and completion matrix

| Stable host route | Pinned SDK behavior | Implemented ownership/completion boundary | Default recording evidence |
| --- | --- | --- | --- |
| `navigate({ pageIndex / position / annotationID })` | Starts direct movement and invokes `_pushHistoryPoint()` before its first await; it does not await that producer | Scope at producer invocation; associate the producer's own terminal Promise boundary with its exact-view hard-save receipt | Native hard point; no entry if no matching receipt |
| `navigate({ dest })`, outline/hash/internal link service | `goToDestination()` can resolve its target asynchronously; a surrounding save alone does not prove the route's target | Carry the originating scope through owned link/callback work and require the exact producer's settled final destination | Native hard point; no entry absent owned receipt |
| `navigate({ pageLabel / pageNumber })` | Awaits `_pageLabelsPromise` once before movement and producer invocation | Temporarily tag the exact writable field with a request-specific native-realm thenable; restore the original immediately; carry immutable ownership across the PDF continuation microtask | Native hard point |
| `findNext()` / `findPrevious()` | `find(state)` stores the exact request object; `_onNavigate(pageIndex, matchIndex)` awaits match data then calls `navigateToPosition()`; this observed route has no hard point | Exact request identity and bound native callbacks retain the initiating scope; wait for actual search/scroll completion independently of hard-point evidence | Native hard point only; search may complete without recording |
| `setSelectedAnnotationIDs()` and annotation navigation fallback | Selection setter updates selection without declaring a destination; `navigate({ annotationID })` may use a hard producer | Selection-only outcome reports no destination; actual navigation uses its own producer receipt | Native hard point, not selection alone |
| Managed mark jump / history restore | Neo owns the excursion, currentness checks, and final geometry | Managed mark reports one exact-view final destination; restore producers are Traverse children | Managed final / Traverse |
| Reader page-turn or Neo smooth-scroll motion | No universal hard-point callback; Neo smooth hold owns its actual stop, and the exact view exposes native scroll settling | Default-ignored motion takes the history-free path; a promoted supported motion waits for its real owner and exact-view settle/capture | Ignore by default; promoted motion uses settled change, never a fabricated hard save |

The bridge wraps the exact native producer and keeps the original receiver,
arguments, return value, Promise identity, and rejection behavior. The pinned SDK
producer awaits `debounceUntilScrollFinishes()` and calls terminal
`_history.save()` immediately before its original Promise fulfills. Native hard
emission uses a PDF `queueMicrotask` publish/clear boundary and associates the
receipt through the **direct** `original.then` terminal callback—not Promise
adoption, a FIFO queue, save cardinality, or a matching XYZ guess. Synchronous
producer saves are handled in the producer frame. Receipt stamps include the
exact patch, window, history, and view identities; the captured hard destination
must match the settled final geometry.

Label navigation has a separate pinned private seam: `_pageLabelsPromise` is an
own writable field, and the SDK performs exactly one await before movement and
producer invocation. A request-specific native-realm thenable transports the
immutable invocation across that await using the PDF continuation microtask;
the original field is restored immediately. Nested tags unwrap to the original
Promise, and exact patch/window/history/view stamps reject retired continuations.
No label-parser copy or global Promise patch is used.

Owned request/callback scopes carry the immutable operation token only across
their registered work. A closed, ignored, superseded, or retired owned scope
remains owned and rejected; it never falls through to the detached-native rule.
Raw save observation updates the native/transient baseline but is not a commit
entrance. A genuinely detached native producer enters only through
`NavigationPort.observeNative()` while its owning Reader tab is selected and its
exact receipt is current. Split focus is irrelevant to that eligibility. If no
Main navigation port or exact owner exists, the bridge produces no synthetic
Main token/history. Unsupported owned transport rejects rather than falling back
to generic native recording.

This is pinned private Zotero/Reader behavior, not a stable public API. Revalidate
the wrapper, terminal-save order, callback/request ownership, and save emission
boundary against each supported stable host update. No generic native fallback
or copied native navigation body is permitted.

Ordinary page-turn or Neo-owned smooth-scroll motion promoted to Record uses
the motion owner's real completion and exact-view settle/capture. Smooth holds
complete on the scroller's stop callback. Do not fabricate a native hard save;
keep native hard-save observation independent of recording policy.

## Location and restoration contract

Reuse current DOM-free locations:

- Library: scope IDs, Quick Search text, tags, Advanced Search existence, stable Cursor item, and panel.
- Reader: stable library/item identity, tab lookup hint, and optional exact primary/secondary page index plus top/left.
- Other/Note tabs: tab identity and native retained position.

No persistent Main Selection, zoom/layout, Note caret, or synthetic reconstruction of lost Advanced Search conditions is added. Exact existing equality and the 100-location limit remain authoritative. An identity-only Reader entry can be refined; cold loading is not another jump.

Restore uses the same coordinator and adapters with a Traverse root. Reuse readable closed attachments and remap all matching historical tab hints. Native history suppression is applied only to managed restore, not to Ignore policy for normal commands.

Library restore remains ordered: tab, scope, Quick Search, tags, Advanced Search availability, Cursor, focus. Failure leaves the index unchanged but does not undo earlier UI mutations. Report partial/stale honestly.

Add explicit currentness guards at effect/feedback boundaries:

- A Selection Panel reveal can close or update only the panel invocation that started it, not a newly reopened panel.
- Reader restore's geometry verification and final focus must use the same exact view/window identity. A replaced view must produce Stale/Unavailable rather than successful index movement.
- A chooser callback retains its originating surface/target context even if focus moved to its input.

Currentness guards are part of the implemented attempt/context contract: panel feedback remains scoped to its originating invocation; Reader restore geometry and focus share exact view/window identity; chooser callbacks retain their originating surface and target even after focus changes.

## Lifecycle and performance

- One navigation session per Main window; no second session registry in Reader or coordinator. Window disposal invalidates its epoch and discards history.
- Reader view replacement retires view-bound work and restores only patches owned by Neo. Do not overwrite another component's newer patch.
- Tokens are in-memory references/IDs, not persisted history and not chrome objects passed into content. Host payloads remain cloned through existing adapters; use chrome `Reflect.apply` for native invocation.
- Keep hard/transient baseline updates even when recording is disabled. Native calls, results, exceptions, and native history are preserved.
- Default-ignored motion performs a cheap policy/path check and uses the existing executor without full library/PDF snapshot capture, history array copies, a Promise, or a completion observer allocated solely for history. Reuse installed view observation rather than installing a listener per key. Owned native work still needs provenance when recording is off; allocate deferred receipts/tokens where execution ownership requires them, not an entire history snapshot/completion pipeline for every ordinary motion.
- Producer/operation metadata is scoped to pending work, with deterministic cleanup on completion, cancellation and disposal. No unbounded ticket log, user-facing telemetry, new retry system, or global Promise patch.

## Implementation state and acceptance

The cutover described above is implemented across Main, Note, Reader, native observation, and traversal. `NavigationHistoryState`, `history-policy.ts`, and `NavigationCoordinator` are the real shared owners; `MainNavigationExecutor` builds Main operations and location adapters, while `NavigationPort.execute()` / `observeNative()` are the only public recording entrances. No old recording wrappers or parallel Reader stack are retained.

The runtime separates host completion from history append. Its inline, serial-navigation, and serial-traversal lanes preserve their respective launch/capture boundaries; immutable cause/currentness and completion fences prevent retired ownership from being reclassified as native. The Reader bridge uses the pinned private producer/callback protocol described above, including selected-tab eligibility and the no-hard successful-completion case.

Integrated verification ran formatting, both strict TypeScript projects, 72 Vitest files / 675 contracts, deterministic esbuild/XPI packaging, and the 12-member package check. Subsequent deferred-fixture conversions also passed both TypeScript projects and all 39 affected Main-history/Reader-restore contracts.

Supported-host smoke used Zotero 10.0.5 / Gecko 140.15.0 in the dedicated development profile, with trusted native Gecko text input and actual refresh/viewport observation. Exercised page jumps and Back/Forward, inline tab chains and rapid Back, chooser cancel/current/changed confirmation, Items versus Collections boundary recording, a closed readable attachment reopen/remap without duplicate tabs, managed marks, ordinary ignored motion, and a selected Reader's unfocused secondary pane. Policy-only acceptance variants preserved H/G host effects and native hard history while retaining the Neo Forward suffix; promoting a smooth hold recorded its actual settled geometry without a hard point; promoting search recorded a distinct owned destination with zero producers/hard points.

The final uninstrumented default build was cold-started and exercised `5gg`, `G`, Back/Forward, native page-number Enter and shared traversal, default non-hard search, and the annotation-empty no-op. Native viewport geometry and a Gecko surface snapshot were observed; temporary diagnostic exports and policy variants were removed. The Windows desktop was locked, so this was native Gecko automation, not physical desktop-key verification. No note or annotation mutation fixture was created; those routes and lifecycle/reentrancy/error boundaries are covered by automated contracts rather than a claim that every matrix row received manual GUI testing. Private SDK assumptions must still be revalidated on supported-host updates.

The uncounted Reader `G` boundary subsequently changed to a single native XYZ destination at the last page's bottom, derived through the active page viewport's PDF-coordinate transform. Counted `nG` and `gg` retain page-start semantics and zoom remains unchanged. Focused contracts cover primary and rotated secondary geometry; supported-host smoke observed the primary document end and a secondary view at its actual maximum scroll, with Back/Forward restoring the recorded bottom in that same pane. A native receipt that disagrees with settled geometry remains non-recording; the new boundary does not weaken that evidence rule.

The matrix below remains the regression contract; the historical proposal models do not replace implementation or host evidence.

## Acceptance matrix

| Scenario | Required observable result |
| --- | --- |
| Inline H/L `A -> B -> C` | Captures B before the second command; history traverses A/B/C, not A/C. |
| Tab chooser open/browse/cancel/current tab | No new entry; Forward suffix retained. |
| Changed tab confirmation | Same policy and commit path as H/L, one entry, shared post-switch maintenance. |
| Record disabled for H/L or a Reader page action | Same host navigation; no append/truncation; native history unchanged; no generic native fallback. |
| Main `gg/G` in Items vs Collections | One central context rule controls recording; counts unchanged. |
| Main prompt commit vs `n/N` | Named commit cause and action repeat causes work independently; misses/empty/cancel unchanged. |
| Reader search/annotation-selection completion without hard save | Completion/no-op is explicit; default hard-point policy does not append or wait forever. |
| Reader non-hard destination deliberately enabled | Changing its central evidence rule to settled change records only a verified owned destination, with no invented native save. |
| Search callback reentrancy/native search replaces request state | Correct immutable request ownership or explicit stale rejection; latest `_state` is not borrowed as the cause. |
| Default-ignored motion | No history capture/Promise cost solely for history; later recorded jump uses actual departure. |
| Supported motion promoted by policy | Real settled destination records without adding per-command history wrappers or fabricating native saves. |
| Two queued Main requests | Superseded waiting request never executes; running stale host work drains; latest captures actual departure at start. |
| Back behind pending Main or Reader jump | Waits its actual completion; computes target then; no phantom destination. |
| Rapid Back/Back or Forward/Forward | Shared epoch, sequential targets; no self-invalidation or self-record. |
| New explicit Reader jump during older Main work | Documented launch-time supersession; older result cannot append/claim success. |
| Late native producer of ignored/stale/completed root | Native original still runs; no new entry and no reclassification as native. |
| Native UI navigation during owned deferred work | Its own native cause/currentness, not the owned command's policy; source/destination correct. |
| Detached native work without a current Main port/exact owner | Do not fabricate a Main token or history entry; unsupported owned transport rejects instead of generic native fallback. |
| Reversed producer completion | Correct immutable ownership or explicit stale rejection; no FIFO/timeout/XYZ attribution. |
| Mark excursion and new ordinary Reader input | One final record on success; ordinary input retires mark ownership without requiring history epoch change. |
| Selected Reader's unfocused secondary view | Qualifying native destination remains eligible; exact pane preserved. |
| Closed readable Reader target | Same-window attachment reopen, correct XYZ/pane, all tab hints remapped, no duplicate tabs. |
| Restore view replaced between verification and focus | Stale/Unavailable, index unchanged, no focus on a replacement claimed as success. |
| Reveal panel closed/reopened while pending | Old completion cannot close/update the new invocation. |
| Missing tab/item/scope/geometry/condition set | Explicit unavailable/partial result, index unchanged, no invented snapshot. |
| Window/view disposal | No append, resurrection, cross-window fallback, leaked callbacks or owned patches. |
| Native original rejects or save capture fails | Original result/rejection semantics retained; no commit; diagnostics cannot break host execution. |

Permanent tests should assert location/order/target/currentness outcomes and real adapter/observer composition, not source strings or calls to a wrapper. Toggle tests must assert both preserved navigation effects and changed history behavior.

## Historical proposal evidence, limits, and rejected alternatives

The following records proposal-time validation only; it is not current implementation, test, GUI, CI, or integrated-acceptance evidence. Design validation used an in-memory contract model with the then-current `MainJumpHistoryState`. Eleven exercised scenarios passed: inline ordering, no-op Forward preservation, policy-only suppression, Items context, retired and ignored native ownership, queued source capture after stale drainage, Reader completion fence, traversal batches, origin replacement, and queue rejection recovery. This verifies the proposal's coordination invariants against that historical stack; it is **not** proof of current runtime behavior or native provenance transport.

Three additional proposal-time evidence-rule model cases passed against that historical stack: a completed non-hard destination preserves the default no-record/Forward suffix, an owned hard receipt meets `native-hard`, and an explicit `settled-change` policy records without a native hard point. These are contract-model checks, not tests of implemented policy code. The model does not prove Reader transport or the ordinary-motion allocation fast path.

At proposal time, read-only review identified mark-input cancellation, selected-tab versus split-focus eligibility, and unsupported Reader fallback as preservation requirements. Host inspection and the pinned stable source established settled hard-point timing and search's separate callback route. A later RDP connection was unavailable at that proposal stage; the user application was not restarted or changed for that plan. That historical note does not describe the subsequent implementation work.

Rejected alternatives:

- Separate public synchronous/async history APIs: callers should express navigation, not choose recording machinery.
- Universal `await`: loses immediate source/destination ordering and still cannot prove native settling.
- A boolean on every ActionId alone: lacks context, confirmation events, native causes and actual adapter enforcement.
- A policy table used only for documentation: does not change runtime eligibility.
- Recording both explicit Reader navigation and raw native saves: duplicates roots and ignores policy-off semantics.
- A view-global current action, arbitrary timer, FIFO producer queue, or XYZ match as provenance: delayed/concurrent/native work can be assigned to the wrong action.
- Disabling Neo recording with native `skipHistory`: changes Zotero's own history.
- A second Reader stack, generic event bus/Completion Engine, global Promise patch, or copied native navigation body: unnecessary coupling or host risk.
