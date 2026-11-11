import { describe, expect, it } from "vitest";
import {
  hasHiddenCharacters,
  limitCombiningMarks,
  showHiddenCharacterCodes,
  stripHiddenCharacters,
} from "../../../src/common/string/hidden-characters";

// Protects text that someone else wrote and the app then shows: the ranges
// that can hide or reorder what a person reads must stay covered.

const chars = (...codes: number[]) => String.fromCharCode(...codes);

describe("hidden characters", () => {
  it("finds direction, zero-width, soft hyphen, C1 and variation selectors", () => {
    for (const code of [
      0x202e, 0x2066, 0x200b, 0xad, 0x85, 0xfe0f, 0x061c, 0xfeff, 0x0007,
    ]) {
      expect(hasHiddenCharacters(`a${chars(code)}b`)).toBe(true);
    }
    expect(hasHiddenCharacters("plain text 🏠 é")).toBe(false);
  });

  it("finds tag characters outside the basic plane", () => {
    expect(hasHiddenCharacters(`a${String.fromCodePoint(0xe0041)}`)).toBe(true);
  });

  it("strips them and can show them as codes", () => {
    const text = `a${chars(0x202e)}b${chars(0x200b)}c`;
    expect(stripHiddenCharacters(text)).toBe("abc");
    expect(showHiddenCharacterCodes(text)).toBe("aU+202EbU+200Bc");
  });

  it("keeps a few combining marks after a letter", () => {
    const smear = `a${chars(0x301).repeat(5)}b${chars(0x301)}`;
    expect(limitCombiningMarks(smear, 2)).toBe(
      `a${chars(0x301).repeat(2)}b${chars(0x301)}`
    );
  });
});
