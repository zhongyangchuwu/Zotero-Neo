const DECIMAL = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

function digitLetters(digits: string): string {
  return digits.replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 50));
}

function reverseLetters(letters: string): string {
  return letters.replace(/[a-z]/g, (letter) => String.fromCharCode(219 - letter.charCodeAt(0)));
}

function exponentSortKey(exponent: bigint): string {
  if (exponent === 0n) return 'c';
  const digits = (exponent < 0n ? -exponent : exponent).toString();
  // Unary digit count makes arbitrary-size integer magnitudes prefix-free.
  const magnitude = `${'l'.repeat(digits.length)}a${digitLetters(digits)}`;
  return exponent < 0n ? `b${reverseLetters(magnitude)}` : `d${magnitude}`;
}

export function isExactDecimal(value: string): boolean {
  return DECIMAL.test(value.trim());
}

/**
 * Order exact decimals by sign, leading-digit exponent, then significant digits.
 * The prefix uses only letters so it also works for native string collation with
 * numeric digit mode. A low mantissa terminator distinguishes 1.2 from 1.23.
 * Equivalent spellings have the same key; display stays separate from sorting.
 */
export function exactDecimalSortKey(value: string): string | null {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const integer = match[2] ?? '';
  const coefficient = integer + (match[3] ?? match[4] ?? '');
  const first = coefficient.search(/[1-9]/);
  if (first === -1) return 'c';
  const exponent = BigInt(match[5] ?? '0') + BigInt(integer.length) - BigInt(first) - 1n;
  const significant = coefficient.slice(first).replace(/0+$/, '');
  const magnitude = `${exponentSortKey(exponent)}${digitLetters(significant)}a`;
  return match[1] === '-' ? `b${reverseLetters(magnitude)}` : `d${magnitude}`;
}
