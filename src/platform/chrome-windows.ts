interface WindowNotifications {
  registerNotification(observer: { observe(subject: unknown, topic: string): void }): void;
  unregisterNotification(observer: { observe(subject: unknown, topic: string): void }): void;
}

/** Observes existing and future top-level windows, including detached Reader and Note windows. */
export function observeChromeWindows(
  opened: (window: Window) => void,
  closed: (window: Window) => void,
): () => void {
  const watcher = Services.ww as unknown as WindowNotifications;
  const mediator = Services.wm as unknown as {
    getEnumerator(type: string | null): Iterable<Window>;
  };
  let active = true;
  const observer = {
    observe(subject: unknown, topic: string): void {
      if (!active) return;
      if (topic === 'domwindowopened') opened(subject as Window);
      else if (topic === 'domwindowclosed') closed(subject as Window);
    },
  };
  watcher.registerNotification(observer);
  try {
    for (const window of mediator.getEnumerator(null)) opened(window);
  } catch (error) {
    active = false;
    watcher.unregisterNotification(observer);
    throw error;
  }
  return () => {
    if (!active) return;
    active = false;
    watcher.unregisterNotification(observer);
  };
}

/** Keeps privileged prompt access outside native DOM integrations. */
export function confirmChromeAction(owner: Window | null, title: string, message: string): boolean {
  const prompt = Services.prompt as unknown as {
    confirm(parent: Window | null, caption: string, text: string): boolean;
  };
  return prompt.confirm(owner, title, message);
}

interface ChromePromptService {
  select(
    owner: Window | null,
    title: string,
    message: string,
    choices: readonly string[],
    selected: { value: number },
  ): boolean;
  prompt(
    owner: Window | null,
    title: string,
    message: string,
    value: { value: string },
    checkMessage: null,
    check: { value: boolean },
  ): boolean;
  alert(owner: Window | null, title: string, message: string): void;
}

/** Opens a privileged single-choice dialog; cancellation returns no selected index. */
export function chooseChromeAction(
  owner: Window | null,
  title: string,
  message: string,
  choices: readonly string[],
): number | null {
  const selected = { value: 0 };
  const prompt = Services.prompt as unknown as ChromePromptService;
  return prompt.select(owner, title, message, choices, selected) ? selected.value : null;
}

/** Reads a privileged text prompt without exposing the host's mutable out parameters. */
export function promptChromeText(
  owner: Window | null,
  title: string,
  message: string,
  initialValue = '',
): string | null {
  const value = { value: initialValue };
  const prompt = Services.prompt as unknown as ChromePromptService;
  return prompt.prompt(owner, title, message, value, null, { value: false }) ? value.value : null;
}

/** Shows a privileged informational message in the initiating window. */
export function alertChromeAction(owner: Window | null, title: string, message: string): void {
  (Services.prompt as unknown as ChromePromptService).alert(owner, title, message);
}
