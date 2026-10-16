# Settings reference

Settings controls and defaults. For the keybinding workflow, save behavior, and choosing options, see the [Settings guide](SETTINGS_GUIDE.md).

| Control | Default | What it controls |
| --- | --- | --- |
| Themes | Zotero | Choose an interaction palette: Zotero, Catppuccin, Tokyo Night, Gruvbox, or a custom theme. |
| Marker width (px) | 3 px | Width of the Main item cursor and Select markers; choices are 1–4 px. |
| Status style | Neutral | Status indicator style: Neutral or Tinted. |
| Text Select mode | on | Allows `v` or an existing Zotero text selection to enter Reader Select. |
| Annotation comment editing | on | Allows Reader Normal `i` / `Enter` to edit a selected annotation. When off, `i` passes input through Reader instead. |
| Vim-style note editing | on | Enables Vim-style editing in context-pane and standalone Note editors. |
| Scrolling mode | Constant | Choose Step, Constant, or Accelerating; only the active mode's controls appear. |
| Scroll step (px) | 60 px | Distance per `j` / `k` / `zh` / `zl` press in Step mode; count prefixes multiply the step. |
| Scroll speed (px/s) | 2000 px/s | Hold-scroll speed in Constant mode. |
| Initial speed (px/s) | 2000 px/s | Starting hold-scroll speed in Accelerating mode. |
| Max speed (px/s) | 2000 px/s | Maximum hold-scroll speed in Accelerating mode. |
| Acceleration (px/s²) | 2600 px/s² | Speed increase while a scroll key is held in Accelerating mode. |
| Deceleration (px/s²) | 4200 px/s² | Speed decrease after a scroll key is released in Accelerating mode. |
| Stop immediately on key release | off | Stops Accelerating mode immediately when the key is released. |
| Persist marks | off | Saves marks in the parent item's Extra field, or the attachment's Extra field for a standalone PDF. If that write fails, Neo falls back to local preferences, which do not sync. |
| Default color | Yellow | Color used when underlining selected text or adding a note without an explicit color. |
| Show Prefix Guide | on | Shows valid continuations for a pending multi-key command. `<Space>` is the default command prefix in Main, Reader, and Note. |
| Display delay (ms) | 200 ms | Delay before the Prefix Guide appears; range 0–1000 ms. |
| Font size (px) | 15 px | Prefix Guide text size; range 12–24 px. |
| Mouse row selection and double-click confirmation | off | When on, one click selects and a double-click confirms a shared picker result; hover is inert. |
| Language | Follow Zotero | Localizes Settings and command labels. Follow Zotero uses the host locale; English and Chinese are also available. |
| Namespace separator | `/` | Presents flat Zotero tag strings as virtual paths. An empty separator keeps tag matching flat. |

Neo panels follow Zotero's computed light or dark palette. Ordinary settings save automatically; keybinding edits are staged until **Apply**. See [how to change a binding](SETTINGS_GUIDE.md#try-it).
