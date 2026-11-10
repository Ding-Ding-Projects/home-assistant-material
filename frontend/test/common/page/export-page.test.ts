import { describe, expect, it } from "vitest";
import type { PageExport } from "../../../src/common/page/export-page";
import {
  exportContent,
  exportFileName,
  readDataTable,
  toCsv,
  toHtml,
  toJson,
  toMarkdown,
} from "../../../src/common/page/export-page";

// Protects the exported files: a CSV a spreadsheet cannot be tricked by,
// documents whose markup cannot be broken by the data, and that only the
// columns a person sees are exported.

const page: PageExport = {
  title: "Devices & more",
  url: "/config/devices/dashboard",
  exportedAt: "2026-11-10T09:30:00+08:00",
  text: ["Devices", "2 devices"],
  tables: [
    {
      columns: ["Name", "Area"],
      rows: [
        ["Lamp, tall", "Living room"],
        ['=HYPERLINK("http://x")', "Hall | <b>"],
      ],
    },
  ],
};

describe("toCsv", () => {
  it("quotes cells and disarms formulas", () => {
    expect(toCsv(page.tables[0])).toBe(
      'Name,Area\r\n"Lamp, tall",Living room\r\n"\'=HYPERLINK(""http://x"")",Hall | <b>'
    );
  });

  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx"])(
    "puts a quote before %j",
    (value) => {
      expect(toCsv({ columns: ["A"], rows: [[value]] }).split("\r\n")[1]).toBe(
        `'${value}`
      );
    }
  );
});

describe("documents", () => {
  it("escapes table cells in Markdown", () => {
    expect(toMarkdown(page)).toContain("| Hall \\| <b> |");
  });

  it("escapes everything in HTML", () => {
    const document = toHtml(page);
    expect(document).toContain("<title>Devices &amp; more</title>");
    expect(document).toContain("<td>Hall | &lt;b&gt;</td>");
    expect(document).not.toContain("<b>");
    expect(document).not.toContain("<script");
  });

  it("writes rows as objects in JSON", () => {
    expect(JSON.parse(toJson(page)).tables[0].rows[0]).toEqual({
      Name: "Lamp, tall",
      Area: "Living room",
    });
  });

  it("offers no CSV content without a table", () => {
    expect(exportContent({ ...page, tables: [] }, "csv").content).toBe("");
  });
});

describe("exportFileName", () => {
  it("is made from the title and the date", () => {
    expect(exportFileName(page, "csv")).toBe("devices-more-2026-11-10.csv");
  });

  it("has a name when the title has no letters", () => {
    expect(exportFileName({ ...page, title: "设备" }, "md")).toBe(
      "page-2026-11-10.md"
    );
  });
});

describe("readDataTable", () => {
  it("exports named, visible columns of the filtered rows", () => {
    const table = Object.assign(document.createElement("div"), {
      columns: {
        icon: { title: "", type: "icon" },
        name: { title: "Name" },
        secret: { title: "Secret", hidden: true },
        labels: { title: "Labels" },
        actions: { title: "", type: "overflow-menu" },
      },
      data: [{ name: "ignored" }],
      _filteredData: [
        { name: "Lamp", secret: "x", labels: ["a", "b"], icon: "i" },
        { name: 5, labels: [undefined, null, "c"] },
      ],
    });
    expect(readDataTable(table)).toEqual({
      columns: ["Name", "Labels"],
      rows: [
        ["Lamp", "a, b"],
        ["5", "c"],
      ],
    });
  });

  it("writes a stored moment as a date, and leaves other numbers alone", () => {
    const table = Object.assign(document.createElement("div"), {
      columns: {
        created_at: { title: "Created" },
        battery: { title: "Battery" },
      },
      data: [{ created_at: 1794288651.1, battery: 1794288651 }],
    });
    expect(readDataTable(table)?.rows).toEqual([
      ["2026-11-10T05:30:51Z", "1794288651"],
    ]);
  });
});
