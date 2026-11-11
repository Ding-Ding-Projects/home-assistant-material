import { describe, expect, it } from "vitest";
import { headerCheckboxSelection } from "../../../src/components/data-table/ha-data-table";

describe("headerCheckboxSelection", () => {
  const shown = ["a", "b"];

  it("keeps hidden ticked rows when opted in", () => {
    expect(headerCheckboxSelection(["a", "z"], shown, true, true)).toEqual([
      "a",
      "z",
      "b",
    ]);
    expect(
      headerCheckboxSelection(["a", "b", "z"], shown, false, true)
    ).toEqual(["z"]);
  });

  it("replaces and clears the whole selection otherwise", () => {
    expect(headerCheckboxSelection(["z"], shown, true, false)).toEqual([
      "a",
      "b",
    ]);
    expect(headerCheckboxSelection(["a", "z"], shown, false, false)).toEqual(
      []
    );
  });
});
