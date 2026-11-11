import { describe, expect, it } from "vitest";
import {
  playfulParts,
  playfulText,
} from "../../../src/common/playful/playful-text";
import { setYueStringsForTest } from "../../../src/common/language-mode/language-mode";

// Protects the fallback rule: a level with no variant must use the plain
// text, and each language must follow its own level.
describe("playfulText", () => {
  const strings: Record<string, string> = {
    "m.level_1": "Plain {n}.",
    "m.level_5": "Silly {n}!",
    p: "Only plain.",
  };
  const localize = (key: string, values?: Record<string, string | number>) =>
    (strings[key] ?? "").replace(/\{(\w+)\}/g, (_w, k) => String(values?.[k]));

  it("picks the variant for the level and fills placeholders", () => {
    setYueStringsForTest({});
    expect(
      playfulText(
        localize,
        "m",
        "english",
        { english: 5, cantonese: 1 },
        { n: 3 }
      )
    ).toBe("Silly 3!");
  });

  it("falls back to the plain text when a level has no variant", () => {
    setYueStringsForTest({});
    expect(
      playfulText(localize, "p", "english", { english: 4, cantonese: 4 })
    ).toBe("Only plain.");
  });

  it("uses each language's own level", () => {
    setYueStringsForTest({ "m.level_1": "正經", "m.level_5": "搞笑" });
    const parts = playfulParts(
      localize,
      "m",
      { english: 5, cantonese: 1 },
      { n: 1 }
    );
    expect(parts).toEqual({ english: "Silly 1!", cantonese: "正經" });
    setYueStringsForTest({});
  });
});
