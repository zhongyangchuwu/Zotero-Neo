interface ClipboardHelper {
  copyString(value: string): void;
}

interface ClipboardClass {
  getService(interfaceId: unknown): ClipboardHelper;
}

export function copyToClipboard(value: string): void {
  const classes = Components.classes as unknown as Readonly<
    Record<'@mozilla.org/widget/clipboardhelper;1', ClipboardClass>
  >;
  classes['@mozilla.org/widget/clipboardhelper;1']
    .getService(Components.interfaces.nsIClipboardHelper)
    .copyString(value);
}
