import { pngBytes } from './image-data';
interface ClipboardHelper {
  copyString(value: string): void;
}

interface ClipboardClass {
  getService(interfaceId: unknown): ClipboardHelper;
}
// Zotero's own clipboard bridges pass null for the optional context and owner.
interface NativeTransferable extends nsITransferable {
  init(context: nsILoadContext | null): void;
}
interface NativeClipboard extends nsIClipboard {
  setData(
    data: nsITransferable,
    owner: nsIClipboardOwner | null,
    clipboard: nsIClipboard.ClipboardType,
  ): void;
}

export interface RichClipboardContent {
  readonly text: string;
  readonly html: string;
  readonly image?: string;
}

/** One clipboard write supplies rich Zotero/source markup, plain text and an optional native PNG. */
export function copyRichClipboard(content: RichClipboardContent): void {
  const classes = Components.classes as unknown as Record<
    string,
    { createInstance(iid: unknown): unknown; getService(iid: unknown): unknown }
  >;
  const transferable = classes['@mozilla.org/widget/transferable;1'].createInstance(
    Components.interfaces.nsITransferable,
  ) as NativeTransferable;
  transferable.init(null);
  for (const [flavor, value] of [
    ['text/unicode', content.text],
    ['text/html', content.html],
  ] as const) {
    const text = classes['@mozilla.org/supports-string;1'].createInstance(
      Components.interfaces.nsISupportsString,
    ) as nsISupportsString;
    text.data = value;
    transferable.addDataFlavor(flavor);
    transferable.setTransferData(flavor, text);
  }
  if (content.image) {
    const bytes = pngBytes(content.image);
    const tools = classes['@mozilla.org/image/tools;1'].getService(
      Components.interfaces.imgITools,
    ) as imgITools;
    const image = tools.decodeImageFromArrayBuffer(bytes.buffer, 'image/png');
    transferable.addDataFlavor('application/x-moz-nativeimage');
    transferable.setTransferData('application/x-moz-nativeimage', image);
  }
  const clipboard = classes['@mozilla.org/widget/clipboard;1'].getService(
    Components.interfaces.nsIClipboard,
  ) as NativeClipboard;
  clipboard.setData(transferable, null, Components.interfaces.nsIClipboard.kGlobalClipboard);
}

export function copyToClipboard(value: string): void {
  const classes = Components.classes as unknown as Readonly<
    Record<'@mozilla.org/widget/clipboardhelper;1', ClipboardClass>
  >;
  classes['@mozilla.org/widget/clipboardhelper;1']
    .getService(Components.interfaces.nsIClipboardHelper)
    .copyString(value);
}
