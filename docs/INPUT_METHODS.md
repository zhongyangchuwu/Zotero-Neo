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

- Picker search inputs;
- Tag Workspace search/create input;
- Reader Flash text targeting.

## Flash

Flash keeps its existing literal visible-text matcher, NFKC normalization, smartcase behavior, target limit, and ASCII hint labels. Its text query now comes from a focused real input. Normal text editing, including Backspace and composition, remains browser-owned; Neo only intercepts actual Flash commands and unambiguous hint labels.

Flash intentionally does not add fuzzy matching, transliteration, OCR, or language-aware tokenization.

## Compatibility

Only the latest stable Zotero is in the supported compatibility matrix. Legacy Gecko/Zotero input polyfills are not maintained.
