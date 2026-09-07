# Codebase Map

**Mapped:** 2026-09-08

## Documents

| Document | Lines | Summary |
|---|---:|---|
| `STRUCTURE.md` | 40 | Small Bootstrap plugin with three runtime content scripts, separate preference scripts, two build paths, and no test tree. |
| `ARCHITECTURE.md` | 69 | One shared controller owns mode/action routing; state is partitioned per reader and per main window across a three-compartment reader stack. |
| `STACK.md` | 48 | Plain JavaScript on Zotero/Gecko with XPCOM/Zotero APIs, no runtime dependencies, and direct XPI packaging. |
| `CONVENTIONS.md` | 51 | Existing object-literal, state, cloning, error, binding-sync, input-safety, and manual-verification conventions are load-bearing. |
| `CONCERNS.md` | 46 | Host verification blockers, keyboard capture, private APIs, tag write safety, digit handling, and inherited focus bugs drive sequencing. |

## Key Takeaways

1. Current functionality is a strong base; the PRD should extend it rather than replace the dispatcher or reader injection.
2. M0 identity is implemented and statically packaged; Windows/PowerShell and Zotero host verification still block phase completion.
3. M1, M3, M4, and M5 are missing; M2 is partially present through existing motions, Space chords, split navigation, pickers, notes, tabs, and citekey support.
4. Input capture and private reader forwarding are the main regression surface for keymap, Spotlight, and which-key work.
5. Build/sync checks pass, but Zotero installation, focus, optional integration, mutation, and compatibility claims require manual evidence.

## Planning Entry Points

- Project context: `.planning/PROJECT.md`
- Requirement traceability: `.planning/REQUIREMENTS.md`
- Milestone order: `.planning/ROADMAP.md`
- Current state: `.planning/STATE.md`
- Next executable handoff: `.planning/phases/000-fork-hygiene/HANDOFF.md`
