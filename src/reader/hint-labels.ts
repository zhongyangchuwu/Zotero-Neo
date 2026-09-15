const HINT_ALPHABET = 'ASDFJKLGHQWERTYUIOPZXCVBNM';

/** Generates fixed-width keyboard hint labels in stable display order. */
export function hintLabels(count: number): string[] {
  let width = 1;
  let capacity = HINT_ALPHABET.length;
  while (capacity < count) {
    width += 1;
    capacity *= HINT_ALPHABET.length;
  }
  return Array.from({ length: count }, (_, index) => {
    let value = index;
    const label = Array.from({ length: width }, () => HINT_ALPHABET[0]!);
    for (let position = width - 1; position >= 0; position -= 1) {
      label[position] = HINT_ALPHABET[value % HINT_ALPHABET.length]!;
      value = Math.floor(value / HINT_ALPHABET.length);
    }
    return label.join('');
  });
}
