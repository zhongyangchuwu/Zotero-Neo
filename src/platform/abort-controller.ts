/** Gecko's Bootstrap scope does not initially expose DOM constructors. */
export function createAbortController(): AbortController {
  if (typeof AbortController === 'undefined')
    Components.utils.importGlobalProperties(['AbortController']);
  return new AbortController();
}
