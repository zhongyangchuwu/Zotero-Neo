export function cloneInto<T extends object>(value: T, targetWindow: Window): T {
  return Components.utils.cloneInto(value, targetWindow) as T;
}

/** Canonicalizes native objects whose chrome wrappers differ across callback/getter boundaries. */
export function nativeObjectIdentity<T extends object>(value: T): T {
  return Components.utils.waiveXrays(value) as T;
}

/** Clones an adapter-owned callback object into the native caller's realm. */
export function cloneIntoWithFunctions<T extends object>(value: T, targetWindow: Window): T {
  return Components.utils.cloneInto(value, targetWindow, { cloneFunctions: true }) as T;
}
