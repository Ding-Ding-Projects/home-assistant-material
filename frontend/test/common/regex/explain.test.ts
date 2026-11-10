import { describe, expect, it } from "vitest";
import {
  mergeLiterals,
  tokenizeRegex,
} from "../../../src/common/regex/explain";
import { analyzeRisk } from "../../../src/common/regex/risk";

const kinds = (pattern: string, flags = "") =>
  tokenizeRegex(pattern, flags).tokens.map((token) => token.kind);

// The workbench explains a pattern from these tokens and screens it from the
// risk findings. A wrong token is a wrong explanation; a missed nested repeat
// is a filter that can freeze the page.
describe("regular expression tokens", () => {
  it("covers every character of the pattern exactly once", () => {
    const pattern =
      "^(?<year>\\d{4})-(?:0[1-9]|1[0-2])\\b.*?[^a-z\\]]+\\k<year>$";
    const { tokens } = tokenizeRegex(pattern);
    expect(tokens.map((token) => token.text).join("")).toBe(pattern);
    tokens.forEach((token, index) => {
      expect(token.start).toBe(index === 0 ? 0 : tokens[index - 1].end);
    });
  });

  it("names the basic pieces", () => {
    expect(kinds("^a.\\d\\W$")).toEqual([
      "start",
      "literal",
      "any",
      "digit",
      "not_word",
      "end",
    ]);
  });

  it("numbers capturing groups and records names", () => {
    const result = tokenizeRegex("(a)(?:b)(?<name>c)(?=d)(?<!e)");
    expect(result.groupCount).toBe(2);
    expect(result.groupNames).toEqual(["name"]);
    expect(
      result.tokens.filter((token) => token.group).map((t) => t.group)
    ).toEqual([1, 2]);
    expect(kinds("(?<=a)(?!b)")).toEqual([
      "lookbehind",
      "literal",
      "group_close",
      "negative_lookahead",
      "literal",
      "group_close",
    ]);
  });

  it("reads quantifier bounds and laziness", () => {
    const quantifiers = tokenizeRegex("a*b+?c?d{2}e{3,}f{4,5}?").tokens.filter(
      (token) => token.kind === "quantifier"
    );
    expect(
      quantifiers.map((token) => [token.min, token.max, token.lazy])
    ).toEqual([
      [0, undefined, false],
      [1, undefined, true],
      [0, 1, false],
      [2, 2, false],
      [3, undefined, false],
      [4, 5, true],
    ]);
  });

  it("treats a brace that is not a quantifier as text", () => {
    expect(kinds("a{b")).toEqual(["literal", "literal", "literal"]);
  });

  it("reads character classes as one piece", () => {
    const [token] = tokenizeRegex("[^a-z\\d\\]_]").tokens;
    expect(token.kind).toBe("class");
    expect(token.negated).toBe(true);
    expect(token.items?.map((item) => [item.type, item.text])).toEqual([
      ["range", "a-z"],
      ["escape", "\\d"],
      ["escape", "\\]"],
      ["char", "_"],
    ]);
  });

  it("resolves escapes to the character they stand for", () => {
    const tokens = tokenizeRegex("\\x41\\u00e9\\u{1F600}\\n\\.", "u").tokens;
    expect(tokens.map((token) => [token.kind, token.value])).toEqual([
      ["hex", "A"],
      ["unicode", "é"],
      ["unicode", "😀"],
      ["control", "line feed"],
      ["escaped_literal", "."],
    ]);
  });

  it("needs the u or v flag for Unicode properties", () => {
    expect(kinds("\\p{L}", "u")).toEqual(["property"]);
    const [token] = tokenizeRegex("\\p{L}").tokens;
    expect(token.kind).toBe("unsupported");
    expect(token.reason).toBe("property_needs_flag");
  });

  it("reports constructs from other flavours instead of hiding them", () => {
    const reasons = (pattern: string) =>
      tokenizeRegex(pattern)
        .tokens.filter((token) => token.kind === "unsupported")
        .map((token) => token.reason);
    expect(reasons("a++")).toEqual(["possessive"]);
    expect(reasons("(?>a)")).toEqual(["atomic"]);
    expect(reasons("(?(1)a|b)")).toEqual(["conditional"]);
    expect(reasons("(?#note)a")).toEqual(["comment"]);
    expect(reasons("(?P<n>a)")).toEqual(["python_named"]);
    expect(reasons("(?i)a")).toEqual(["inline_flags"]);
    expect(reasons("(?R)")).toEqual(["subroutine"]);
    expect(reasons("[[:alpha:]]")).toEqual(["posix_class"]);
    expect(reasons("\\Aa\\z")).toEqual(["anchor_a", "anchor_z"]);
  });

  it("flags unbalanced brackets", () => {
    expect(tokenizeRegex("(a").unbalanced).toBe(true);
    expect(tokenizeRegex("a)").unbalanced).toBe(true);
    expect(tokenizeRegex("[a").unbalanced).toBe(true);
    expect(tokenizeRegex("(a)[b]").unbalanced).toBe(false);
  });

  it("joins literal text but keeps a quantified character apart", () => {
    const merged = mergeLiterals(tokenizeRegex("cats+ and").tokens);
    expect(merged.map((token) => token.text)).toEqual([
      "cat",
      "s",
      "+",
      " and",
    ]);
  });
});

describe("risk screening", () => {
  const levels = (pattern: string) =>
    analyzeRisk(pattern).map((finding) => [finding.level, finding.code]);

  it("marks overlapping nested repeats as high", () => {
    expect(levels("(a+)+$")).toContainEqual(["high", "nested_quantifier"]);
    expect(levels("(a*)*")).toContainEqual(["high", "nested_quantifier"]);
    expect(levels("(?:a+b?)+")).toContainEqual(["high", "nested_quantifier"]);
    expect(levels("(.*a)+")).toContainEqual(["high", "nested_quantifier"]);
    expect(levels("((a+)b?)+")).toContainEqual(["high", "nested_quantifier"]);
  });

  it("marks separated nested repeats as medium, not high", () => {
    expect(levels("(\\w+\\s)*")).toEqual([["medium", "nested_quantifier"]]);
    expect(levels("(?:\\d+,)+\\d+")).toEqual([["medium", "nested_quantifier"]]);
  });

  it("does not flag ordinary patterns", () => {
    expect(levels("^light\\.[a-z_]+$")).toEqual([]);
    expect(levels("\\d{4}-\\d{2}-\\d{2}")).toEqual([]);
    expect(levels("(?:ab)+c")).toEqual([]);
  });

  it("notes other costly shapes", () => {
    expect(levels("(a|b)+")).toEqual([["medium", "quantified_alternation"]]);
    expect(levels("\\d+\\d+x")).toEqual([["medium", "adjacent_repeats"]]);
    expect(levels("a{5000}")).toEqual([["medium", "large_repeat"]]);
    expect(levels("(a)(?:\\1)+")).toContainEqual([
      "medium",
      "quantified_backreference",
    ]);
    expect(levels(".*foo")).toEqual([["low", "leading_wildcard"]]);
    expect(levels("^.*foo")).toEqual([]);
  });

  it("ignores repeats inside lookarounds when judging the outer repeat", () => {
    expect(levels("(?:(?=a+)b)+")).toEqual([]);
  });
});
