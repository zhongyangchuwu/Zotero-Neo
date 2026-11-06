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
