# Roadmap

Zotero Neo is an independent project. The public release is v0.1.0; the
[changelog](../CHANGELOG.md) separates published behavior from unreleased source.
For current workflows and exact bindings, see the [user guide](USER_GUIDE.md) and
[command reference](COMMAND_REFERENCE.md).

## Current

The v0.2.0 source is merged into `main` and includes the selected Library
workflows, Reader sidebar and navigation work, existing-note capture, and
context-specific settings. This is not a published release: the public update
feed remains at official v0.1.0 until a verified v0.2.0 asset is authorized for
promotion.

Required candidate and owner acceptance remains in progress. Use the
[acceptance protocol](V0_2_ACCEPTANCE.md) for U1–U10. Record actual human and host
results in [#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137) and
[#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98); candidate identity
and release preparation are tracked in
[#142](https://github.com/zhongyangchuwu/Zotero-Neo/issues/142).

## Next

- Complete required candidate installation, upgrade, physical-input, per-view, and owner-review acceptance.
- Finish release preparation under #142. Tagging, feed promotion, and publication
  require the release gates and explicit authorization.

Longer-term candidates include command-palette arguments/history, richer safe tag
operations, keymap import/export after the schema stabilizes in use, and an
optional Spotlight adapter only if it adds material value. A supported Zotero
semantic-selection seam remains an external prerequisite for replacing the
current compatibility path. Macros, Ex commands, broad Vim parity, and deeper
EPUB/snapshot support are outside the selected work.
