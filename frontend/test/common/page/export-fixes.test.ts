import { describe, expect, it } from "vitest";
import type { PageExport } from "../../../src/common/page/export-page";
import {
  cellText,
  EXPORT_ROW_LIMIT,
  markdownCell,
  readDataTable,
  rowLimitNotice,
  toHtml,
  toJson,
  toMarkdown,
  toText,
  uniqueColumnNames,
} from "../../../src/common/page/export-page";

// Protects the exported files from losing or misreading data: two columns
// with one title must both survive in JSON, a cell must stay text in
// Markdown, a cut table must say so, and a counter must not become a date.

const page = (over: Partial<PageExport> = {}): PageExport => ({
  title: "T",
  url: "/x",
  exportedAt: "2026-11-10T09:30:00+08:00",
  text: [],
  tables: [],
  ...over,
});

describe("JSON column titles", () => {
  it("keeps every column when two share a title", () => {
    expect(uniqueColumnNames(["Name", "Name", "Area", "Name"])).toEqual([
      "Name",
      "Name (2)",
      "Area",
      "Name (3)",
    ]);
    const json = JSON.parse(
      toJson(
        page({
          tables: [{ columns: ["Name", "Name"], rows: [["a", "b"]] }],
        })
      )
    );
    expect(json.tables[0].rows[0]).toEqual({ Name: "a", "Name (2)": "b" });
  });
});

describe("Markdown cells", () => {
  it("keeps link, image, HTML and emphasis syntax as plain text", () => {
    expect(markdownCell("[x](http://e.example)")).toBe(
      "\\[x\\](http://e.example)"
    );
    expect(markdownCell("![i](u)")).toBe("\\!\\[i\\](u)");
    expect(markdownCell("<img src=x onerror=1>")).toBe(
      "\\<img src=x onerror=1\\>"
    );
    expect(markdownCell("*a* _b_ `c`")).toBe("\\*a\\* \\_b\\_ \\`c\\`");
    expect(markdownCell("a|b\nc")).toBe("a\\|b c");
  });

  it("applies to every table cell", () => {
    const text = toMarkdown(
      page({ tables: [{ columns: ["A"], rows: [["<b>x</b>"]] }] })
    );
    expect(text).toContain("| \\<b\\>x\\</b\\> |");
  });
});

describe("the row limit", () => {
  const rows = Array.from({ length: EXPORT_ROW_LIMIT + 5 }, (_v, index) => ({
    id: String(index),
    name: `n${index}`,
  }));
  const table = Object.assign(document.createElement("div"), {
    columns: { name: { title: "Name" } },
    data: rows,
  });

  it("cuts the table and records the real size", () => {
    const read = readDataTable(table)!;
    expect(read.rows).toHaveLength(EXPORT_ROW_LIMIT);
    expect(read.totalRows).toBe(EXPORT_ROW_LIMIT + 5);
    expect(rowLimitNotice(read)).toBe(
      `Only the first ${EXPORT_ROW_LIMIT} of ${EXPORT_ROW_LIMIT + 5} rows are included.`
    );
  });

  it("says so in the formats that can carry a note", () => {
    const read = readDataTable(table)!;
    const p = page({ tables: [read] });
    expect(toMarkdown(p)).toContain("Only the first");
    expect(toText(p)).toContain("Only the first");
    expect(toHtml(p)).toContain("Only the first");
    expect(JSON.parse(toJson(p)).tables[0].total_rows).toBe(
      EXPORT_ROW_LIMIT + 5
    );
  });

  it("adds no notice for a table that fits", () => {
    expect(rowLimitNotice({ columns: ["A"], rows: [["x"]] })).toBeUndefined();
  });
});

describe("time columns", () => {
  it("turns a moment into a date only for a key that ends in a time word", () => {
    expect(cellText(1794288651, "created_at")).toBe("2026-11-10T05:30:51Z");
    expect(cellText(1794288651, "last_seen")).toBe("2026-11-10T05:30:51Z");
    expect(cellText(1794288651, "triggered_count")).toBe("1794288651");
    expect(cellText(1794288651, "time_zone_offset")).toBe("1794288651");
  });
});

describe("HTML language", () => {
  it("uses the language of the page and falls back to English", () => {
    expect(toHtml(page({ lang: "nl" }))).toContain('<html lang="nl">');
    expect(toHtml(page({ lang: "zh-Hans" }))).toContain(
      '<html lang="zh-Hans">'
    );
    expect(toHtml(page())).toContain('<html lang="en">');
    expect(toHtml(page({ lang: '"><script>' }))).toContain('<html lang="en">');
  });
});

describe("selection under a filter", () => {
  it("exports every ticked row, also those the filter hides", () => {
    const table = Object.assign(document.createElement("div"), {
      id: "id",
      columns: { name: { title: "Name" } },
      data: [
        { id: "a", name: "Lamp" },
        { id: "b", name: "Fan" },
        { id: "c", name: "Tv" },
      ],
      _filteredData: [{ id: "a", name: "Lamp" }],
      getCheckedRowIds: () => ["a", "c"],
    });
    const read = readDataTable(table)!;
    expect(read.rows).toEqual([["Lamp"]]);
    expect(read.selectedRows).toEqual([["Lamp"], ["Tv"]]);
  });
});
