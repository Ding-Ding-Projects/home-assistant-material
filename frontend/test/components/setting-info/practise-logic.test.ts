import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampNumber,
  evaluateNumber,
  evaluatePractise,
  evaluateSwitch,
  evaluateText,
  initialPractiseValue,
  snapToStep,
  usableExamples,
} from "../../../src/components/setting-info/practise-logic";
import type {
  PractiseNumberSpec,
  PractiseTextSpec,
} from "../../../src/components/setting-info/practise-logic";

afterEach(() => {
  vi.restoreAllMocks();
});

const percent: PractiseNumberSpec = {
  type: "number",
  min: 0,
  max: 100,
  step: 5,
  initial: 50,
};

describe("number practise", () => {
  it("accepts a value inside the range and on a step", () => {
    expect(evaluateNumber(percent, 35)).toMatchObject({
      state: "ok",
      code: "number_ok",
      value: 35,
    });
    expect(evaluateNumber(percent, "70")).toMatchObject({
      state: "ok",
      value: 70,
    });
  });

  it("clamps to the nearest end and says which end", () => {
    expect(evaluateNumber(percent, 250)).toMatchObject({
      state: "adjusted",
      code: "number_clamped_max",
      value: 100,
    });
    expect(evaluateNumber(percent, -3)).toMatchObject({
      state: "adjusted",
      code: "number_clamped_min",
      value: 0,
    });
  });

  it("snaps a value between steps to the nearest step", () => {
    expect(evaluateNumber(percent, 42)).toMatchObject({
      state: "adjusted",
      code: "number_snapped",
      value: 40,
    });
  });

  it("refuses text that is not a number and keeps a usable value", () => {
    for (const raw of ["abc", "", "  ", "NaN", "Infinity"]) {
      expect(evaluateNumber(percent, raw)).toMatchObject({
        state: "invalid",
        code: "number_invalid",
        value: 50,
      });
    }
  });

  it("treats a reversed range as swapped", () => {
    expect(clampNumber(5, 10, 0)).toBe(5);
    expect(clampNumber(50, 10, 0)).toBe(10);
  });

  it("does not leave floating point noise when snapping", () => {
    expect(snapToStep(0.30000000000000004, 0, 0.1)).toBe(0.3);
  });
});

describe("text practise", () => {
  const hostname: PractiseTextSpec = {
    type: "text",
    rule: { kind: "pattern", pattern: "[a-z0-9-]+" },
  };

  it("accepts text that matches the whole rule", () => {
    expect(evaluateText(hostname, "my-home")).toMatchObject({
      state: "ok",
      code: "text_ok",
    });
  });

  it("gives an invalid-text result for a partial match", () => {
    expect(evaluateText(hostname, "my home")).toMatchObject({
      state: "invalid",
      code: "text_pattern",
    });
  });

  it("says empty text is empty before applying any rule", () => {
    expect(evaluateText(hostname, "   ")).toMatchObject({
      state: "invalid",
      code: "text_empty",
    });
  });

  it("checks a length rule by characters", () => {
    const spec: PractiseTextSpec = {
      type: "text",
      rule: { kind: "length", min: 3, max: 5 },
    };
    expect(evaluateText(spec, "ab").code).toBe("text_too_short");
    expect(evaluateText(spec, "abcdef").code).toBe("text_too_long");
    expect(evaluateText(spec, "abcd").state).toBe("ok");
    expect(evaluateText(spec, "你好嗎").state).toBe("ok");
  });

  it("reports a broken rule instead of throwing", () => {
    const spec: PractiseTextSpec = {
      type: "text",
      rule: { kind: "pattern", pattern: "(" },
    };
    expect(evaluateText(spec, "x")).toMatchObject({
      state: "invalid",
      code: "text_rule_broken",
    });
  });
});

describe("switch and dispatch", () => {
  it("reports the switch position", () => {
    expect(evaluateSwitch(true).code).toBe("switch_on");
    expect(evaluateSwitch(false).code).toBe("switch_off");
  });

  it("starts each control type from its own initial value", () => {
    expect(initialPractiseValue({ type: "switch" })).toBe(false);
    expect(initialPractiseValue({ type: "switch", initial: true })).toBe(true);
    expect(initialPractiseValue({ ...percent, initial: 500 })).toBe(100);
    expect(
      initialPractiseValue({
        type: "text",
        rule: { kind: "length", min: 1 },
      })
    ).toBe("");
  });

  it("routes a value to the rule of the spec", () => {
    expect(evaluatePractise(percent, 120).value).toBe(100);
    expect(evaluatePractise({ type: "switch" }, true).code).toBe("switch_on");
  });
});

describe("nothing is persisted or sent", () => {
  it("makes no storage, network or beacon call for any input", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: beacon,
    });

    evaluateSwitch(true);
    evaluateNumber(percent, 9999);
    evaluateNumber(percent, "abc");
    evaluateText(
      { type: "text", rule: { kind: "pattern", pattern: "[a-z]+" } },
      "ABC"
    );
    initialPractiseValue(percent);

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("examples", () => {
  it("drops rows that are missing a part", () => {
    expect(
      usableExamples([
        { input: "30", result: "Thirty seconds" },
        { input: "", result: "x" },
        { input: "y", result: "" },
      ])
    ).toEqual([{ input: "30", result: "Thirty seconds" }]);
    expect(usableExamples(undefined)).toEqual([]);
  });
});
