/** Bootstrap sandboxes need not expose the web URL global. */
export function parseAbsoluteURL(value: string): URL {
  if (typeof URL === 'undefined') Components.utils.importGlobalProperties(['URL']);
  return new URL(value);
}
