import { describe, expect, it } from "vitest";
import {
  availableFonts,
  DEFAULT_READING_OPTIONS,
  isDefaultReadingOptions,
  normalizeReadingOptions,
  readingOptionsToCss,
} from "../../../src/common/appearance/reading-options";

// Reading options are stored by a person and turned into a stylesheet for the
// whole page. These protect three things: stored data cannot put anything but
// catalogue values into that stylesheet, the defaults write nothing at all,
// and only typefaces that are really present are offered.

describe("normalizeReadingOptions", () => {
  it("falls back to the defaults for anything it does not know", () => {
    expect(
      normalizeReadingOptions({
        bodyFont: "x; } body { display: none",
        headingFont: "nope",
        codeFont: 5 as unknown as string,
        headingWeight: 900 as never,
        lineSpacing: "huge" as never,
        wideSpacing: "yes" as never,
      })
    ).toEqual(DEFAULT_READING_OPTIONS);
  });

  it("keeps only the six known fields and ignores non-objects", () => {
    const options = normalizeReadingOptions({
      bodyFont: "georgia",
      stray: "kept?",
    } as never);
    expect(Object.keys(options).sort()).toEqual(
      Object.keys(DEFAULT_READING_OPTIONS).sort()
    );
    expect(options.bodyFont).toBe("georgia");
    expect(normalizeReadingOptions({ stray: 1 } as never)).toEqual(
      DEFAULT_READING_OPTIONS
    );
    expect(
      isDefaultReadingOptions(normalizeReadingOptions({ stray: 1 } as never))
    ).toBe(true);
    expect(normalizeReadingOptions("text" as never)).toEqual(
      DEFAULT_READING_OPTIONS
    );
    expect(normalizeReadingOptions([1, 2] as never)).toEqual(
      DEFAULT_READING_OPTIONS
    );
    expect(normalizeReadingOptions(null)).toEqual(DEFAULT_READING_OPTIONS);
  });

  it("keeps valid choices", () => {
    const options = normalizeReadingOptions({
      bodyFont: "georgia",
      lineSpacing: "roomy",
      headingWeight: 700,
      wideSpacing: true,
    });
    expect(options.bodyFont).toBe("georgia");
    expect(options.lineSpacing).toBe("roomy");
    expect(options.headingWeight).toBe(700);
    expect(options.wideSpacing).toBe(true);
  });
});

describe("readingOptionsToCss", () => {
  it("writes nothing for the defaults", () => {
    expect(readingOptionsToCss(DEFAULT_READING_OPTIONS)).toBe("");
    expect(isDefaultReadingOptions(DEFAULT_READING_OPTIONS)).toBe(true);
  });

  it("sets spacing, weight and typefaces from the catalogue", () => {
    const css = readingOptionsToCss(
      normalizeReadingOptions({
        bodyFont: "georgia",
        codeFont: "consolas",
        lineSpacing: "roomiest",
        wideSpacing: true,
        headingWeight: 700,
      })
    );
    expect(css).toContain("--ha-font-family-body: Georgia");
    // Headings keep the bundled typeface when only the body changes.
    expect(css).toContain('--ha-font-family-heading: "Google Sans Flex"');
    expect(css).toContain("--ha-font-family-code: Consolas");
    expect(css).toContain("--ha-line-height-normal: 2 !important");
    expect(css).toContain("letter-spacing: 0.12em");
    expect(css).toContain("--ha-font-weight-heading: 700");
  });
});

describe("availableFonts", () => {
  it("offers bundled typefaces always and device typefaces only when found", () => {
    const none = availableFonts(() => false);
    expect(none.body.map((choice) => choice.key)).toEqual(["theme", "system"]);
    expect(none.code.map((choice) => choice.key)).toEqual(["theme"]);

    const some = availableFonts((families) => families.includes("Georgia"));
    expect(some.body.map((choice) => choice.key)).toContain("georgia");
    expect(some.body.map((choice) => choice.key)).not.toContain("atkinson");
  });

  it("does not offer a stored typeface that is absent from this device", () => {
    // A stored choice is still a valid catalogue key, so it survives
    // normalizing, but the dialog must notice it is not in the offered list.
    const stored = normalizeReadingOptions({ bodyFont: "atkinson" });
    expect(stored.bodyFont).toBe("atkinson");
    const offered = availableFonts(() => false).body.map(
      (choice) => choice.key
    );
    expect(offered).not.toContain(stored.bodyFont);
  });
});
