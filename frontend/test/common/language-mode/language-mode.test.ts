import { afterEach, describe, expect, it } from "vitest";
import en from "../../../src/translations/en.json";
import {
  fillPlaceholders,
  flattenStrings,
  hasCantoneseBlock,
  joinForMode,
  modeText,
  setYueStringsForTest,
  stripFullStops,
  textParts,
  withLanguageMode,
  yueKeys,
  yueString,
} from "../../../src/common/language-mode/language-mode";
import yueSource from "../../../src/translations/yue-own.json";

const localize = (key: string, values?: Record<string, string | number>) =>
  key === "ui.phone.home"
    ? "Home"
    : key === "ui.phone.pin"
      ? "PIN"
      : key === "ui.phone.page_position"
        ? `Page ${values?.current} of ${values?.total}`
        : "";

const original = flattenStrings(yueSource);

afterEach(() => setYueStringsForTest(original));

describe("joinForMode", () => {
  const parts = { english: "Home", cantonese: "主頁" };

  it("shows one language for English and Cantonese", () => {
    expect(joinForMode(parts, "english")).toBe("Home");
    expect(joinForMode(parts, "cantonese")).toBe("主頁");
  });

  it("puts English first in both mode", () => {
    expect(joinForMode(parts, "bilingual")).toBe("Home · 主頁");
    expect(joinForMode(parts, "bilingual", "\n")).toBe("Home\n主頁");
  });

  it("falls back to English when there is no Cantonese text", () => {
    const english = { english: "Home" };
    expect(joinForMode(english, "cantonese")).toBe("Home");
    expect(joinForMode(english, "bilingual")).toBe("Home");
  });

  it("shows identical text once in both mode", () => {
    expect(joinForMode({ english: "PIN", cantonese: "PIN" }, "bilingual")).toBe(
      "PIN"
    );
  });
});

describe("closing full stops", () => {
  it("shows text that differs only by full stops once", () => {
    expect(joinForMode({ english: "5.", cantonese: "5。" }, "bilingual")).toBe(
      "5."
    );
  });

  it("strips closing full stops and keeps inner dots", () => {
    expect(stripFullStops("Automatic.")).toBe("Automatic");
    expect(stripFullStops("預設。")).toBe("預設");
    expect(stripFullStops("1.5x.")).toBe("1.5x");
  });
});

describe("modeText", () => {
  it("fills placeholders in the Cantonese text", () => {
    setYueStringsForTest({
      "ui.phone.page_position": "第 {current} 頁，共 {total} 頁",
    });
    const values = { current: 2, total: 5 };
    expect(
      modeText(localize, "ui.phone.page_position", values, "cantonese")
    ).toBe("第 2 頁，共 5 頁");
    expect(
      modeText(localize, "ui.phone.page_position", values, "bilingual")
    ).toBe("Page 2 of 5 · 第 2 頁，共 5 頁");
  });

  it("leaves a key with no Cantonese text in English in every mode", () => {
    setYueStringsForTest({});
    expect(modeText(localize, "ui.phone.home", undefined, "cantonese")).toBe(
      "Home"
    );
    expect(textParts(localize, "ui.phone.home").cantonese).toBeUndefined();
  });

  it("wraps a localize function", () => {
    setYueStringsForTest({ "ui.phone.home": "主頁" });
    expect(withLanguageMode(localize)("ui.phone.home")).toBe("Home");
  });
});

describe("fillPlaceholders", () => {
  it("keeps an unknown placeholder visible", () => {
    expect(fillPlaceholders("{a} 同 {b}", { a: 1 })).toBe("1 同 {b}");
  });
});

// Protects the second translation source: a Cantonese string that names a
// key English does not have would never show, and one that drops or renames
// a placeholder would print a raw "{name}" or lose the value.
describe("the Cantonese source", () => {
  const english = flattenStrings(en);
  // A value written as [%key:a::b::c%] points at another key. Follow it, so a
  // Cantonese string for it is compared with the text English really shows.
  const resolve = (text: string): string => {
    const ref = /^\[%key:(.+)%\]$/.exec(text);
    return ref ? resolve(english[ref[1].replace(/::/g, ".")] ?? "") : text;
  };
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]).sort();

  it("has strings", () => {
    expect(yueKeys().length).toBeGreaterThan(100);
  });

  it("only covers the blocks it is meant to cover", () => {
    yueKeys().forEach((key) => expect(hasCantoneseBlock(key), key).toBe(true));
  });

  it("only names keys that English has", () => {
    yueKeys().forEach((key) => expect(english[key], key).toBeTypeOf("string"));
  });

  it("uses the same placeholders as English", () => {
    yueKeys().forEach((key) =>
      expect(placeholders(yueString(key)!), key).toEqual(
        [...new Set(placeholders(resolve(english[key])))].sort()
      )
    );
  });

  it("uses no plural or select rules", () => {
    yueKeys().forEach((key) =>
      expect(yueString(key), key).not.toMatch(/\{\w+,/)
    );
  });

  it("has no empty strings", () => {
    yueKeys().forEach((key) =>
      expect(yueString(key)!.trim(), key).not.toBe("")
    );
  });

  // A block listed in YUE_PREFIXES promises Cantonese for the whole block. A
  // new English key added to one of them without a Cantonese string would
  // silently fall back to English in Cantonese mode.
  it("has a Cantonese string for every English key of a covered block", () => {
    // The live preview on the personal page shows both languages side by
    // side from its own per-language samples, so its keys are not translated.
    const own = "ui.panel.config.personal.preview.";
    const missing = Object.entries(english)
      .filter(
        ([key, text]) =>
          hasCantoneseBlock(key) &&
          !key.startsWith(own) &&
          typeof text === "string"
      )
      .map(([key]) => key)
      .filter((key) => yueString(key) === undefined);
    expect(missing).toEqual([]);
  });
});
