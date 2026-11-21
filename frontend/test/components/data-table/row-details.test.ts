import { describe, expect, it } from "vitest";
import {
  isRowDetailsItem,
  pruneRowDetails,
  toggleRowDetails,
  withRowDetails,
} from "../../../src/components/data-table/row-details";

describe("toggleRowDetails", () => {
  it("opens one row at a time by default", () => {
    expect(toggleRowDetails([], "a")).toEqual(["a"]);
    expect(toggleRowDetails(["a"], "b")).toEqual(["b"]);
  });

  it("closes an open row", () => {
    expect(toggleRowDetails(["a"], "a")).toEqual([]);
    expect(toggleRowDetails(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("keeps other rows open when several are allowed", () => {
    expect(toggleRowDetails(["a"], "b", true)).toEqual(["a", "b"]);
  });
});

describe("withRowDetails", () => {
  const rows = [
    { id: "a" },
    { append: true, groupHeader: "g", content: "header" },
    { id: "b" },
    { id: 3 },
    { empty: true },
  ];

  it("returns the same list when nothing is open", () => {
    expect(withRowDetails(rows, [], "id")).toBe(rows);
  });

  it("puts the details right under each open row", () => {
    const items = withRowDetails(rows, ["b", "3"], "id");
    expect(items).toEqual([
      { id: "a" },
      { append: true, groupHeader: "g", content: "header" },
      { id: "b" },
      { detailsFor: "b" },
      { id: 3 },
      { detailsFor: "3" },
      { empty: true },
    ]);
  });

  it("adds nothing for a row that is not shown", () => {
    expect(withRowDetails(rows, ["gone"], "id")).toEqual(rows);
  });

  it("never adds details under a group header or the end space", () => {
    const items = withRowDetails(
      [
        { id: "x", append: true },
        { id: "y", empty: true },
      ],
      ["x", "y"],
      "id"
    );
    expect(items.filter(isRowDetailsItem)).toEqual([]);
  });
});

describe("pruneRowDetails", () => {
  it("drops rows that no longer exist", () => {
    expect(pruneRowDetails(["a", "b"], new Set(["b"]))).toEqual(["b"]);
  });

  it("returns the same list when every row still exists", () => {
    const open = ["a"];
    expect(pruneRowDetails(open, new Set(["a", "b"]))).toBe(open);
  });
});

describe("isRowDetailsItem", () => {
  it("tells detail items from rows", () => {
    expect(isRowDetailsItem({ detailsFor: "a" })).toBe(true);
    expect(isRowDetailsItem({ id: "a" })).toBe(false);
    expect(isRowDetailsItem(undefined)).toBe(false);
  });
});
