import { describe, expect, it } from "vitest";
import {
  filterByRegexQuery,
  normalizeSearchText,
  regexQuery,
  regexRanges,
  searchMatcher,
} from "../../../src/common/regex/filter";
import {
  fuseSearch,
  multiTermSearch,
} from "../../../src/resources/fuseMultiTerm";

// These protect the contract every list relies on: plain text stays the
// default, /pattern/flags switches to a regular expression, and a pattern
// that cannot be used shows nothing instead of quietly matching as text.

const lights = [
  { id: "light.kitchen", name: "Kitchen", tags: ["Ceiling", "LED"] },
  { id: "light.bedroom_2", name: "Bedroom 2", tags: ["Lamp"] },
  { id: "switch.pump", name: "Garden pump", tags: [] },
];

describe("regexQuery", () => {
  it("treats ordinary text as plain", () => {
    expect(regexQuery("kitchen")).toBeUndefined();
    expect(regexQuery("")).toBeUndefined();
    expect(regexQuery("a/b")).toBeUndefined();
  });

  it("compiles /pattern/flags", () => {
    const query = regexQuery("/^light\\./");
    expect(query?.error).toBeUndefined();
    expect(query?.test("light.kitchen")).toBe(true);
    expect(query?.test("switch.pump")).toBe(false);
  });

  it("reports an invalid pattern and matches nothing", () => {
    const query = regexQuery("/(/");
    expect(query?.error).toBe("invalid");
    expect(query?.test("(")).toBe(false);
  });

  it("refuses a pattern that screening marks as runaway", () => {
    const query = regexQuery("/(a+)+$/");
    expect(query?.error).toBe("risky");
    expect(query?.test("aaaa")).toBe(false);
  });
});

describe("searchMatcher", () => {
  it("matches everything when the text is empty", () => {
    expect(searchMatcher("")("anything")).toBe(true);
    expect(searchMatcher(undefined)(undefined)).toBe(true);
  });

  it("matches plain text without regard to case", () => {
    const matches = searchMatcher("KITCH");
    expect(matches("Kitchen")).toBe(true);
    expect(matches("Bedroom", null, "kitchen light")).toBe(true);
    expect(matches("Bedroom")).toBe(false);
  });

  it("keeps case for a regular expression unless i is set", () => {
    expect(searchMatcher("/kitchen/")("Kitchen")).toBe(false);
    expect(searchMatcher("/kitchen/i")("Kitchen")).toBe(true);
  });

  it("matches nothing for an unusable pattern", () => {
    expect(searchMatcher("/[/")("[")).toBe(false);
  });

  it("handles Unicode and zero-width patterns", () => {
    expect(searchMatcher("/^\\p{Lu}/u")("Ünder")).toBe(true);
    expect(searchMatcher("/^$/")("")).toBe(true);
    expect(searchMatcher("/\\b/")("word")).toBe(true);
  });
});

describe("filterByRegexQuery", () => {
  it("returns undefined for plain text so the caller keeps its own matching", () => {
    expect(
      filterByRegexQuery(lights, "kitchen", (item) => [item.name])
    ).toBeUndefined();
  });

  it("filters by pattern and keeps the order", () => {
    expect(
      filterByRegexQuery(lights, "/^light\\./", (item) => [item.id])?.map(
        (item) => item.id
      )
    ).toEqual(["light.kitchen", "light.bedroom_2"]);
  });

  it("returns nothing for an unusable pattern", () => {
    expect(filterByRegexQuery(lights, "/(/", (item) => [item.id])).toEqual([]);
  });
});

describe("normalizeSearchText", () => {
  it("lower-cases plain text and leaves a pattern as written", () => {
    expect(normalizeSearchText("KitChen")).toBe("kitchen");
    expect(normalizeSearchText("/\\D+/")).toBe("/\\D+/");
    expect(normalizeSearchText(undefined)).toBe("");
  });
});

describe("regexRanges", () => {
  it("returns undefined for plain text", () => {
    expect(regexRanges("error", "an error")).toBeUndefined();
  });

  it("finds every match and leaves empty matches out", () => {
    expect(regexRanges("/\\d+/", "a1 b22 c")).toEqual([
      [1, 2],
      [4, 6],
    ]);
    expect(regexRanges("/x*/", "abc")).toEqual([]);
  });

  it("returns no ranges for an unusable pattern", () => {
    expect(regexRanges("/(/", "(")).toEqual([]);
  });
});

describe("fuzzy search helpers", () => {
  it("fuseSearch uses the pattern on every key, including lists", () => {
    const options = { keys: ["name", "tags"] };
    expect(
      fuseSearch(lights, "/^LED$/", options).map((item) => item.id)
    ).toEqual(["light.kitchen"]);
    expect(
      fuseSearch(lights, "/\\d$/", options).map((item) => item.id)
    ).toEqual(["light.bedroom_2"]);
  });

  it("fuseSearch still searches plain text fuzzily", () => {
    expect(
      fuseSearch(lights, "kitchn", { keys: ["name"], threshold: 0.4 }).map(
        (item) => item.id
      )
    ).toEqual(["light.kitchen"]);
  });

  it("multiTermSearch uses the pattern on its keys", () => {
    expect(
      multiTermSearch(lights, "/pump|Lamp/", ["name", "tags"]).map(
        (item) => item.id
      )
    ).toEqual(["light.bedroom_2", "switch.pump"]);
  });
});
