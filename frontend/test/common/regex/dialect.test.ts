import { describe, expect, it } from "vitest";
import { importPattern } from "../../../src/common/regex/dialect";

// Bringing a Python or PCRE pattern into JavaScript rewrites syntax only. These
// protect the rewrites, that the result runs the way the source dialect reads
// it on the cases that differ, and that a construct JavaScript cannot express
// is reported and kept, never silently dropped.

const test = (result: ReturnType<typeof importPattern>, text: string) =>
  new RegExp(result.pattern, result.flags).test(text);

describe("importPattern", () => {
  it("leaves a JavaScript pattern alone", () => {
    expect(importPattern("(?<a>x)\\k<a>", "javascript")).toEqual({
      pattern: "(?<a>x)\\k<a>",
      flags: "",
      notes: [],
      unsupported: [],
    });
  });

  it("rewrites Python named groups and references", () => {
    const result = importPattern("(?P<word>\\w+) (?P=word)", "python");
    expect(result.pattern).toBe("(?<word>\\w+) \\k<word>");
    expect(test(result, "hey hey")).toBe(true);
    expect(test(result, "one two")).toBe(false);
  });

  it("does not rewrite an escaped backslash before a reference", () => {
    expect(importPattern("\\\\(?P=n)", "python").pattern).toBe("\\\\\\k<n>");
  });

  it("turns leading inline flags into flags", () => {
    const result = importPattern("(?i)(?s)abc", "python");
    expect(result.pattern).toBe("abc");
    expect(result.flags).toBe("is");
    expect(result.notes).toEqual([]);
  });

  it("notes a flag that JavaScript has no letter for", () => {
    const result = importPattern("(?x)abc", "python");
    expect(result.flags).toBe("");
    expect(result.notes).toEqual(["flag_ignored"]);
  });

  it("notes flags in the middle of a pattern and keeps them", () => {
    const result = importPattern("a(?i)b", "pcre");
    expect(result.pattern).toBe("a(?i)b");
    expect(result.notes).toEqual(["inline_flags_middle"]);
  });

  it("makes the absolute text start and end hold with multiline on", () => {
    const start = importPattern("(?m)\\Aa", "python");
    expect(start.flags).toBe("m");
    expect(test(start, "a")).toBe(true);
    expect(test(start, "b\na")).toBe(false);
    const end = importPattern("(?m)a\\Z", "python");
    expect(test(end, "a")).toBe(true);
    expect(test(end, "a\nb")).toBe(false);
  });

  it("lets PCRE's end match before a final newline", () => {
    const result = importPattern("a\\Z", "pcre");
    expect(result.notes).toEqual(["end_with_newline"]);
    expect(test(result, "a\n")).toBe(true);
    expect(test(result, "a\n\n")).toBe(false);
  });

  it("rewrites horizontal space and any newline", () => {
    expect(test(importPattern("a\\hb", "pcre"), "a\tb")).toBe(true);
    expect(test(importPattern("a\\Rb", "pcre"), "a\r\nb")).toBe(true);
  });

  it("drops a comment group", () => {
    expect(importPattern("a(?#note)b", "pcre").pattern).toBe("ab");
  });

  it("keeps what JavaScript cannot express and says so", () => {
    const result = importPattern("a++(?>b)", "pcre");
    expect(result.pattern).toContain("(?>");
    expect(result.unsupported).toEqual(
      expect.arrayContaining(["possessive", "atomic"])
    );
  });
});
