import { describe, expect, it } from "vitest";
import {
  excerpt,
  flattenStrings,
  highlightSegments,
  pageBlockPrefix,
  pageWords,
  plainMessage,
  searchPages,
} from "../../../src/panels/config/settings-page-search";

// Protects the search of the settings pages that list other pages: a search
// must only hide pages, count exactly the ones it hides, find words inside a
// page and say where, and mark the matching letters without shifting them.

interface Page {
  path: string;
  name: string;
  description?: string;
  translationKey?: string;
}

const PAGES: Page[] = [
  {
    path: "/config/backup",
    name: "Backups",
    description: "Last one today",
    translationKey: "backup",
  },
  {
    path: "/config/updates",
    name: "Updates",
    description: "Up to date",
    translationKey: "updates",
  },
  {
    path: "/config/storage",
    name: "Storage",
    description: "12% used",
    translationKey: "storage",
  },
  {
    path: "/config/network",
    name: "Network",
    description: "Reachable from outside",
    translationKey: "network",
  },
];

const STRINGS = flattenStrings(
  {
    updates: {
      caption: "Updates",
      rollback: "Go back to an older build",
      count: "{count, plural, one {# update} other {# updates}}",
    },
    storage: {
      caption: "Storage",
      used_by_backups: "Space used by backups",
    },
    network: { caption: "Network" },
  },
  "ui.panel.config"
);

const text = (page: Page) => ({
  name: page.name,
  description: page.description,
});
const words = (page: Page) => pageWords(STRINGS, page.translationKey);

describe("searchPages", () => {
  it("shows every page and hides none for an empty search", () => {
    const result = searchPages(PAGES, "  ", text, words);
    expect(result.shown.map((match) => match.page)).toEqual(PAGES);
    expect(result.hidden).toBe(0);
    expect(result.total).toBe(4);
  });

  it("matches names first, then words inside the page, and counts the rest as hidden", () => {
    const result = searchPages(PAGES, "back", text, words);
    expect(result.shown.map((match) => match.page.name)).toEqual([
      "Backups",
      "Updates",
      "Storage",
    ]);
    expect(result.shown[0].foundIn).toBeUndefined();
    expect(result.shown[1].foundIn).toBe("Go back to an older build");
    expect(result.shown[2].foundIn).toBe("Space used by backups");
    expect(result.hidden).toBe(1);
    expect(result.total).toBe(4);
  });

  it("never removes a page from the list it was given", () => {
    const pages = [...PAGES];
    searchPages(pages, "nothing matches this", text, words);
    expect(pages).toEqual(PAGES);
  });

  it("understands a pattern and shows nothing for an unusable one", () => {
    expect(
      searchPages(PAGES, "/^(Net|Stor)/", text, words).shown.map(
        (match) => match.page.name
      )
    ).toEqual(["Storage", "Network"]);
    const broken = searchPages(PAGES, "/(/", text, words);
    expect(broken.shown).toEqual([]);
    expect(broken.hidden).toBe(4);
  });
});

describe("pageWords", () => {
  it("leaves out the page's own name and placeholders", () => {
    expect(pageWords(STRINGS, "updates")).toEqual([
      "Go back to an older build",
    ]);
  });

  it("puts the Cantonese of a key first in Cantonese modes", () => {
    const cantonese = (key: string) =>
      key === "ui.panel.config.updates.rollback" ? "返去舊版本" : undefined;
    expect(pageWords(STRINGS, "updates", true, cantonese)).toEqual([
      "返去舊版本",
      "Go back to an older build",
    ]);
  });

  it("finds the block of a full translation key and of none", () => {
    expect(pageBlockPrefix("ui.panel.config.info.caption")).toBe(
      "ui.panel.config.info."
    );
    expect(pageBlockPrefix("backup")).toBe("ui.panel.config.backup.");
    expect(pageBlockPrefix(undefined)).toBeUndefined();
  });
});

describe("plainMessage", () => {
  it("drops placeholders, plural rules and markup", () => {
    expect(
      plainMessage("Use {name} <b>now</b> {n, plural, one {#} other {#}}")
    ).toBe("Use now");
  });
});

describe("highlightSegments", () => {
  it("marks every plain match regardless of case", () => {
    expect(highlightSegments("back", "Backups and back")).toEqual([
      { text: "Back", hit: true },
      { text: "ups and ", hit: false },
      { text: "back", hit: true },
    ]);
  });

  it("marks pattern matches", () => {
    expect(highlightSegments("/p.a/", "Updates")).toEqual([
      { text: "U", hit: false },
      { text: "pda", hit: true },
      { text: "tes", hit: false },
    ]);
  });

  it("returns the whole text unmarked for an empty search", () => {
    expect(highlightSegments("", "Storage")).toEqual([
      { text: "Storage", hit: false },
    ]);
  });
});

describe("excerpt", () => {
  it("keeps a short text whole and shortens a long one around its match", () => {
    expect(excerpt("back", "Go back")).toBe("Go back");
    const long = `${"a".repeat(100)} back ${"b".repeat(100)}`;
    const short = excerpt("back", long, 40);
    expect(short.startsWith("…")).toBe(true);
    expect(short.endsWith("…")).toBe(true);
    expect(short).toContain("back");
  });
});
