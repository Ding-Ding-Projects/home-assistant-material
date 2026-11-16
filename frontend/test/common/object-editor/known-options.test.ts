import { describe, expect, it } from "vitest";
import {
  declaredOptions,
  mergeKnownOptions,
  nodeForOption,
  numberOutOfRange,
  unusedKnownOptions,
} from "../../../src/common/object-editor/known-options";
import type {
  KnownOption,
  ResolvedKnownOption,
} from "../../../src/common/object-editor/known-options";

describe("mergeKnownOptions", () => {
  it("lets the declared entry win and fills missing detail from the common one", () => {
    const common: KnownOption[] = [
      {
        key: "voice",
        description: "Common description",
        kind: { type: "text" },
        source: "common",
      },
      { key: "preferred_format", source: "common" },
    ];
    const declared = declaredOptions({
      keys: ["voice"],
      choices: { voice: [{ value: "garden" }] },
    });
    const merged = mergeKnownOptions(common, declared);
    expect(merged.map((option) => option.key)).toEqual([
      "voice",
      "preferred_format",
    ]);
    expect(merged[0].source).toBe("declared");
    expect(merged[0].kind.type).toBe("choice");
    expect(merged[0].description).toBe("Common description");
    expect(merged[1].kind).toEqual({ type: "text" });
  });
});

describe("unusedKnownOptions", () => {
  it("drops keys that are already present", () => {
    const options = mergeKnownOptions(
      declaredOptions({ keys: ["voice", "speed"] })
    );
    expect(
      unusedKnownOptions(options, ["voice"]).map((option) => option.key)
    ).toEqual(["speed"]);
  });
});

describe("declaredOptions", () => {
  it("infers the kind from the default value", () => {
    const [flag, count, text] = declaredOptions({
      keys: ["flag", "count", "text"],
      defaults: { flag: true, count: 3, text: "hello" },
    });
    expect(flag.kind).toEqual({ type: "boolean" });
    expect(count.kind).toEqual({ type: "number" });
    expect(text.kind).toEqual({ type: "text" });
  });
});

describe("nodeForOption", () => {
  const option = (partial: Partial<ResolvedKnownOption>) =>
    ({
      key: "key",
      source: "common",
      kind: { type: "text" },
      ...partial,
    }) as ResolvedKnownOption;

  it("uses an empty node of the right type without a default", () => {
    expect(nodeForOption(option({ kind: { type: "number" } })).type).toBe(
      "number"
    );
    expect(nodeForOption(option({ kind: { type: "boolean" } })).type).toBe(
      "boolean"
    );
    expect(nodeForOption(option({ kind: { type: "list" } })).type).toBe("list");
  });

  it("types choices as text and keeps a default that fits", () => {
    const node = nodeForOption(
      option({
        kind: { type: "choice", choices: [{ value: "mp3" }, { value: "wav" }] },
        default: "wav",
      })
    );
    expect(node.type).toBe("text");
    expect(node.text).toBe("wav");
  });

  it("ignores a default of the wrong type", () => {
    const node = nodeForOption(
      option({ kind: { type: "number" }, default: "loud" })
    );
    expect(node.type).toBe("number");
  });
});

describe("numberOutOfRange", () => {
  it("checks limits and ignores unparsable text", () => {
    const kind = { type: "number" as const, min: 1, max: 10 };
    expect(numberOutOfRange(kind, "0")).toBe(true);
    expect(numberOutOfRange(kind, "11")).toBe(true);
    expect(numberOutOfRange(kind, "5")).toBe(false);
    expect(numberOutOfRange(kind, "abc")).toBe(false);
  });
});
