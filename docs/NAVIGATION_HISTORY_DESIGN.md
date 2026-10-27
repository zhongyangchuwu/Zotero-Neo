# Unified Navigation Execution and History Policy

Neo keeps one bounded navigation history per Main window. `NavigationHistoryState` owns its locations and traversal index; `NavigationCoordinator` applies typed policy and owns admission, dispatch, completion, and commits. Neo-initiated operations use `NavigationPort.execute()`; already-running native Reader navigation is observed through `observeNative()` rather than redispatched. See [Navigation and the shared jumplist](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) for command behavior and [Development Guide](DEVELOPMENT.md#runtime-architecture) for private Reader transport constraints.

## Contents

- [Intent and decisions](#intent-and-decisions)
- [Ownership and dependency direction](#ownership-and-dependency-direction)
- [One execution contract](#one-execution-contract)
- [One history policy source](#one-history-policy-source)
- [Admission, scheduling, and completion](#admission-scheduling-and-completion)
- [Reader provenance and native completion](#reader-provenance-and-native-completion)
- [Location and restoration contract](#location-and-restoration-contract)
- [Lifecycle and performance](#lifecycle-and-performance)
- [Acceptance matrix](#acceptance-matrix)
- [Design tradeoffs](#design-tradeoffs)

## Intent and decisions

The design centralizes Neo's navigation-history decisions without changing host navigation semantics: actions and semantic events use one policy, operations use one coordinator path, and adapters supply the completion evidence their route supports. Synchronous and deferred execution share one interface.

1. `history-policy.ts` is the typed source for action and event recording policy. Unconfigured actions default to Ignore.
2. `NavigationCoordinator.execute()` is the Neo-initiated execution and commit path. Native Reader work that already ran is observed through `NavigationPort.observeNative()`, not redispatched.
3. Adapters declare inline, serial-navigation, or serial-traversal dispatch before host work and return immediate or deferred completion. An arbitrary host Promise is not settled-destination evidence.
4. `NavigationHistoryState` is the per-window bounded stack, with a 100-location limit and shared equality, refresh, and Reader-tab remapping rules.
5. Each admitted operation carries immutable cause and execution ownership. Delayed callbacks and native producers retain that ownership; ignored, superseded, completed, or disposed work never becomes generic native navigation.
6. Evidence requirements are context-sensitive. A completed host operation is distinct from a recorded transition; explicit Reader navigation establishes its epoch at launch, and Back/Forward waits for admitted Reader completion.
7. Direct ports connect the coordinator to adapters. Neo's Ignore policy does not suppress Zotero's own native history.

**Scope:** policy centralization, navigation execution/completion, provenance, cancellation, and caller migration. **Not in scope:** new bindings/count semantics, recording every native tab click, persistent history, zoom/layout/Note-caret snapshots, full UI rollback, or external plugin APIs.


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

Current module responsibilities:

| Module / owner | Responsibility | Must not own |
| --- | --- | --- |
| `src/navigation/types.ts` | DOM-free locations; typed causes, intents, tokens, outcomes, and completion contracts | Input matching or host execution |
| `src/navigation/history-policy.ts` | Action/event recording decisions, context predicates, and evidence requirements | Queues, target mutation, or host patching |
| `src/navigation/coordinator.ts` | Admission, dispatch lanes, currentness, completion fences, and the private commit path | Picker search/ranking or Reader geometry algorithms |
| `src/navigation/history.ts` | Per-window bounded stack, equality, refresh, movement, and Reader tab remapping | Cause classification or host calls |
| `MainNavigationExecutor` in `src/main/jump-history.ts` | Main/tab operation building and library capture/restore through `src/main/navigation.ts`, `src/toolkit/main/`, and View owners; delegates commits to the coordinator | History policy or direct append |
| Reader feature owners in `src/reader/` and private adapters in `src/toolkit/reader/` | Semantic traversal and exact-view PDF execution, restoration, and producer provenance | A second traversal stack or recording policy |
| `src/addon.ts` and Main window lifecycle | Compose ports and attach/dispose the one navigation session | A second window registry or cross-window fallback |

These are responsibility boundaries, not a requirement to create a file for every method. MainWindowSession remains the lifecycle owner. Reader and Note use its navigation capability through the existing composition boundary; they do not borrow Main Selection or redispatch an ActionId merely to execute it.

Reader feature owners choose semantic targets, traversal, and recording context. Private Reader producer transport lives in `src/toolkit/reader/history-bridge.ts`, PDF host execution and restoration in `src/toolkit/reader/jump-host.ts`, and Main tree/tab/filter capabilities under `src/toolkit/main/`. Toolkit adapters expose opaque view identity and host results rather than raw SDK objects.

## One execution contract

Representative execution and result declarations from `src/navigation/types.ts`:

```ts
export type NavigationEvidence = 'settled-change' | 'native-hard' | 'managed-final';

export type HistoryDecision =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'traverse' }
  | { readonly kind: 'record'; readonly evidence: NavigationEvidence };

export type NavigationOutcome =
  | {
      readonly kind: 'completed';
      readonly evidence: NavigationEvidence;
      readonly destination?: NavigationLocation;
      readonly targetIndex?: number;
    }
  | { readonly kind: 'unchanged' | 'unavailable' | 'cancelled' | 'stale' }
  | { readonly kind: 'failed'; readonly error: unknown };

export type NavigationCompletion =
  | { readonly kind: 'immediate'; readonly outcome: NavigationOutcome }
  | { readonly kind: 'deferred'; readonly settled: Promise<NavigationOutcome> };

export interface NavigationOperation {
  readonly dispatch: 'inline' | 'serial-navigation' | 'serial-traversal';
  readonly admission?: 'replace' | 'motion';
  readonly capture?: () => NavigationLocation | null;
  readonly destinationPanel?: 'collections' | 'items';
  start(attempt: NavigationAttempt): NavigationCompletion;
}

export type NavigationResult = NavigationOutcome & { readonly recorded: boolean };

interface NavigationExecutionOwnership {
  isCurrent(): boolean;
  cancel(): void;
}

export type NavigationExecution = NavigationExecutionOwnership &
  (
    | { readonly pending: false; readonly result: NavigationResult }
    | { readonly pending: true; readonly result: Promise<NavigationResult> }
  );

export interface NativeNavigationReceipt {
  readonly source: ReaderJumpLocation;
  readonly destination: ReaderJumpLocation;
  readonly isCurrent: () => boolean;
}

export interface NavigationPort {
  execute(intent: NavigationIntent, operation: NavigationOperation): NavigationExecution;
  observeNative(receipt: NativeNavigationReceipt): void;
}
```

`NavigationCoordinator` is the class in `src/navigation/coordinator.ts`; the port is its adapter-facing capability, not a second coordinator interface. `NavigationIntent` carries a cause, surface, and optional transient context. At admission, the coordinator copies and freezes the cause and context wrapper; semantic targets must not be read later from whichever input has focus. Window/session currentness is checked at the host boundary, while exact Reader view and callback ownership stays with adapters rather than history locations.

`NavigationAttempt` exposes the immutable token, policy decision, currentness check, and cancellation. Operation IDs and history epochs are separate: consecutive Back requests have different IDs but share an epoch. Reader callback binding and lifecycle cleanup belong to scoped bridge/adapters, not to a public callback-binding method on the attempt.

Completed outcomes carry evidence and may carry a destination or traversal target. Reader adapters require the exact producer/view receipt and settled final geometry for `native-hard`; geometry change alone is insufficient. Host completion and append are separate: missing snapshots, equality, or unmet evidence policy can yield `recorded: false`. Unexpected host failures are reported; stale work does not publish a current result.

The coordinator captures the destination synchronously for an immediate outcome. A deferred outcome settles only when the adapter reports its real completion. Callers receive the same `NavigationExecution` shape in both cases; async UI callers may await a pending result, while key dispatch need not create a Promise for immediate navigation.

### H/L and chooser use the same interface

- `H/L`: resolve a relative tab operation and call `execute()` immediately.
- Chooser: opening/query/browsing do not call `execute()`; its semantic confirmation supplies the selected tab operation and original surface.
- Both use the same tab adapter and post-switch maintenance. The adapter synchronously checks the actual selected ID. It owns Reader rescans/focus maintenance for both relative and absolute selection.
- History captures the source at execution, not when the chooser was opened. Candidate providers remain data-only. Capture-to-note reuses a Notes provider but is a content mutation, not a `findNotes` navigation.

## One history policy source

`history-policy.ts` contains typed action rules, event rules, and named predicates. Policy decisions are Record, Ignore, or Traverse. A Record rule also declares its required completion evidence: `settled-change`, `native-hard`, or `managed-final`. Cheap cause/context/path checks resolve eligibility before source capture; the private commit checks the receipt against the evidence requirement after completion. Traverse is a semantic role that cannot be converted into append by a flag.

For example, `mainNavFirst` records only when the intent is for Main's Items panel; the operation still moves the cursor and does not decide whether the move enters history. A shared ActionId can use different context/path rules: `findNext` is `settled-change` in Main Items and `native-hard` on the Reader search path.

Default recording policy by cause and context:

| Cause | Context / moment | Default policy |
| --- | --- | --- |
| `previousTab`, `nextTab` | Actual selected-tab cycle, Main/Reader/Note | Record |
| `switchTab` | Successful chooser confirmation only | Record |
| `mainNavFirst`, `mainNavLast` | Main Items; Collections is excluded | Record when Items |
| `findNext`, `findPrevious` | Main visible-row repeat / Reader supported search destination | Main: settled change; Reader: owned native hard point only |
| `main-local-find.confirm` | Main Items: Enter commits the query and moves to the first match | Record |
| `mainOpenPDF` | Main Cursor or captured Note-context target | Record after successful navigation |
| `mainActivate` | Items opens Cursor; Collections Enter confirms the tree cursor's scope | Record after a settled change in either panel |
| `findAllItems`, `findCollectionItems`, `findNotes` | Semantic chooser confirmation, not provider/query activity | Record |
| `findCollections` | Confirmed Main collection candidate, not Picker query/browsing | Record after native scope selection settles |
| `main-selection-panel.reveal` | Available member revealed by this panel invocation | Record |
| `firstPage`, `lastPage` | Supported explicit Reader page path | Record on owned native hard point |
| `prevAnnotation`, `nextAnnotation` | Supported Reader destination, not mere selection UI | Record on owned native hard point |
| `followLink` | Confirmed internal/citation destination; external URL excluded | Record on owned native hard point |
| `reader-mark.jump` | One managed mark excursion; set/delete/browse excluded | Record once on managed final destination |
| `reader-native.hard` | Unowned non-transient native destination, including Zotero-native Outline navigation, in the selected Reader tab | Record on qualifying native hard point |
| `navigateBack`, `navigateForward` | Counted or uncounted traversal | Traverse, never append |
| Main item-tree `j/k`, Reader `h/l`, scroll/viewport motions | Navigation-capable ordinary movement | Ignore by default |
| Main Collections `j/k`, first/last, and expand/collapse | Tree cursor/scope movement without explicit confirmation | Ignore |
| Native tab-bar selection/close; unconfirmed native scope/filter changes | Not current standalone jump events | Ignore |
| Selection/caret editing, zoom/layout, annotation/tag/item mutations, temporary-surface launch/browse | Not navigation destinations | No recording rule |

For a collection destination, `mainActivate` in the Collections pane is Enter on the tree cursor. Its native scope ID (including library roots and saved searches) is captured synchronously at admission, never a row index or a later cursor. Native selection remains lazy in the serial lane, with departure captured at its eligible queue turn. `findCollections` records only a confirmed candidate; both use native scope selection completion, and a transition is eligible only after Zotero's `onCollectionSelected()` and the rendered Main item view agree on the target scope. Opening or searching the Picker is not a visit.

Collection-tree `j/k`, first/last, and expand/collapse do not append history. Single-scope native tree motion can change the actual Scope before Enter, so Main retains the pre-motion Library location only as a possible source for the following `mainActivate`. It reuses that snapshot only while the focus epoch, history revision, selected tab ID, and expected native Scope IDs still match. Expansion/collapse merely ensuring already-owned tree focus does not start a new focus epoch; explicit focus commands and actual native focus transitions still delimit visits. A changed scope confirmed by Enter is eligible as one new visit after native scope completion; a fence mismatch prevents reuse and captures the actual current location instead.

A named event is used where there is no executable ActionId; do not invent an ActionId merely to fit policy. Delayed chooser callbacks carry their semantic action cause. Link-hint activation carries its owning navigation cause; native Outline actions follow Zotero's native navigation and use the existing `reader-native.hard` observation.

The Reader hard-point default does not imply that every listed command emits a hard point. In the inspected Zotero 10.0.5 source, search's `_onNavigate` calls `navigateToPosition()` without a hard save, and `setSelectedAnnotationIDs()` updates selection without declaring a destination. Those routes may complete successfully without an entry. Their adapters return the real completion/no-op and preserve ownership; no settled-change entry is inferred without changing the evidence rule and establishing that route's completion/provenance contract.

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

An admitted explicit Neo Reader jump establishes its window epoch at launch, like a Main jump. This supersedes older explicit work even if recording for the new action is disabled. The Reader host call still dispatches inline; deferred completion registers a fence for later Back/Forward without queueing the jump itself. Back/Forward waits for that actual outcome, then computes its target from resulting history. This separates launch-time supersession from the recording policy and queued host dispatch.

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

Native observation admits window work at completion: the producer ticket captures source, view, and native cause at invocation, but only an eligible, changed, current completion admits a native history root and supersedes window work. An owned ticket never becomes such a root, even after its original epoch ends. Background/cold-initialization observations only update their baseline. Native observation remains separate from explicit Neo Reader jump scheduling while sharing the private commit path.

## Reader provenance and native completion

Reader transport needs producer and callback ownership because a delayed native save does not identify the Neo action that caused it. The private method observations here are pinned to Zotero stable **10.0.5** and Reader submodule `9d821fa2c1941bdfdd7bee3199936401b45be852`: [PDF view](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-view.js) and [find controller](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-find-controller.js). This identifies the inspected source version, not current-host acceptance; revalidate private assumptions on each supported host update. In that source, PDF `navigate()` invokes `_pushHistoryPoint()` without awaiting it. That producer waits for scroll settling, reads actual PDF XYZ geometry, and then saves native history, so `await navigate()` is not settled-destination evidence. Search uses `_findController`, not upstream master's newer grouped-navigation/search APIs; the bridge associates a hard save with the exact producer's terminal completion rather than inferring it from `navigate()` or a global save queue.

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

| Route in inspected Zotero 10.0.5 source | Source behavior | Adapter ownership/completion boundary | Default recording evidence |
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

For a nonempty Main ScopeSet, scope selection and restoration wait for the pane's canonical `onCollectionSelected()` completion rather than relying on a selection event or matching IDs alone. They compare settled selected IDs with the native `itemsView.collectionTreeRows`; selection also waits for the item-view load, and history restoration waits for that load before applying filters, Cursor, and focus. A replaced pane/view or mismatched rendered scope cannot complete as a successful visit.

Currentness guards apply at effect and feedback boundaries:

- A Selection Panel reveal may close or update only the panel invocation that started it, not a newly reopened panel.
- Reader restore geometry verification and final focus use the same exact view/window identity. A replaced view is Stale/Unavailable rather than a successful index move.
- A chooser callback retains its originating surface and target context even if focus moves to its input.

## Lifecycle and performance

- One navigation session per Main window; no second session registry in Reader or coordinator. Window disposal invalidates its epoch and discards history.
- Reader view replacement retires view-bound work and restores only patches owned by Neo. Do not overwrite another component's newer patch.
- Tokens are in-memory references/IDs, not persisted history and not chrome objects passed into content. Host payloads remain cloned through existing adapters; use chrome `Reflect.apply` for native invocation.
- Keep hard/transient baseline updates even when recording is disabled. Native calls, results, exceptions, and native history are preserved.
- Default-ignored motion performs a cheap policy/path check and uses the existing executor without full library/PDF snapshot capture, history array copies, a Promise, or a completion observer allocated solely for history. Reuse installed view observation rather than installing a listener per key. Owned native work still needs provenance when recording is off; allocate deferred receipts/tokens where execution ownership requires them, not an entire history snapshot/completion pipeline for every ordinary motion.
- Operation and producer metadata exists only while work is pending and is cleaned on completion, cancellation, and disposal.


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

## Design tradeoffs

The shared operation and evidence contract avoids several tempting but unsafe alternatives:

- Separate synchronous and asynchronous history APIs would make callers choose storage machinery; one operation contract lets adapters report immediate or deferred completion without changing the recording path.
- Unconditionally awaiting host work can lose immediate source/destination ordering and still does not prove that a native Reader destination settled.
- A boolean per ActionId or a policy table used only for documentation cannot express context, confirmation events, native causes, or enforce evidence requirements at commit time.
- Recording both Neo-owned Reader completion and raw native saves can duplicate roots and make policy-off work appear as generic native navigation.
- A view-global current action, arbitrary timer, FIFO producer queue, or matching XYZ position cannot reliably attribute delayed or concurrent producers; ownership is tied to the exact producer and view instead.
- Native `skipHistory` is not Neo's Ignore policy because it changes Zotero's own history.
- A second Reader stack, generic event bus/completion engine, global Promise patch, or copied native navigation body duplicates state or risks changing host behavior; direct ports and narrow adapters preserve the original call.
