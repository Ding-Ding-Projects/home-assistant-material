import { describe, expect, it } from "vitest";
import {
  computeCardStyleProperties,
  isCardStyleEmpty,
  resetCardStyle,
  sanitizeCardStyleColor,
  sanitizeCardStyleLength,
  setCardStyleValue,
} from "../../../../src/panels/lovelace/common/card-style";

describe("sanitizeCardStyleLength", () => {
  it("accepts plain numbers and lengths", () => {
    expect(sanitizeCardStyleLength(18)).toBe("18px");
    expect(sanitizeCardStyleLength("2")).toBe("2px");
    expect(sanitizeCardStyleLength("1.5rem")).toBe("1.5rem");
    expect(sanitizeCardStyleLength(" 12px ")).toBe("12px");
  });

  it("rejects anything that is not a bounded length", () => {
    expect(sanitizeCardStyleLength(-1)).toBeUndefined();
    expect(sanitizeCardStyleLength(9999)).toBeUndefined();
    expect(sanitizeCardStyleLength("50rem")).toBeUndefined();
    expect(sanitizeCardStyleLength("10px; color: red")).toBeUndefined();
    expect(sanitizeCardStyleLength("calc(1px)")).toBeUndefined();
    expect(sanitizeCardStyleLength(undefined)).toBeUndefined();
    expect(sanitizeCardStyleLength(NaN)).toBeUndefined();
  });
});

describe("sanitizeCardStyleColor", () => {
  it("accepts theme names, hex, functions and variables", () => {
    expect(sanitizeCardStyleColor("red")).toBe("var(--red-color)");
    expect(sanitizeCardStyleColor("#fa0")).toBe("#fa0");
    expect(sanitizeCardStyleColor("#ffaa0080")).toBe("#ffaa0080");
    expect(sanitizeCardStyleColor("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
    expect(sanitizeCardStyleColor("hsl(120deg 50% 40% / 0.5)")).toBe(
      "hsl(120deg 50% 40% / 0.5)"
    );
    expect(sanitizeCardStyleColor("var(--primary-color)")).toBe(
      "var(--primary-color)"
    );
    expect(sanitizeCardStyleColor("transparent")).toBe("transparent");
  });

  it("drops values that could carry extra CSS", () => {
    expect(sanitizeCardStyleColor("red; background: url(x)")).toBeUndefined();
    expect(sanitizeCardStyleColor("url(https://example.com/a.png)")).toBe(
      undefined
    );
    expect(sanitizeCardStyleColor("#12")).toBeUndefined();
    expect(sanitizeCardStyleColor("rgb(1,2,3); x")).toBeUndefined();
    expect(sanitizeCardStyleColor("var(--a); color: red")).toBeUndefined();
    expect(sanitizeCardStyleColor(5)).toBeUndefined();
  });
});

describe("computeCardStyleProperties", () => {
  it("maps every value to the properties the shared card reads", () => {
    expect(
      computeCardStyleProperties({
        font_size: 18,
        text_color: "red",
        icon_color: "#fa0",
        border_width: 2,
        border_color: "blue",
        border_radius: 24,
        background: "white",
      })
    ).toMatchObject({
      "font-size": "18px",
      "--ha-tile-info-primary-font-size": "18px",
      "--primary-text-color": "var(--red-color)",
      "--state-icon-color": "#fa0",
      "--ha-card-border-width": "2px",
      "--ha-card-border-color": "var(--blue-color)",
      "--ha-card-border-radius": "24px",
      "--ha-card-background": "var(--white-color)",
    });
  });

  it("returns nothing for missing or invalid input", () => {
    expect(computeCardStyleProperties(undefined)).toEqual({});
    expect(computeCardStyleProperties({ font_size: "huge" })).toEqual({});
    expect(isCardStyleEmpty({ text_color: "not a colour" })).toBe(true);
    expect(isCardStyleEmpty({ border_radius: 8 })).toBe(false);
  });
});

describe("setCardStyleValue and resetCardStyle", () => {
  it("sets, clears and removes an empty style block without mutating", () => {
    const card: Record<string, unknown> = { type: "tile", entity: "light.a" };
    const withRadius = setCardStyleValue(card, "border_radius", 12);
    expect(withRadius.style).toEqual({ border_radius: 12 });
    expect(card).toEqual({ type: "tile", entity: "light.a" });

    const cleared = setCardStyleValue(withRadius, "border_radius", undefined);
    expect("style" in cleared).toBe(false);

    expect("style" in resetCardStyle(withRadius)).toBe(false);
  });
});
