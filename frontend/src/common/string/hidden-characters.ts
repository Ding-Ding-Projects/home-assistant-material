/**
 * Characters that are invisible, reorder text or can hide what a piece of
 * text really says: control characters, soft hyphens, zero-width and
 * direction-changing characters, variation selectors and tag characters.
 * Used for text that someone else wrote and the app then shows.
 */
const HIDDEN_RANGES: [number, number][] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  [0x1d173, 0x1d17a],
  [0xe0000, 0xe0fff],
];

export const isHiddenCharacter = (code: number): boolean =>
  HIDDEN_RANGES.some(([from, to]) => code >= from && code <= to);

const codeLabel = (code: number): string =>
  `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

/** True when the text holds at least one hidden character. */
export const hasHiddenCharacters = (text: string): boolean => {
  for (const char of text) {
    if (isHiddenCharacter(char.codePointAt(0) as number)) {
      return true;
    }
  }
  return false;
};

/** The text without any hidden character. */
export const stripHiddenCharacters = (text: string): string => {
  let result = "";
  for (const char of text) {
    if (!isHiddenCharacter(char.codePointAt(0) as number)) {
      result += char;
    }
  }
  return result;
};

/** The text with each hidden character replaced by its code, such as `U+202E`. */
export const showHiddenCharacterCodes = (text: string): string => {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    result += isHiddenCharacter(code) ? codeLabel(code) : char;
  }
  return result;
};

/**
 * Keeps at most `max` combining marks after each base character, so a name
 * cannot be turned into a tall smear that covers the lines around it.
 */
export const limitCombiningMarks = (text: string, max = 2): string => {
  let result = "";
  let run = 0;
  for (const char of text) {
    if (/\p{M}/u.test(char)) {
      run += 1;
      if (run <= max) {
        result += char;
      }
    } else {
      run = 0;
      result += char;
    }
  }
  return result;
};
