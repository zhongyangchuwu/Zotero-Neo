# Repository Conventions

**Mapped:** 2026-09-08

## JavaScript style

- Two-space indentation; semicolons are used consistently.
- Object literals and `Object.assign`; no ES6 classes.
- Globals are declared at file tops with `/* global ... */` comments.
- Internal methods use an underscore prefix; constants use uppercase names.
- `content/zoteroVim.js` and runtime files prefer single quotes; preference scripts use surrounding double-quote style.
- Section dividers use ASCII box-drawing comments.
- Keep lines near 100 characters when practical.

## Architecture rules

- Reader-specific values live in per-reader state maps, never module-level shared variables.
- Main/picker/note state lives in per-window state.
- Cross-compartment objects and arrays are cloned into the target window.
- Native Zotero behavior is bridged before reimplementation.
- Private Zotero APIs are guarded with optional chaining, type checks, and catches.
- All lifecycle-created listeners, timers, DOM elements, and wrappers need cleanup/restoration.

## Error handling

- Expected non-critical failures may use `try { ... } catch (_) {}`.
- Unexpected failures log through `Zotero.debug('[ZoteroNeo] ...')`.
- User-visible recoverable failures use `_showStatus` in readers or `_mainShowStatus` in the main window.
- Hot keydown paths avoid per-keystroke debug spam.

## Binding contract

- Runtime defaults live in `content/zoteroVim.js` as `DEFAULT_BINDINGS`.
- Preference defaults mirror them in `content/prefs.js` as `ZV_DEFAULT_BINDINGS`.
- Every default action needs an English label in `ZV_ACTION_LABELS` and a Chinese label in `ZV_I18N_ACTION_LABELS`.
- `tools/check-sync.js` enforces exact default parity, duplicate detection, supported modes, and label parity.
- Multi-key sequences are represented directly in `mode:key-sequence` strings; literal space is the leader prefix.

## Input safety

- Main and reader handlers return early for inputs, textareas, contenteditable elements, and Zotero-native editors.
- Insert mode passes through everything except Escape.
- Reader keys consumed by Neo must also be suppressed from Zotero's private forwarding callback.
- Overlays own their focused input and navigation keys, restore prior focus, and remove handlers on close.

## Verification

- There is no automated GUI test suite.
- Build both checks syntax/table synchronization and packages an XPI when Node is available.
- Runtime proof requires installing the XPI, restarting Zotero when required, and exercising changed behavior manually.
- Core input changes require main, reader, note, editable-field, split, tab, and optional-integration regression coverage.
