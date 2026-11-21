import { describe, expect, it } from "vitest";
import type { DataTableColumnContainer } from "../../../src/components/data-table/ha-data-table";
import {
  narrowRowEntries,
  splitNarrowRow,
} from "../../../src/components/data-table/narrow-row-order";

// Protects the Labels list on a 320 px phone in selection mode: the checkbox
// takes room at the start of the row, so the colour moves after the name and
// the name keeps the first line. No cell may be lost or duplicated, and
// outside selection mode the order stays as the page wrote it.

const columns: DataTableColumnContainer = {
  icon: { title: "", type: "icon", showNarrow: true },
  color: {
    title: "",
    type: "icon",
    showNarrow: true,
    narrowSelectAfterName: true,
  },
  name: { title: "Name", main: true },
  details: { title: "", showNarrow: true, narrowWrap: true },
  actions: { title: "", showNarrow: true, lastFixed: true },
};

const keys = (selecting: boolean) =>
  narrowRowEntries(columns, selecting).map(([key, , moved]) =>
    moved ? `${key}*` : key
  );

describe("narrow row order", () => {
  it("keeps the page's order outside selection mode", () => {
    expect(keys(false)).toEqual([
      "icon",
      "color",
      "name",
      "details",
      "actions",
    ]);
  });

  it("moves the marked cell after the name while selecting", () => {
    expect(keys(true)).toEqual([
      "icon",
      "name",
      "color*",
      "details",
      "actions",
    ]);
  });

  it("leaves a table without a name column alone", () => {
    const plain: DataTableColumnContainer = {
      a: { title: "A", narrowSelectAfterName: true },
      b: { title: "B" },
    };
    expect(narrowRowEntries(plain, true).map(([key]) => key)).toEqual([
      "a",
      "b",
    ]);
  });
});

// Protects the phone rows whose controls move under the name: the cells after
// the name are kept together, so they move as one group at the end of the row
// in their own order and no single button is left on a line by itself.
describe("splitNarrowRow", () => {
  it("keeps the cells after the name together, in order", () => {
    const { lead, trail } = splitNarrowRow(narrowRowEntries(columns, false));
    expect(lead.map(([key]) => key)).toEqual(["icon", "color", "name"]);
    expect(trail.map(([key]) => key)).toEqual(["details", "actions"]);
  });

  it("puts a cell moved after the name in the group, first", () => {
    const { trail } = splitNarrowRow(narrowRowEntries(columns, true));
    expect(trail.map(([key]) => key)).toEqual(["color", "details", "actions"]);
  });

  it("leaves a table without a name column whole", () => {
    const plain: DataTableColumnContainer = { a: { title: "A" } };
    const { lead, trail } = splitNarrowRow(narrowRowEntries(plain, false));
    expect(lead.map(([key]) => key)).toEqual(["a"]);
    expect(trail).toEqual([]);
  });
});
