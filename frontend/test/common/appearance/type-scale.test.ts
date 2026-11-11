import { afterEach, describe, expect, it } from "vitest";
import {
  applyTypeScale,
  computeTypeScale,
  DEFAULT_TYPE_SCALE,
  normalizeTypeScale,
  RATIO_MAX,
  RATIO_MIN,
  sanitizeRatio,
  startTypeScale,
  TYPE_SCALE_STEPS,
  TYPE_SCALE_STORAGE_KEY,
  typeScaleToVariables,
} from "../../../src/common/appearance/type-scale";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  claimSyncOwner,
  forgetClaimedOwner,
} from "../../../src/common/instance-sync/sync-owner";

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

describe("the default scale", () => {
  it("gives the theme's own sizes, so switching it on changes nothing", () => {
    const variables = typeScaleToVariables({
      ...DEFAULT_TYPE_SCALE,
      enabled: true,
    });
    const expected: Record<string, number> = {
      "--ha-font-size-xs": 10,
      "--ha-font-size-s": 12,
      "--ha-font-size-m": 14,
      "--ha-font-size-l": 16,
      "--ha-font-size-xl": 20,
      "--ha-font-size-2xl": 24,
      "--ha-font-size-3xl": 28,
      "--ha-font-size-4xl": 32,
      "--ha-font-size-5xl": 40,
    };
    for (const [token, size] of Object.entries(expected)) {
      expect(variables[token], token).toBe(
        `calc(${size}px * var(--ha-font-size-scale, 1))`
      );
    }
  });

  it("widens the gaps with a larger ratio and scales everything with the base", () => {
    const wide = computeTypeScale({
      ...DEFAULT_TYPE_SCALE,
      enabled: true,
      ratio: 1.333,
    });
    expect(wide.display).toBeGreaterThan(40);
    expect(wide.body).toBe(14);
    const big = computeTypeScale({
      ...DEFAULT_TYPE_SCALE,
      enabled: true,
      base: 18,
    });
    expect(big.body).toBe(18);
    expect(big.title).toBeCloseTo((20 * 18) / 14, 1);
  });
});

describe("startTypeScale", () => {
  const root = document.documentElement;
  const bodyVariable = () => root.style.getPropertyValue("--ha-font-size-m");
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
    forgetClaimedOwner();
    window.localStorage.clear();
    getStorage().setValue(TYPE_SCALE_STORAGE_KEY, undefined);
    applyTypeScale(DEFAULT_TYPE_SCALE);
  });

  it("applies a stored scale that was held back until the account claimed the cache", () => {
    window.localStorage.setItem("instanceSync.owner", "user-1");
    window.localStorage.setItem(
      TYPE_SCALE_STORAGE_KEY,
      JSON.stringify({ enabled: true, base: 16, ratio: 1.2, overrides: {} })
    );
    stop = startTypeScale();
    expect(bodyVariable()).toBe("");
    expect(claimSyncOwner("user-1", [])).toBe(true);
    expect(bodyVariable()).toBe("calc(16px * var(--ha-font-size-scale, 1))");
  });

  it("follows a value that arrives later and one that is removed", () => {
    stop = startTypeScale();
    expect(bodyVariable()).toBe("");
    const arrive = (newValue: string | null) =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TYPE_SCALE_STORAGE_KEY,
          newValue,
          storageArea: window.localStorage,
        })
      );
    arrive(JSON.stringify({ enabled: true, base: 18, ratio: 1.2 }));
    expect(bodyVariable()).toBe("calc(18px * var(--ha-font-size-scale, 1))");
    arrive(null);
    expect(bodyVariable()).toBe("");
  });

  it("ignores other keys", () => {
    stop = startTypeScale();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "somethingElse",
        newValue: JSON.stringify({ enabled: true }),
        storageArea: window.localStorage,
      })
    );
    expect(bodyVariable()).toBe("");
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
