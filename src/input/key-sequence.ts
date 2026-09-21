const RUNTIME_TOKEN_SEPARATOR = '\u001f';

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const NAMED_KEYS = new Set([
  'again',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowup',
  'audiovolumedown',
  'audiovolumemute',
  'audiovolumeup',
  'backspace',
  'browserback',
  'browserfavorites',
  'browserforward',
  'browserhome',
  'browserrefresh',
  'browsersearch',
  'browserstop',
  'cancel',
  'clear',
  'contextmenu',
  'delete',
  'end',
  'enter',
  'escape',
  'execute',
  'find',
  'help',
  'home',
  'insert',
  'launchapplication1',
  'launchapplication2',
  'launchmail',
  'launchmediaplayer',
  'mediaplaypause',
  'mediastop',
  'mediatracknext',
  'mediatrackprevious',
  'numlock',
  'pagedown',
  'pageup',
  'pause',
  'printscreen',
  'props',
  'redo',
  'return',
  'scrolllock',
  'select',
  'tab',
  'undo',
]);

function codePointAt(value: string, index: number): string {
  const point = value.codePointAt(index);
  return point === undefined ? '' : String.fromCodePoint(point);
}

export function isSingleKeyCharacter(value: string): boolean {
  return [...value].length === 1;
}

function isNamedKey(value: string): boolean {
  const normalized = value.toLowerCase();
  return NAMED_KEYS.has(normalized) || /^f(?:[1-9]|1\d|2[0-4])$/.test(normalized);
}

function modifierAt(value: string, index: number): { modifier: Modifier; end: number } | null {
  for (const modifier of MODIFIER_ORDER) {
    const prefix = `${modifier}+`;
    if (value.slice(index).toLowerCase().startsWith(prefix)) {
      return { modifier, end: index + prefix.length };
    }
  }
  return null;
}

function namedKeyAt(value: string, index: number): string | null {
  const remaining = value.slice(index).toLowerCase();
  let winner: string | null = null;
  for (const key of NAMED_KEYS) {
    if (remaining.startsWith(key) && (!winner || key.length > winner.length)) winner = key;
  }
  const functionKey = /^f(?:[1-9]|1\d|2[0-4])/.exec(remaining)?.[0] ?? null;
  if (functionKey && (!winner || functionKey.length > winner.length)) winner = functionKey;
  return winner;
}

function canonicalModifiers(modifiers: readonly Modifier[]): readonly Modifier[] {
  const unique = new Set(modifiers);
  return MODIFIER_ORDER.filter((modifier) => unique.has(modifier));
}

function parseChordAt(
  value: string,
  index: number,
): { readonly token: string; readonly end: number } | null {
  const modifiers: Modifier[] = [];
  let cursor = index;
  while (true) {
    const found = modifierAt(value, cursor);
    if (!found) break;
    modifiers.push(found.modifier);
    cursor = found.end;
  }
  if (!modifiers.length || cursor >= value.length) return null;

  const named = namedKeyAt(value, cursor);
  const terminal = named ?? codePointAt(value, cursor);
  if (!terminal) return null;
  const end = cursor + terminal.length;
  const prefix = canonicalModifiers(modifiers).join('+');
  return {
    token: `${prefix}+${isSingleKeyCharacter(terminal) ? terminal : terminal.toLowerCase()}`,
    end,
  };
}

function normalizeExplicitToken(value: string): string | null {
  if (!value || value.includes(RUNTIME_TOKEN_SEPARATOR)) return null;
  if (value.toLowerCase() === 'space') return ' ';
  if (isSingleKeyCharacter(value)) return value;
  const chord = parseChordAt(value, 0);
  if (chord?.end === value.length) return chord.token;
  if (isNamedKey(value)) return value.toLowerCase();
  return null;
}

function legacyAtomicToken(value: string): string | null {
  if (isSingleKeyCharacter(value)) return value;
  const chord = parseChordAt(value, 0);
  if (chord?.end === value.length) return chord.token;
  if (isNamedKey(value)) return value.toLowerCase();
  return null;
}

/**
 * Parse the persisted binding syntax into semantic key tokens.
 *
 * Printable multi-key sequences stay compact (gg, ff, <Space>-style leading
 * literal space). Named keys/chords are atomic. Angle brackets can make token
 * boundaries explicit inside a longer sequence, e.g. <enter>g or <ctrl+d>g.
 * << and >> escape literal angle-bracket keys.
 */
export function bindingSequenceTokens(sequence: string): readonly string[] | null {
  if (!sequence || sequence.includes(RUNTIME_TOKEN_SEPARATOR)) return null;

  const atomic = legacyAtomicToken(sequence);
  if (atomic && !sequence.startsWith('<')) return [atomic];

  const tokens: string[] = [];
  let index = 0;
  while (index < sequence.length) {
    if (sequence.startsWith('<<', index)) {
      tokens.push('<');
      index += 2;
      continue;
    }
    if (sequence.startsWith('>>', index)) {
      tokens.push('>');
      index += 2;
      continue;
    }

    if (sequence[index] === '<') {
      const close = sequence.indexOf('>', index + 1);
      if (close > index + 1) {
        const explicit = normalizeExplicitToken(sequence.slice(index + 1, close));
        if (explicit) {
          tokens.push(explicit);
          index = close + 1;
          continue;
        }
      }
    }

    const chord = parseChordAt(sequence, index);
    if (chord) {
      tokens.push(chord.token);
      index = chord.end;
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
    prefix.length <= candidate.length && prefix.every((token, index) => candidate[index] === token)
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
  if (!binding || !input || !tokenPrefix(input, binding) || binding.length <= input.length)
    return null;
  return binding[input.length] ?? null;
}

export function popInputKey(buffer: string): string {
  const tokens = inputBufferTokens(buffer);
  if (!tokens?.length) return '';
  return tokens.slice(0, -1).map(encodeRuntimeToken).join('');
}

export function inputStartsWithKey(buffer: string, key: string): boolean {
  return inputBufferTokens(buffer)?.[0] === key;
}

function sameTokens(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function renderBindingToken(token: string): string {
  if (token === '<') return '<<';
  if (token === '>') return '>>';
  return isSingleKeyCharacter(token) ? token : `<${token}>`;
}

/** Return one unambiguous persisted representation for a semantic token sequence. */
export function serializeBindingTokens(tokens: readonly string[]): string {
  if (!tokens.length) return '';
  if (tokens.length === 1) {
    const token = tokens[0] ?? '';
    if (token === ' ') return ' ';
    if (token === '<') return '<<';
    if (token === '>') return '>>';
    return token;
  }

  const compact = tokens.map(renderBindingToken).join('');
  const reparsed = bindingSequenceTokens(compact);
  if (reparsed && sameTokens(reparsed, tokens)) return compact;

  const [first, ...rest] = tokens;
  const forcedFirst = first === ' ' ? '<space>' : `<${first}>`;
  return `${forcedFirst}${rest.map(renderBindingToken).join('')}`;
}

export function canonicalBindingSequence(sequence: string): string | null {
  const tokens = bindingSequenceTokens(sequence);
  return tokens ? serializeBindingTokens(tokens) : null;
}

export function bindingSequenceIsStrictPrefix(left: string, right: string): boolean {
  const leftTokens = bindingSequenceTokens(left);
  const rightTokens = bindingSequenceTokens(right);
  if (!leftTokens || !rightTokens || leftTokens.length >= rightTokens.length) return false;
  return tokenPrefix(leftTokens, rightTokens);
}

export function formatInputSequence(buffer: string): readonly string[] {
  return inputBufferTokens(buffer) ?? [];
}
