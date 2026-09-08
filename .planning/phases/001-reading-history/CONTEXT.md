# Phase 1 Context: Reading History

## Product Decision

`Ctrl-o` and `Ctrl-i` bridge to Zotero's native reader location history. Zotero Neo does not maintain a second jump stack.

## Behavior

- Reader Normal `Ctrl-o`: navigate backward through Zotero's location history.
- Reader Normal `Ctrl-i`: navigate forward through Zotero's location history.
- Empty history is a safe no-op; if the host exposes enough state to distinguish it, show concise status rather than an error.
- Missing or incompatible private APIs show `History unavailable` and never throw through key handling.
- Each reader/tab uses Zotero's own history ownership, so reload and multi-tab behavior remain independent.

## Input Boundaries

- Do not consume these bindings in Insert mode or arbitrary editable elements.
- Temporary picker/explorer/modal input precedence remains unchanged.
- Preserve the existing reader key-forwarding patch so Zotero does not re-handle a key that Neo successfully consumes.

## Architecture

- Add actions to the existing bindings, preference table, labels, and dispatcher.
- Discover and invoke the smallest verified native reader history seam; do not introduce a custom history abstraction or persisted state.
- Guard private API access at invocation time for Zotero 7–10 compatibility.

## Verification Boundary

Build checks cannot prove history behavior. Actual Zotero verification must include a link jump, back, forward, empty history, reload, multiple reader tabs, and editable input.
