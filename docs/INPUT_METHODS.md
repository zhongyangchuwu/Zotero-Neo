# Text input and IME ownership

Zotero Neo targets the latest stable Zotero release and relies on Gecko's native text-input stack for editable queries.

## Rule

Any Neo surface that accepts arbitrary text uses a real `<input>` as the source of truth:

```text
OS / IME
  -> HTMLInputElement
  -> committed input.value
  -> Neo matching / completion
```

Neo does not reconstruct editable text from `keydown` characters. While composition is active, candidate-navigation and confirmation keys belong to the IME and must not be interpreted as Neo commands. The shared guard checks the local composition lifecycle together with Gecko's `KeyboardEvent.isComposing` state and the platform `Process`/229 fallback before any Neo command is dispatched.

The shared boundary lives in `src/input/composition.ts` and is used by:

- chooser search inputs, including action-specific tag candidates;
- Reader Flash text targeting;
- Note editor composition guards where Neo and native editing share key ownership.

## Shortcut controls and native text ownership

Local shortcuts are not a second text-input system. Each surface qualifies its
focused target, native/editable ownership, composition state, and exact context
before passing an event to the shared matcher. A native-reserved token cancels
the pending local sequence too; every token in a multi-key sequence must remain
executable by Neo. Focus or pointer handoff to a native surface retires pending
PDF/local matches. Read-only native shortcut disclosures are context-labeled and
do not imply that unbinding a Neo action disables Zotero's own shortcut.

Picker and Plugin Manager query inputs and lists are distinct owners. Input keys
that edit or move the caret, native copy/paste/undo shortcuts (including
`Ctrl+Insert` and `Shift+Insert`), committed query text, and IME composition stay
with the actual input and Gecko. Only owner-supported Neo actions are configurable
there; query text is never a list command. `plugins-input` supports only the
`uiFocusList` handoff (Escape by default), not list navigation. The separate
`plugins-list` context owns list controls and implemented Plugin Manager actions.

In the Reader Outline, native arrows, Tab, and Enter/Return—including modified
Enter—remain Zotero-owned. `uiConfirm` is available but default-unbound and may be
remapped to another non-reserved key. Native annotations, Bookmarks, and Thumbnail
panels likewise retain native arrow and Tab behavior. Composition and editable
targets always yield to the host rather than being consumed as Neo shortcuts.

## Flash

Flash keeps its existing literal visible-text matcher, NFKC normalization, smartcase behavior, target limit, and ASCII hint labels. Its text query now comes from a focused real input. Normal text editing, including Backspace and composition, remains browser-owned; Neo only intercepts actual Flash commands and unambiguous hint labels.

Flash intentionally does not add fuzzy matching, transliteration, OCR, or language-aware tokenization.

## Compatibility

Only the latest stable Zotero is in the supported compatibility matrix. Legacy Gecko/Zotero input polyfills are not maintained.
