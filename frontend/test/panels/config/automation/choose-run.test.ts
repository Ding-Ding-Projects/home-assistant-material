import { describe, expect, it } from "vitest";
import {
  getChooseOutcome,
  getTestableConditions,
} from "../../../../src/panels/config/automation/option/choose-run";

const pass = { status: "pass" } as const;
const fail = { status: "fail" } as const;
const broken = { status: "error", message: "x" } as const;

describe("getChooseOutcome", () => {
  it("picks the first option that passes, not a later one", () => {
    expect(getChooseOutcome([fail, pass, pass], true)).toEqual({
      kind: "option",
      index: 1,
    });
  });

  it("falls back to the default actions when nothing passes", () => {
    expect(getChooseOutcome([fail, fail], true)).toEqual({ kind: "default" });
  });

  it("runs nothing when nothing passes and there is no default", () => {
    expect(getChooseOutcome([fail], false)).toEqual({ kind: "none" });
    expect(getChooseOutcome([], false)).toEqual({ kind: "none" });
  });

  it("is unknown once an option before the first pass cannot be tested", () => {
    expect(getChooseOutcome([fail, broken, pass], true)).toEqual({
      kind: "unknown",
      index: 1,
    });
  });

  it("ignores an untestable option after the winner", () => {
    expect(getChooseOutcome([pass, broken], false)).toEqual({
      kind: "option",
      index: 0,
    });
  });
});

describe("getTestableConditions", () => {
  it("drops the enabled flag and keeps template strings", () => {
    expect(
      getTestableConditions({
        conditions: [{ condition: "sun", enabled: false }, "{{ true }}"] as any,
        sequence: [],
      })
    ).toEqual([{ condition: "sun" }, "{{ true }}"]);
  });

  it("treats a missing conditions list as empty", () => {
    expect(getTestableConditions({ sequence: [] } as any)).toEqual([]);
  });
});
