import { describe, expect, it } from "vitest";
import {
  FONT_FAMILIES,
  isTextTooSmall,
  MIN_READABLE_FONT_SIZE,
  normalizeTypeFields,
  typefaceChoices,
  typeFieldsToStyles,
  TYPE_RANGES,
} from "../../../src/components/appearance/appearance-type-fields";
import { normalizeAppearance } from "../../../src/common/appearance/element-appearance";

describe("normalizeTypeFields", () => {
  it("clamps out-of-range numbers", () => {
    const result = normalizeTypeFields({
      lineHeight: 99,
      letterSpacing: -5,
      maxLines: 500.4,
    });
    expect(result.lineHeight).toBe(TYPE_RANGES.lineHeight.max);
    expect(result.letterSpacing).toBe(TYPE_RANGES.letterSpacing.min);
    expect(result.maxLines).toBe(TYPE_RANGES.maxLines.max);
  });

  it("rounds the number of lines to a whole number", () => {
    expect(normalizeTypeFields({ maxLines: 2.6 }).maxLines).toBe(3);
  });

  it("drops unknown weights and non-numbers", () => {
    expect(normalizeTypeFields({ fontWeight: 450 }).fontWeight).toBeUndefined();
    expect(normalizeTypeFields({ fontWeight: "700" }).fontWeight).toBe(
      undefined
    );
    expect(normalizeTypeFields({ fontWeight: 700 }).fontWeight).toBe(700);
    expect(normalizeTypeFields({ lineHeight: Number.NaN })).toEqual({});
  });

  it("drops unknown typefaces, transforms and alignments", () => {
    expect(
      normalizeTypeFields({
        fontFamily: "Comic Sans",
        textTransform: "shout",
        textAlign: "diagonal",
        italic: "yes",
      })
    ).toEqual({});
  });

  it("accepts every typeface the fonts dialog offers and earlier names", () => {
    typefaceChoices().forEach((choice) => {
      expect(normalizeTypeFields({ fontFamily: choice.key }).fontFamily).toBe(
        choice.key
      );
    });
    expect(normalizeTypeFields({ fontFamily: "Roboto" }).fontFamily).toBe(
      "Roboto"
    );
    expect(normalizeTypeFields({ fontFamily: "theme" }).fontFamily).toBe(
      undefined
    );
  });
});

describe("stored appearance with type fields", () => {
  it("still loads data saved before the new fields existed", () => {
    expect(
      normalizeAppearance({
        fontFamily: "Georgia",
        fontWeight: 600,
        textColor: "#112233",
      })
    ).toEqual({ fontFamily: "Georgia", fontWeight: 600, textColor: "#112233" });
  });

  it("keeps new fields and sanitises them on load", () => {
    expect(
      normalizeAppearance({
        italic: true,
        textAlign: "center",
        lineHeight: 50,
        textTransform: "bogus",
      })
    ).toEqual({
      italic: true,
      textAlign: "center",
      lineHeight: TYPE_RANGES.lineHeight.max,
    });
  });
});

describe("typeFieldsToStyles", () => {
  it("returns nothing for no choices", () => {
    expect(typeFieldsToStyles({})).toEqual({});
  });

  it("writes each choice as a style", () => {
    const styles = typeFieldsToStyles({
      italic: true,
      lineHeight: 1.8,
      letterSpacing: 0.05,
      textTransform: "uppercase",
      textAlign: "justify",
      maxLines: 2,
    });
    expect(styles["font-style"]).toBe("italic");
    expect(styles["line-height"]).toBe("1.8");
    expect(styles["letter-spacing"]).toBe("0.05em");
    expect(styles["text-transform"]).toBe("uppercase");
    expect(styles["text-align"]).toBe("justify");
    expect(styles["-webkit-line-clamp"]).toBe("2");
    expect(styles.overflow).toBe("hidden");
  });

  it("never makes the family variable refer to itself", () => {
    for (const fontFamily of FONT_FAMILIES) {
      if (fontFamily === "theme") {
        continue;
      }
      const styles = typeFieldsToStyles({ fontFamily });
      expect(styles["--ha-font-family-body"]).toBeTruthy();
      expect(styles["--ha-font-family-body"]).not.toContain(
        "var(--ha-font-family-body)"
      );
      expect(styles["--ha-font-family-heading"]).not.toContain(
        "var(--ha-font-family-heading)"
      );
    }
  });

  it("an explicit upright choice overrides an inherited italic", () => {
    expect(typeFieldsToStyles({ italic: false })["font-style"]).toBe("normal");
  });
});

describe("isTextTooSmall", () => {
  it("warns below the readable size", () => {
    expect(isTextTooSmall(14, 0.75)).toBe(true);
    expect(isTextTooSmall(MIN_READABLE_FONT_SIZE, 1)).toBe(false);
    expect(isTextTooSmall(16)).toBe(false);
  });

  it("ignores a size that could not be measured", () => {
    expect(isTextTooSmall(Number.NaN)).toBe(false);
  });
});
