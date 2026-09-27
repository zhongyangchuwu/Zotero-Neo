import type { InstalledPlugin } from './plugin-host';

/** Mutable state owned by one Main plugin-manager feature instance. */
export class PluginManagerRuntime {
  open = false;
  generation = 0;
  loading = false;
  busy = false;
  error = '';
  notice = '';
  plugins: InstalledPlugin[] = [];
  filtered: InstalledPlugin[] = [];
  selected = 0;
  query = '';
  commandBuffer = '';
  commandTimer: number | undefined;
  overlay: HTMLElement | null = null;
  list: HTMLElement | null = null;
  details: HTMLElement | null = null;
  count: HTMLElement | null = null;
  input: HTMLInputElement | null = null;
  footer: HTMLElement | null = null;
  previousElement: Element | null = null;
  inputCleanup: (() => void) | null = null;
  themeCleanup: (() => void) | null = null;
}
