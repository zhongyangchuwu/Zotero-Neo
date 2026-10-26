# Make Neo fit the way you work

Open Settings with `<Space>ps` from Main, Reader, or Note Normal. Most preference changes save as soon as you make them; keybinding edits stay staged until **Apply**.

## Try it

1. Press and release `Space`, then `p`, then `s` to open Neo Settings.
2. Choose **Keybindings**, select the context where you want the command, and search for its action or key. For example, next-page navigation belongs to Reader, not Main or Note.
3. Choose **Record** to replace a binding or **Add** to keep the current binding and add another. Press the desired key or sequence, then choose **Done** to add it to the draft. Choose **Cancel** during recording to discard the captured keys.
4. Review the validation message and choose **Apply** to save. Before Apply, the change is only a draft; after saving, the non-default binding is marked **Custom**.

During recording, `Enter` and `Escape` are key tokens, not recorder controls. Use the visible **Done** and **Cancel** buttons.

## Find a command before changing it

The **Prefix Guide** shows valid next keys after you start a multi-key command. `<Space>` is the default command prefix in Main, Reader, and Note Normal. Use `:` to open the Command Palette and search actions available in the current context, including supported actions with no key assigned.
To adjust it, expand **Prefix Guide** under **Keybindings**. Turn **Show Prefix Guide** on or off, or change **Display delay (ms)** and **Font size (px)**.

In **Keybindings**, search matches action names, Action IDs, current and default keys, groups, and contexts. Results show **Default**, **Custom**, or **Unbound**. An **Unbound** action can be assigned a key if it is supported in the selected context; an action missing from that context cannot be added there. Open **All groups** to inspect Zotero's native shortcuts; those rows are read-only, and changing a Neo key does not change Zotero's shortcut.

## Resolve binding messages

- An exact duplicate, unsupported action/context pair, or key reserved by Zotero or text editing blocks **Apply**. Choose another sequence or remove the conflicting row.
- If one sequence starts with another, Settings warns that the shorter command may wait for the longer sequence. The pair is allowed; use a different sequence if you want the shorter command immediately.
- An existing incompatible binding may be **Delete**-only. Remove it before assigning a replacement.
- If saving fails, the staged draft remains available and Settings reports the failure.

## Adjust appearance and language

In **Appearance**, choose a built-in interaction theme—**Zotero**, **Catppuccin**, **Tokyo Night**, or **Gruvbox**—or create and edit a custom theme. These colors style Neo's interaction markers and status indicators. **Marker width (px)** adjusts the Main item marker; **Status style** switches between **Neutral** and **Tinted**.

In **Advanced**, set **Language** to **Follow Zotero**, **English**, or **中文**. This changes the Settings interface and localized command labels in the Prefix Guide, Command Palette, and Keybindings. Follow Zotero uses the host locale.

## Tune Reader controls

In **Reader**, choose **Scrolling mode** to match how you read:

- **Step** moves a set distance for each `j`, `k`, `zh`, or `zl` press. Adjust **Scroll step (px)**.
- **Constant** scrolls at a steady speed while you hold a scroll key. Adjust **Scroll speed (px/s)**.
- **Accelerating** changes speed while a key is held. Adjust **Initial speed**, **Max speed**, **Acceleration**, and **Deceleration**; turn on **Stop immediately on key release** to stop instead of decelerating.

Only controls for the selected mode are shown. Enable **Persist marks** to save reading positions across restarts; see [storage and synchronization](SETTINGS_REFERENCE.md) for how marks are stored. **Default color** applies when creating an annotation without choosing an explicit color.

**Text Select mode** controls whether `v` and an existing Zotero text selection can enter Reader Select. **Annotation comment editing** controls whether Reader Normal `i` or `Enter` opens the selected annotation's comment editor. Turning it off does not disable Zotero's own comment fields or Select's separate **Add note** action.

## Choose note and picker behavior

Under **Interaction**, **Vim-style note editing** enables Vim-style controls in context-pane and standalone Note editors. Turn it off to leave ordinary editing to Zotero.

The **Mouse row selection and double-click confirmation** option applies to shared pickers. When enabled, one click selects a result and a double-click confirms it; hovering never selects a row.

## Use tag namespaces

Under **Advanced**, **Namespace separator** controls how tag pickers present flat Zotero tag strings as virtual paths. The default `/` enables path matching; an empty separator keeps matching flat. Stored tag names stay unchanged.

## Manage installed plugins and integrations

Press `<Space>pp` from Main, Reader, or Note Normal to open the Plugin Manager. It shows installed plugins and their state; where Zotero permits, you can enable or disable a plugin, open its registered settings or homepage, and follow available repository links. The manager does not install, update, remove, or discover plugins. Use Zotero's **Plugins** screen for those tasks and to disable Neo.

**Translate** appears in Reader Select's Selection Actions when **Translate for Zotero** is installed. **Better BibTeX** provides citekeys for `<Space>yy`; the target must have an available citekey. If a target cannot resolve or any citekey is missing, Neo refuses the copy and leaves the clipboard unchanged.

See the [Settings reference](SETTINGS_REFERENCE.md) for the control defaults and the [Command Reference](COMMAND_REFERENCE.md) for command contexts and bindings.
