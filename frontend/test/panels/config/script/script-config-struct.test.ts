import { describe, expect, it } from "vitest";
import { is } from "superstruct";
import { MODES } from "../../../../src/data/script";
import {
  parseMaxRuns,
  scriptConfigStruct,
} from "../../../../src/panels/config/script/script-config-struct";

describe("scriptConfigStruct mode", () => {
  it.each([...MODES])("accepts mode %s", (mode) => {
    expect(is({ sequence: [], mode }, scriptConfigStruct)).toBe(true);
  });

  it("accepts a script without a mode", () => {
    expect(is({ sequence: [] }, scriptConfigStruct)).toBe(true);
  });

  it("refuses an unknown mode", () => {
    expect(is({ sequence: [], mode: "object" }, scriptConfigStruct)).toBe(
      false
    );
  });
});

describe("parseMaxRuns", () => {
  it("reads whole numbers of 1 or more", () => {
    expect(parseMaxRuns("1")).toEqual({ valid: true, max: 1 });
    expect(parseMaxRuns(" 10 ")).toEqual({ valid: true, max: 10 });
  });

  it("rounds a fraction down", () => {
    expect(parseMaxRuns("2.9")).toEqual({ valid: true, max: 2 });
  });

  it("refuses values below 1 and says so", () => {
    expect(parseMaxRuns("0")).toEqual({ valid: false, empty: false });
    expect(parseMaxRuns("-3")).toEqual({ valid: false, empty: false });
    expect(parseMaxRuns("abc")).toEqual({ valid: false, empty: false });
  });

  it("tells an empty field apart", () => {
    expect(parseMaxRuns("")).toEqual({ valid: false, empty: true });
  });
});
