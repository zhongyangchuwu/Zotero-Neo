export function cloneInto<T extends object>(value: T, targetWindow: Window): T {
  return Components.utils.cloneInto(value, targetWindow) as T;
}

/** Canonicalizes native objects whose chrome wrappers differ across callback/getter boundaries. */
export function nativeObjectIdentity<T extends object>(value: T): T {
  return Components.utils.waiveXrays(value) as T;
}

/** Detects chrome wrappers invalidated when their content iframe is destroyed. */
export function isDeadObject(value: object): boolean {
  return Components.utils.isDeadWrapper(value);
}

/** Restores Xrays so native DOM calls retain ChromeOnly options on waived host targets. */
export function privilegedEventTarget<T extends EventTarget>(target: T): T {
  return Components.utils.unwaiveXrays(target) as T;
}

/** Clones an adapter-owned callback object into the native caller's realm. */
export function cloneIntoWithFunctions<T extends object>(value: T, targetWindow: Window): T {
  return Components.utils.cloneInto(value, targetWindow, { cloneFunctions: true }) as T;
}
