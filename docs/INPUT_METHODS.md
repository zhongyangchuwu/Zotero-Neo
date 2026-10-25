# Text input and IME ownership

## Text-entry controls

Queries in Picker/tag-candidate inputs, Plugin Manager, and Reader Flash use real
`<input>` controls. The annotation-comment editor uses a `<textarea>`, and Note
text remains in Zotero's native editor. Settings shortcut recording qualifies
keys rather than treating them as query text.

For query controls, Neo reads committed input values for matching/completion:

```text
OS / IME -> browser input -> committed value -> Neo query or completion
```

`src/input/composition.ts` tracks composition and provides shared guards.
`compositionOwnsKey()` yields while local composition is active,
`KeyboardEvent.isComposing` is true, `event.key` is `Process`, or `keyCode` is
229. `isCommittedInput()` excludes active or event-level composition. Use these
boundaries before dispatching Neo commands; while composing, candidate navigation,
confirmation, Escape, and Backspace belong to the browser/IME.

The shared guard is used by the Picker, Plugin Manager, Reader Flash and
annotation-comment input, Note input guards, and Settings shortcut recording.
Remove its listeners with the owning control's lifecycle.

## Native and local shortcut ownership

Local shortcuts are not a second text-input system. Each host qualifies its
focused target, native/editable ownership, composition state, and exact context
before matching. A native-reserved token cancels the pending local sequence;
every token in a multi-key sequence must remain executable by Neo. Focus or
pointer transfer to a native surface retires pending local matches.

Query-input and list contexts are separate owners. Text editing, caret movement,
committed query text, native copy/paste/undo, and IME composition stay with the
actual input and Gecko. A Neo unbinding does not disable a Zotero-native shortcut.
In the Reader Outline, native arrows, Tab, and Enter/Return—including modified
Enter—remain Zotero-owned; native Annotation, Bookmarks, and Thumbnail panels
also keep their arrow and Tab behavior.

The native **Add Item by Identifier** popup owns input while showing, open, or closing. Neo retires its pending Main sequence and leaves text, paste, IME, Enter/Shift+Enter, Escape, and popup-menu keys to Zotero instead of applying the generic editable-field Escape behavior. This is native text entry, not a new Neo mode or binding context.

## Reader Flash

Flash takes its query from a focused real input. Normal text editing, Backspace,
and composition remain browser-owned; Neo consumes committed query values, Flash
commands, and unambiguous hint labels. The matcher is limited to visible text in
the active PDF view; it does not add OCR, transliteration, or fuzzy query matching.

## Compatibility

The physical OS-IME candidate window and native keyboard/focus behavior remain
separate host-acceptance work; see
[#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137).
