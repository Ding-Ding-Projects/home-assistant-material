import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterDays,
  parseChangelog,
  splitCode,
} from "../../../src/common/changelog/parse-changelog";
import bundled from "../../../src/data/changelog.json";

// Protects What changed: the list the interface shows must be the list in
// CHANGELOG.md. If this fails, run `node build-scripts/sync-changelog.mjs`.

const markdown = readFileSync(
  path.resolve(__dirname, "../../../../CHANGELOG.md"),
  "utf8"
);

describe("parseChangelog", () => {
  it("reads days and joins the lines of an entry", () => {
    expect(
      parseChangelog(
        [
          "# Changelog",
          "",
          "Intro text.",
          "",
          "## 2026-11-10",
          "",
          "- First change, which runs",
          "  over two lines.",
          "- Second change.",
          "",
          "## 2026-11-09",
          "",
          "- Older change.",
          "",
          "## Notes",
          "",
          "- Not a change.",
        ].join("\n")
      )
    ).toEqual([
      {
        date: "2026-11-10",
        items: [
          { text: "First change, which runs over two lines." },
          { text: "Second change." },
        ],
      },
      { date: "2026-11-09", items: [{ text: "Older change." }] },
    ]);
  });
});

describe("the list shipped with the interface", () => {
  it("is the list in CHANGELOG.md", () => {
    const fromFile = parseChangelog(markdown);
    expect(
      bundled.days.map((day) => ({
        date: day.date,
        items: day.items.map((item) => ({ text: item.text })),
      }))
    ).toEqual(fromFile);
  });

  it("has days in order, newest first", () => {
    const dates = bundled.days.map((day) => day.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("filterDays", () => {
  const days = [
    { date: "2026-11-10", items: [{ text: "a" }] },
    { date: "2026-11-09", items: [{ text: "b" }] },
    { date: "2026-11-01", items: [{ text: "c" }] },
  ];

  it("includes both ends and allows an open end", () => {
    expect(filterDays(days, "2026-11-09", "2026-11-10")).toHaveLength(2);
    expect(filterDays(days, "2026-11-10")).toHaveLength(1);
    expect(filterDays(days, undefined, "2026-11-01")).toHaveLength(1);
    expect(filterDays(days)).toHaveLength(3);
  });
});

describe("splitCode", () => {
  it("separates inline code from text", () => {
    expect(splitCode("Use `host.sh` to run it.")).toEqual([
      { text: "Use ", code: false },
      { text: "host.sh", code: true },
      { text: " to run it.", code: false },
    ]);
  });
});
