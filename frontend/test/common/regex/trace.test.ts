import { describe, expect, it } from "vitest";
import {
  TRACE_MAX_STEPS,
  traceMatch,
  traceUnits,
} from "../../../src/common/regex/trace";

// The step trace shows how the first match is built, piece by piece, from the
// engine itself. These protect the cutting of a pattern into pieces (a group
// and a quantifier are one piece, plain characters join), the positions each
// piece leaves the match at, and the honest answers when there is no trace.

const pieces = (pattern: string) => {
  const cut = traceUnits(pattern);
  if ("reason" in cut) {
    return cut.reason;
  }
  return cut.units.map((unit) => pattern.slice(unit.start, unit.end));
};

describe("traceUnits", () => {
  it("joins plain characters and keeps a quantifier with its piece", () => {
    expect(pieces("\\bkitchen(_\\w+)?\\b")).toEqual([
      "\\b",
      "kitchen",
      "(_\\w+)?",
      "\\b",
    ]);
  });

  it("splits the character a quantifier applies to off its neighbours", () => {
    expect(pieces("ab+c")).toEqual(["a", "b+", "c"]);
  });

  it("takes a whole group, nested ones included, as one piece", () => {
    expect(pieces("x((a)(?:b|c))y")).toEqual(["x", "((a)(?:b|c))", "y"]);
  });

  it("reports a top-level choice and a construct the engine does not run", () => {
    expect(pieces("a|b")).toBe("alternation");
    expect(pieces("a(?>b)")).toBe("construct");
    expect(pieces("(a")).toBe("construct");
  });
});

describe("traceMatch", () => {
  it("shows where each piece leaves the match", () => {
    const result = traceMatch(
      "\\bkitchen(_\\w+)?\\b",
      "",
      "the kitchen_counter lamp"
    );
    expect(result.status).toBe("ok");
    expect(result.start).toBe(4);
    expect(result.end).toBe(19);
    expect(
      result.steps.map((step) => [step.source, step.kind, step.from, step.to])
    ).toEqual([
      ["\\b", "position", 4, 4],
      ["kitchen", "text", 4, 11],
      ["(_\\w+)?", "text", 11, 19],
      ["\\b", "position", 19, 19],
    ]);
    expect(result.steps[2].text).toBe("_counter");
  });

  it("says when text went back to a later piece", () => {
    const result = traceMatch("a.*b", "", "axxbxx");
    const gave = result.steps.find((step) => step.kind === "gave_back");
    expect(result.status).toBe("ok");
    expect(gave?.source).toBe("b");
    expect(result.end).toBe(4);
  });

  it("traces from a later position", () => {
    const result = traceMatch("a", "", "aXa", 1);
    expect(result.start).toBe(2);
  });

  it("answers plainly when there is nothing to trace", () => {
    expect(traceMatch("z", "", "abc").status).toBe("no_match");
    expect(traceMatch("a|b", "", "abc")).toMatchObject({
      status: "unsupported",
      reason: "alternation",
    });
    expect(
      traceMatch("a".repeat(1) + "b+".repeat(TRACE_MAX_STEPS), "", "ab").status
    ).toBe("too_long");
  });

  it("keeps the flags the person chose", () => {
    const result = traceMatch("kit", "i", "KIT");
    expect(result.status).toBe("ok");
    expect(result.steps[0].text).toBe("KIT");
  });
});
