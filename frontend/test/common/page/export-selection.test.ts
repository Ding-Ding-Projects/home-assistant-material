import { describe, expect, it } from "vitest";
import type { PageExport } from "../../../src/common/page/export-page";
import {
  exportContent,
  readDataTable,
  selectedRowCount,
  selectionOnly,
  toTsv,
} from "../../../src/common/page/export-page";

// Protects "export only what is selected" and the tab separated format:
// a selection that exports other rows would leak data a person left out,
// and a tab inside a cell would shift every column after it.

const table = {
  id: "entity_id",
  columns: {
    name: { title: "Name" },
    area: { title: "Area" },
  },
  data: [
    { entity_id: "a", name: "Lamp", area: "Hall" },
    { entity_id: "b", name: "Fan", area: "Den" },
    { entity_id: "c", name: "Tv", area: "Den" },
  ],
  _checkedRows: ["c", "a"],
} as unknown as HTMLElement;

describe("readDataTable selection", () => {
  it("reads the ticked rows in the order the list shows them", () => {
    const read = readDataTable(table as never)!;
    expect(read.rows).toHaveLength(3);
    expect(read.selectedRows).toEqual([
      ["Lamp", "Hall"],
      ["Tv", "Den"],
    ]);
  });

  it("has no selected rows when nothing is ticked", () => {
    const read = readDataTable({ ...table, _checkedRows: [] } as never)!;
    expect(read.selectedRows).toBeUndefined();
  });
});

const page = (): PageExport => ({
  title: "Entities",
  url: "/config/entities",
  exportedAt: "2026-11-10T09:30:00+08:00",
  text: ["Entities"],
  tables: [
    readDataTable(table as never)!,
    { columns: ["Other"], rows: [["x"]] },
  ],
});

describe("selectionOnly", () => {
  it("keeps only tables that have ticked rows, with only those rows", () => {
    const only = selectionOnly(page());
    expect(only.tables).toHaveLength(1);
    expect(only.tables[0].rows).toEqual([
      ["Lamp", "Hall"],
      ["Tv", "Den"],
    ]);
    expect(only.text).toEqual([]);
    expect(selectedRowCount(page())).toBe(2);
  });

  it("is what every format exports when the selection is asked for", () => {
    const csv = exportContent(page(), "csv", 0, true).content;
    expect(csv).toBe("Name,Area\r\nLamp,Hall\r\nTv,Den");
    expect(exportContent(page(), "json", 0, true).content).not.toContain("Fan");
    expect(exportContent(page(), "csv", 0, false).content).toContain("Fan");
  });
});

describe("toTsv", () => {
  it("separates with tabs and keeps cells from moving the columns", () => {
    expect(
      toTsv({
        columns: ["A", "B"],
        rows: [
          ["one\ttwo", "line\nbreak"],
          ["=1+1", "ok"],
        ],
      })
    ).toBe("A\tB\r\none two\tline break\r\n'=1+1\tok");
  });
});
