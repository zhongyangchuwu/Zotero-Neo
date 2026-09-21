const RUNTIME_TOKEN_SEPARATOR = '\u001f';

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const SPECIAL_KEY_ALIASES: Readonly<Record<string, string>> = {
  space: ' ',
  lt: '<',
  enter: 'enter',
  cr: 'enter',
  return: 'return',
  esc: 'escape',
  escape: 'escape',
  tab: 'tab',
  bs: 'backspace',
  backspace: 'backspace',
  del: 'delete',
  delete: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  insert: 'insert',
};

const INTERNAL_KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  '<': 'lt',
  enter: 'Enter',
  return: 'Return',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'BS',
  delete: 'Del',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
};

const LEGACY_NAMED_KEYS = [
  'audiovolumedown',
  'audiovolumemute',
  'audiovolumeup',
  'launchapplication1',
  'launchapplication2',
  'launchmediaplayer',
  'mediatrackprevious',
  'mediaplaypause',
  'mediatracknext',
  'browserfavorites',
  'browserrefresh',
  'browserforward',
  'browsersearch',
  'browserback',
  'browserhome',
  'browserstop',
  'contextmenu',
  'printscreen',
  'scrolllock',
  'arrowright',
  'arrowdown',
  'arrowleft',
  'arrowup',
  'backspace',
  'pagedown',
  'pageup',
  'numlock',
  'capslock',
  'insert',
  'delete',
  'escape',
  'return',
  'enter',
  'pause',
  'home',
  'end',
  'tab',
] as const;

function codePointAt(value: string, index: number): string {
  const point = value.codePointAt(index);
  return point === undefined ? '' : String.fromCodePoint(point);
}

export function isSingleKeyCharacter(value: string): boolean {
  return [...value].length === 1;
}

function functionKeyToken(value: string): string | null {
  const normalized = value.toLowerCase();
  return /^f(?:[1-9]|1\d|2[0-4])$/.test(normalized) ? normalized : null;
}

function normalizeSpecialKey(value: string): string | null {
  return SPECIAL_KEY_ALIASES[value.toLowerCase()] ?? functionKeyToken(value);
}

function normalizeModifiers(values: readonly Modifier[]): readonly Modifier[] {
  const unique = new Set(values);
  return MODIFIER_ORDER.filter((modifier) => unique.has(modifier));
}

function normalizeShiftedPrintable(
  value: string,
  modifiers: readonly Modifier[],
): { readonly terminal: string; readonly modifiers: readonly Modifier[] } | null {
  if (!modifiers.includes('shift')) return { terminal: value, modifiers };
  const withoutShift = modifiers.filter((modifier) => modifier !== 'shift');
  if (/^[A-Za-z]$/.test(value)) {
    return { terminal: value.toUpperCase(), modifiers: withoutShift };
  }
  if (/^[0-9]$/.test(value)) return null;
  return { terminal: value, modifiers: withoutShift };
}

function parseNotationToken(source: string): string | null {
  if (!source) return null;
  const parts = source.split('-');
  const terminalSource = parts.pop();
  if (!terminalSource) return null;

  const modifiers: Modifier[] = [];
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === 'c') modifiers.push('ctrl');
    else if (normalized === 'm') modifiers.push('alt');
    else if (normalized === 's') modifiers.push('shift');
    else return null;
  }

  const special = normalizeSpecialKey(terminalSource);
  if (special !== null) {
    const prefix = normalizeModifiers(modifiers);
    return prefix.length ? `${prefix.join('+')}+${special}` : special;
  }

  if (!isSingleKeyCharacter(terminalSource) || modifiers.length === 0) return null;
  const shifted = normalizeShiftedPrintable(terminalSource, normalizeModifiers(modifiers));
  if (!shifted) return null;
  return shifted.modifiers.length
    ? `${shifted.modifiers.join('+')}+${shifted.terminal}`
    : shifted.terminal;
}

export function bindingSequenceTokens(sequence: string): readonly string[] | null {
  if (!sequence || sequence.includes(RUNTIME_TOKEN_SEPARATOR)) return null;
  const tokens: string[] = [];
  let index = 0;
  while (index < sequence.length) {
    if (sequence[index] === '<') {
      const close = sequence.indexOf('>', index + 1);
      if (close < 0) return null;
      const token = parseNotationToken(sequence.slice(index + 1, close));
      if (!token) return null;
      tokens.push(token);
      index = close + 1;
      continue;
    }
    const token = codePointAt(sequence, index);
    if (!token) return null;
    tokens.push(token);
    index += token.length;
  }
  return tokens;
}

function encodeRuntimeToken(token: string): string {
  return isSingleKeyCharacter(token)
    ? token
    : `${RUNTIME_TOKEN_SEPARATOR}${token}${RUNTIME_TOKEN_SEPARATOR}`;
}

export function appendInputKey(buffer: string, key: string): string {
  return key ? `${buffer}${encodeRuntimeToken(key)}` : buffer;
}

export function inputBufferTokens(buffer: string): readonly string[] | null {
  const tokens: string[] = [];
  let index = 0;
  while (index < buffer.length) {
    if (buffer[index] !== RUNTIME_TOKEN_SEPARATOR) {
      const token = codePointAt(buffer, index);
      if (!token) return null;
      tokens.push(token);
      index += token.length;
      continue;
    }
    const close = buffer.indexOf(RUNTIME_TOKEN_SEPARATOR, index + 1);
    if (close < 0 || close === index + 1) return null;
    tokens.push(buffer.slice(index + 1, close));
    index = close + 1;
  }
  return tokens;
}

function tokenPrefix(prefix: readonly string[], candidate: readonly string[]): boolean {
  return (
    prefix.length <= candidate.length &&
    prefix.every((token, index) => candidate[index] === token)
  );
}

