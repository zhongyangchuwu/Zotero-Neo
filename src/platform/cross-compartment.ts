export function cloneInto<T extends object>(value: T, targetWindow: Window): T {
  return Components.utils.cloneInto(value, targetWindow) as T;
}
