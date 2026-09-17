from pathlib import Path

path = Path('docs/DEVELOPMENT.md')
text = path.read_text()
old_fuzzy = '''The internal fuzzy
ranker is a small allocation-conscious subsequence scorer with consecutive and
word-boundary bonuses. Do not import Zotero's private DevTools copy of
`fuzzaldrin-plus`: `resource://devtools/...` is not a stable add-on API, and adding an
npm fuzzy package would violate the zero-runtime-dependency XPI contract.
'''
new_fuzzy = '''Shared Picker and TagPath fuzzy ranking goes through Neo's `fuzzyMatchScore()` adapter,
backed by the pinned, audited `fuzzysort` vendor snapshot. esbuild folds that ESM into the
existing runtime IIFE; no npm/CDN/native dependency is resolved at runtime. Keep consumers
behind the adapter instead of importing the vendor module throughout feature code.
'''
if old_fuzzy not in text:
    raise SystemExit('stale fuzzy paragraph not found')
text = text.replace(old_fuzzy, new_fuzzy, 1)

old_flash = '''mode change, and disposal cancel the invocation instead of live-reindexing stale PDF.js text. Fuzzy
search, regex, whole-document indexing, and CJK/IME composition are intentionally outside v1.
'''
new_flash = '''mode change, and disposal cancel the invocation instead of live-reindexing stale PDF.js text. Flash
query editing is hosted by a real focused HTML input, so Gecko/OS IME composition, Backspace,
and Unicode text editing remain browser-owned. Neo only consumes committed `input.value`, actual
Flash commands, and continuation-safe ASCII hint labels; fuzzy Flash search, regex,
transliteration, OCR, and whole-document indexing remain outside v1. See `INPUT_METHODS.md`.
'''
if old_flash not in text:
    raise SystemExit('stale Flash paragraph not found')
path.write_text(text.replace(old_flash, new_flash, 1))