export function bindingMatchesInputPrefix(sequence: string, buffer: string): boolean {
  const binding = bindingSequenceTokens(sequence);
  const input = inputBufferTokens(buffer);
  return Boolean(binding && input && tokenPrefix(input, binding));
}

export function bindingEqualsInput(sequence: string, buffer: string): boolean {
  const binding = bindingSequenceTokens(sequence);
  const input = inputBufferTokens(buffer);
  return Boolean(
    binding &&
      input &&
      binding.length === input.length &&
      binding.every((token, index) => input[index] === token),
  );
}

export function bindingTokenCount(sequence: string): number | null {
  return bindingSequenceTokens(sequence)?.length ?? null;
}

export function inputTokenCount(buffer: string): number | null {
  return inputBufferTokens(buffer)?.length ?? null;
}

export function nextBindingToken(sequence: string, buffer: string): string | null {
  const binding = bindingSequenceTokens(sequence);
  const input = inputBufferTokens(buffer);
  if (!binding || !input || !tokenPrefix(input, binding) || binding.length <= input.length) {
    return null;
  }
  return binding[input.length] ?? null;
}

export function popInputKey(buffer: string): string {
  const tokens = inputBufferTokens(buffer);
  if (!tokens?.length) return '';
  return tokens
    .slice(0, -1)
    .map(encodeRuntimeToken)
    .join('');
}

export function inputStartsWithKey(buffer: string, key: string): boolean {
  return inputBufferTokens(buffer)?.[0] === key;
}

function renderSpecialToken(token: string): string | null {
  const named = INTERNAL_KEY_NAMES[token];
  if (named) return `<${named}>`;
  const functionKey = functionKeyToken(token);
  return functionKey ? `<${functionKey.toUpperCase()}>` : null;
}

function renderToken(token: string): string | null {
  const direct = renderSpecialToken(token);
  if (direct) return direct;
  if (isSingleKeyCharacter(token)) return token;

  const parts = token.split('+');
  const terminal = parts.pop();
  if (!terminal) return null;

  const renderedModifiers: string[] = [];
  for (const modifier of parts) {
    if (modifier === 'ctrl') renderedModifiers.push('C');
    else if (modifier === 'alt') renderedModifiers.push('M');
    else if (modifier === 'shift') renderedModifiers.push('S');
    else return null;
  }

  const namedTerminal = INTERNAL_KEY_NAMES[terminal] ?? functionKeyToken(terminal)?.toUpperCase();
  const renderedTerminal = namedTerminal ?? (isSingleKeyCharacter(terminal) ? terminal : null);
  return renderedTerminal ? `<${[...renderedModifiers, renderedTerminal].join('-')}>` : null;
}

export function serializeBindingTokens(tokens: readonly string[]): string {
  const rendered = tokens.map(renderToken);
  return rendered.every((token): token is string => token !== null) ? rendered.join('') : '';
}

export function canonicalBindingSequence(sequence: string): string | null {
  const tokens = bindingSequenceTokens(sequence);
  if (!tokens) return null;
  const canonical = serializeBindingTokens(tokens);
  return canonical || null;
}

export function bindingSequenceIsStrictPrefix(left: string, right: string): boolean {
  const leftTokens = bindingSequenceTokens(left);
  const rightTokens = bindingSequenceTokens(right);
  if (!leftTokens || !rightTokens || leftTokens.length >= rightTokens.length) return false;
  return tokenPrefix(leftTokens, rightTokens);
}

function legacyNamedKeyAt(value: string, index: number): string | null {
  const remaining = value.slice(index).toLowerCase();
  const functionKey = /^f(?:[1-9]|1\d|2[0-4])/.exec(remaining)?.[0] ?? null;
  let winner = functionKey;
  for (const name of LEGACY_NAMED_KEYS) {
    if (remaining.startsWith(name) && (!winner || name.length > winner.length)) winner = name;
  }
  return winner;
}

function legacyTokenAt(
  value: string,
  index: number,
): { readonly token: string; readonly end: number } | null {
  const modifiers: Modifier[] = [];
  let cursor = index;
  while (true) {
    const tail = value.slice(cursor).toLowerCase();
    if (tail.startsWith('ctrl+')) {
      modifiers.push('ctrl');
      cursor += 5;
    } else if (tail.startsWith('alt+')) {
      modifiers.push('alt');
      cursor += 4;
    } else if (tail.startsWith('shift+')) {
      modifiers.push('shift');
      cursor += 6;
    } else {
      break;
    }
  }

  const named = legacyNamedKeyAt(value, cursor);
  const terminal = named ?? codePointAt(value, cursor);
  if (!terminal) return null;
  const end = cursor + terminal.length;
  const prefix = normalizeModifiers(modifiers);
  if (!prefix.length) return { token: terminal, end };
  return { token: `${prefix.join('+')}+${terminal}`, end };
}

export function migrateLegacyKeySequence(sequence: string): string | null {
  if (!sequence || sequence.includes(RUNTIME_TOKEN_SEPARATOR)) return null;
  const tokens: string[] = [];
  let index = 0;
  while (index < sequence.length) {
    if (sequence[index] === '<') {
      const close = sequence.indexOf('>', index + 1);
      if (close > index + 1) {
        const symbolic = parseNotationToken(sequence.slice(index + 1, close));
        if (symbolic) {
          tokens.push(symbolic);
          index = close + 1;
          continue;
        }
      }
    }

    const parsed = legacyTokenAt(sequence, index);
    if (!parsed) return null;
    tokens.push(parsed.token);
    index = parsed.end;
  }
  const canonical = serializeBindingTokens(tokens);
  return canonical || null;
}

export function formatInputSequence(buffer: string): readonly string[] {
  return inputBufferTokens(buffer) ?? [];
}
