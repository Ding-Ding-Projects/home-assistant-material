import type { Metrics } from "./layout";

/**
 * What is needed to put text on a page with the standard PDF fonts, which
 * every PDF reader has and which therefore need not be embedded: the byte
 * each character has in WinAnsi, and how wide it is in Helvetica.
 */

const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** The WinAnsi byte of a character, or undefined when it has none. */
export const winAnsiByte = (character: string): number | undefined => {
  const code = character.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) {
    return code;
  }
  if (code >= 0xa1 && code <= 0xff) {
    return code;
  }
  if (code === 0xa0) {
    return 0x20;
  }
  return WIN_ANSI_EXTRA[code];
};

/** Whether the text can be drawn with the standard fonts, as it is. */
export const drawableWithStandardFonts = (text: string): boolean => {
  for (const character of text) {
    if (character === "\n" || character === "\r" || character === "\t") {
      continue;
    }
    if (winAnsiByte(character) === undefined) {
      return false;
    }
  }
  return true;
};

// Helvetica widths from 0x20 to 0x7E, in thousandths of the font size.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

const helveticaWidth = (character: string): number => {
  const code = character.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) {
    return HELVETICA[code - 0x20];
  }
  // An accented letter is about as wide as the letter without its accent.
  const base = character.normalize("NFD")[0];
  const baseCode = base?.codePointAt(0) ?? 0;
  if (baseCode >= 0x20 && baseCode <= 0x7e) {
    return HELVETICA[baseCode - 0x20];
  }
  return 556;
};

export const standardMetrics: Metrics = {
  width: (text, font, size) => {
    let total = 0;
    for (const character of text) {
      total +=
        font === "mono"
          ? 600
          : helveticaWidth(character) * (font === "bold" ? 1.07 : 1);
    }
    return (total * size) / 1000;
  },
};
