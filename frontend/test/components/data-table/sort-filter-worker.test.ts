import { expose } from "comlink";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "../../../src/components/data-table/sort-filter-worker";
import "../../../src/components/data-table/sort-filter-worker";

vi.mock("comlink", () => ({ expose: vi.fn() }));

const { sortData, filterData } = vi.mocked(expose).mock.calls[0][0] as Api;

describe("text filtering", () => {
  const columns = { name: { filterable: true } };
  const rows = [{ name: "Next midnight" }, { name: "Kitchen lamp" }];

  it("finds a row that contains the text", () => {
    expect(filterData(rows, columns, "midnight")).toEqual([rows[0]]);
  });

  it("does not turn a short word into another word", () => {
    // One letter away from "night" in "midnight", but not a typo of it.
    expect(filterData(rows, columns, "light")).toEqual([]);
  });

  it("still forgives a typo in a longer word", () => {
    expect(filterData(rows, columns, "midnaght")).toEqual([rows[0]]);
  });
});

describe("numeric sorting", () => {
  it.each([
    { direction: "asc" as const, expected: ["weak", "strong", "zero", "full"] },
    {
      direction: "desc" as const,
      expected: ["full", "zero", "strong", "weak"],
    },
  ])(
    "keeps unknown readings last when sorting $direction",
    ({ direction, expected }) => {
      const rows = [
        { id: "null", value: null },
        { id: "zero", value: 0 },
        { id: "weak", value: -100 },
        { id: "undefined", value: undefined },
        { id: "full", value: "100" },
        { id: "strong", value: -40 },
        { id: "invalid", value: "unknown" },
      ];
      expect(
        sortData(rows, { type: "numeric" }, direction, "value").map(
          (row) => row.id
        )
      ).toEqual([...expected, "null", "undefined", "invalid"]);
    }
  );
});
