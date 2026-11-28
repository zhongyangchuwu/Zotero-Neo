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
