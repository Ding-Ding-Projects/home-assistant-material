import { describe, expect, it } from "vitest";
import {
  computeTypeScale,
  DEFAULT_TYPE_SCALE,
  normalizeTypeScale,
  RATIO_MAX,
  RATIO_MIN,
  sanitizeRatio,
  TYPE_SCALE_STEPS,
  typeScaleToVariables,
} from "../../../src/common/appearance/type-scale";

// The type scale is stored by a person and written into a style on the whole
// page. These protect three things: stored data can only become bounded
// numbers, the steps always grow from caption to display, and a scale that is
// off writes nothing.

describe("sanitizeRatio", () => {
  it("clamps to the allowed range", () => {
    expect(sanitizeRatio(0.5)).toBe(RATIO_MIN);
    expect(sanitizeRatio(9)).toBe(RATIO_MAX);
    expect(sanitizeRatio(1.333)).toBe(1.333);
  });

  it("falls back to the default for anything that is not a finite number", () => {
    for (const bad of [NaN, Infinity, "abc", "", null, undefined, {}, []]) {
      expect(sanitizeRatio(bad)).toBe(DEFAULT_TYPE_SCALE.ratio);
    }
  });

  it("accepts a number stored as text and rounds it", () => {
    expect(sanitizeRatio("1.25")).toBe(1.25);
    expect(sanitizeRatio(1.23456789)).toBe(1.235);
  });
});

describe("computeTypeScale", () => {
  it("grows from caption to display for every preset and the limits", () => {
    for (const ratio of [RATIO_MIN, 1.125, 1.2, 1.25, 1.333, RATIO_MAX]) {
      for (const base of [12, 14, 20]) {
        const sizes = computeTypeScale({
          ...DEFAULT_TYPE_SCALE,
          enabled: true,
          base,
          ratio,
        });
        const list = TYPE_SCALE_STEPS.map((step) => sizes[step]);
        for (let i = 1; i < list.length; i++) {
          expect(list[i]).toBeGreaterThan(list[i - 1]);
        }
        expect(sizes.body).toBe(base);
      }
    }
  });

  it("uses an override for one step and leaves the others alone", () => {
    const plain = computeTypeScale({ ...DEFAULT_TYPE_SCALE, enabled: true });
    const changed = computeTypeScale({
      ...DEFAULT_TYPE_SCALE,
      enabled: true,
      overrides: { title: 30 },
    });
    expect(changed.title).toBe(30);
    expect(changed.body).toBe(plain.body);
    expect(changed.display).toBe(plain.display);
  });
});

describe("normalizeTypeScale", () => {
  it("survives corrupt stored values", () => {
    const corrupt: unknown[] = [
      undefined,
      null,
      42,
      "not json",
      "[1,2]",
      [],
      { enabled: "yes", base: "wide", ratio: NaN, overrides: "x" },
      { overrides: { title: NaN, body: -5, display: "1e9", other: 12 } },
    ];
    for (const value of corrupt) {
      const settings = normalizeTypeScale(value);
      expect(settings.enabled).toBe(false);
      expect(settings.ratio).toBeGreaterThanOrEqual(RATIO_MIN);
      expect(settings.ratio).toBeLessThanOrEqual(RATIO_MAX);
      expect(Number.isFinite(settings.base)).toBe(true);
      expect(Object.keys(settings.overrides)).not.toContain("other");
    }
    expect(normalizeTypeScale({ overrides: { title: NaN } }).overrides).toEqual(
      {}
    );
    expect(
      normalizeTypeScale({ overrides: { display: "1e9" } }).overrides.display
    ).toBe(96);
  });

  it("reads a value that was stored as JSON text", () => {
    const settings = normalizeTypeScale(
      JSON.stringify({ enabled: true, base: 16, ratio: 1.25 })
    );
    expect(settings).toMatchObject({ enabled: true, base: 16, ratio: 1.25 });
  });
});

describe("typeScaleToVariables", () => {
  it("writes nothing while the scale is off", () => {
    expect(typeScaleToVariables(DEFAULT_TYPE_SCALE)).toEqual({});
  });

  it("multiplies every step by the accessibility text size", () => {
    const variables = typeScaleToVariables({
      ...DEFAULT_TYPE_SCALE,
      enabled: true,
    });
    expect(Object.keys(variables)).toHaveLength(9);
    for (const value of Object.values(variables)) {
      expect(value).toMatch(
        /^calc\(\d+(\.\d+)?px \* var\(--ha-font-size-scale, 1\)\)$/
      );
    }
  });

  it("writes sizes that never shrink from xs to 5xl", () => {
    const order = ["xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl"];
    for (const ratio of [RATIO_MIN, 1.125, 1.2, 1.25, 1.333, RATIO_MAX]) {
      for (const base of [12, 14, 20]) {
        const variables = typeScaleToVariables({
          ...DEFAULT_TYPE_SCALE,
          enabled: true,
          base,
          ratio,
        });
        const sizes = order.map((name) =>
          parseFloat(variables[`--ha-font-size-${name}`].replace("calc(", ""))
        );
        expect(sizes.every((size) => Number.isFinite(size))).toBe(true);
        for (let i = 1; i < sizes.length; i++) {
          expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
        }
      }
    }
  });
});
