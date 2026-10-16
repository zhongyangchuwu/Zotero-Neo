# Write user documentation

Use the README for the project overview and installation entry point, workflow guides for tasks, Reference for exact commands and settings, and design documents for decisions and constraints. Add a page only when it answers a question that existing pages do not cover.

## Terminology and wording

Use the [interaction model's terminology](INTERACTION_MODEL.md#terminology) for project concepts and Chinese names. [How Neo works](CONCEPTS.md) introduces those concepts to users; link to it instead of repeating the definitions in each workflow.

UI names follow `src/i18n/locales/en-US.json` and `zh-CN.json`. Match the language of the instructions and the visible label. When labels for the same concept disagree, update the catalog and affected instructions together. Keep API names, ActionIds, binding contexts, commands, paths, and configuration keys unchanged.

In Chinese prose, use ordinary words for implementation-independent details: `fixture` is 测试数据 and a disposable profile is 一次性测试配置. Describe an owner by its job: 所属条目 for a note's parent, 负责模块 for code ownership, or 输入处理方 for keyboard handling. Preserve the distinction between a submitted save and one already executing rather than translating both as “already saved.”

Give a concrete condition and consequence when a limitation affects the task. State shared recording requirements once; individual scenarios need their own data, actions, expected results, and recovery, not repeated instructions against fabricated evidence.

## A feature card

Homepage cards are defined in `index.md` frontmatter. Give each card a concrete outcome, a short description, and a link to the corresponding task.

```yaml
- title: Select text without dragging
  details: Type a few words you can see in the PDF, choose a hint, and highlight the selection.
  link: /docs/SELECTION_GUIDE#try-it
  linkText: Try text selection
```

Keep the card specific. “Select text without dragging” tells the user what to try; “Reader Surface and Input Ownership” does not. Do not make cards link to concepts or a complete command table.

## A feature page

Describe a concrete benefit and the task it enables, then link to a working trial in the relevant guide. Focus on standout capabilities rather than listing every command. Use [Features](FEATURES.md) as the discovery entry point.

## Workflow guides

Organize a chapter around the task it serves. State the starting context and necessary data or settings, give the steps, and describe the result. Put save, cancellation, destructive consequences, and recovery beside the relevant operation.

Confirm behavior in the current runtime, preferences, manifest, build scripts, and tests before documenting it. Link to Reference for exhaustive key lists and to the relevant design document for implementation reasons. Keep release and download information in [Getting Started](GETTING_STARTED.md#install-the-public-release).

Use paragraphs for connected explanations, lists for steps or parallel choices, and tables for comparisons or lookup. Choose headings needed by the task rather than filling a fixed template. Keep an existing anchor when its task remains, or update callers when the heading changes.

## Media component

`FeatureMedia` is registered by `.vitepress/theme/index.ts` and renders real screenshots or videos with a caption and text description. Publish a figure on a user page only when its asset is available.

Store media files under `public/media/` and use `/media/` paths in `src`; the component adds the site's configured base path. Publish the written steps with the media, and provide image alt text and captions for spoken or meaningful audio. Recording procedures and privacy requirements are in the [Recording Guide](RECORDING_GUIDE.md).

| Property | Use |
| --- | --- |
| `kind` | `image` or `video`. |
| `title` | Figure label and caption title. |
| `src` | Path to the existing image or video asset. |
| `alt` | Image description; when omitted, the component uses `title`. |
| `poster` | Video preview image path. |
| `captions` | WebVTT caption path; the current component labels this track as English. |

Check the figure on a narrow viewport and in both color themes.

## Review the page as a user

- Can a homepage card take me directly to the keys I should try?
- Do I know where to click and what must already exist?
- Can I tell what changed, where it was saved, or how to cancel?
- Does each chapter connect related tasks into a useful workflow?
- Are user pages free of storyboards, implementation notes, and defensive reading instructions?
- Does the built page work in light/dark themes and a narrow viewport?

Use the [Development Guide](DEVELOPMENT.md#documentation-site) for build and preview commands. Keep the complete command list in the [Command Reference](COMMAND_REFERENCE.md), not in every feature page.
