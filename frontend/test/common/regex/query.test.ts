import { describe, expect, it } from "vitest";
import {
  compileSearchQuery,
  escapeLiteral,
  formatRegexQuery,
  isRegexQuery,
  parseSearchQuery,
} from "../../../src/common/regex/query";

// A search field accepts plain text or /pattern/flags. These tests protect
// the rule that plain text stays the default and that a broken or risky
// pattern matches nothing instead of throwing or hanging.
describe("search queries", () => {
  it("treats ordinary text as plain text", () => {
    expect(parseSearchQuery("living room").mode).toBe("text");
    expect(parseSearchQuery("a/b").mode).toBe("text");
    expect(parseSearchQuery("//").mode).toBe("text");
    expect(isRegexQuery("kitchen")).toBe(false);
  });

  it("reads /pattern/flags as a regular expression", () => {
    expect(parseSearchQuery("/^light\\./i")).toMatchObject({
      mode: "regex",
      pattern: "^light\\.",
      flags: "i",
    });
    expect(parseSearchQuery("/a\\/b/")).toMatchObject({
      mode: "regex",
      pattern: "a\\/b",
      flags: "",
    });
  });

  it("round-trips a pattern through the query form", () => {
    const query = formatRegexQuery("\\d+", "gi");
    expect(parseSearchQuery(query)).toMatchObject({
      pattern: "\\d+",
      flags: "gi",
    });
  });

  it("matches plain text without regard to case, accents or word order", () => {
    const query = compileSearchQuery("ROOM living");
    expect(query.test("Living Room lamp")).toBe(true);
    expect(query.test("Kitchen")).toBe(false);
    expect(compileSearchQuery("cafe").test("Café")).toBe(true);
    expect(compileSearchQuery("").test("anything")).toBe(true);
  });

  it("does not treat regex characters in plain text as a pattern", () => {
    const query = compileSearchQuery("a.c");
    expect(query.test("abc")).toBe(false);
    expect(query.test("a.c")).toBe(true);
  });

  it("matches a regular expression as written", () => {
    expect(compileSearchQuery("/^light\\./").test("light.kitchen")).toBe(true);
    expect(compileSearchQuery("/^light\\./").test("Light.kitchen")).toBe(false);
    expect(compileSearchQuery("/^light\\./i").test("Light.kitchen")).toBe(true);
  });

  it("gives the same answer on repeated tests with the global flag", () => {
    const query = compileSearchQuery("/a/g");
    expect(query.test("a")).toBe(true);
    expect(query.test("a")).toBe(true);
  });

  it("handles Unicode, multiline text and zero-width patterns", () => {
    expect(compileSearchQuery("/^\\p{Lu}/u").test("Élan")).toBe(true);
    expect(compileSearchQuery("/^b$/m").test("a\nb\nc")).toBe(true);
    expect(compileSearchQuery("/^/").test("")).toBe(true);
    expect(compileSearchQuery("/\\b/").test("word")).toBe(true);
  });

  it("matches nothing and reports an invalid pattern", () => {
    const query = compileSearchQuery("/(/");
    expect(query.error).toBe("invalid");
    expect(query.message).toBeTruthy();
    expect(query.test("(")).toBe(false);
  });

  it("rejects an unknown flag and an over-long pattern", () => {
    expect(compileSearchQuery("/a/q").error).toBe("unsupported_flag");
    expect(compileSearchQuery(`/${"a".repeat(2001)}/`).error).toBe("too_long");
  });

  it("refuses a pattern screened as high risk only when asked to screen", () => {
    expect(compileSearchQuery("/(a+)+$/").error).toBeUndefined();
    const screened = compileSearchQuery("/(a+)+$/", { screen: true });
    expect(screened.error).toBe("risky");
    expect(screened.test("aaaa")).toBe(false);
  });

  it("cuts a very long value instead of testing all of it", () => {
    const query = compileSearchQuery("/end$/");
    expect(query.test(`${"x".repeat(5000)}end`)).toBe(false);
  });

  it("escapes text for literal matching", () => {
    const escaped = escapeLiteral("a.b*c/d");
    expect(new RegExp(`^${escaped}$`).test("a.b*c/d")).toBe(true);
    expect(new RegExp(`^${escaped}$`).test("aXb")).toBe(false);
  });
});
