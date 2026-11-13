import { describe, expect, it } from "vitest";
import type {
  SelectRule,
  TextRule,
} from "../../../src/common/select-by-rule/select-by-rule";
import {
  ANY_FIELD,
  applySelection,
  detectRuleFields,
  matchRows,
  patternError,
  pruneRules,
  sanitizeStoredRuleSet,
} from "../../../src/common/select-by-rule/select-by-rule";

const rows = [
  {
    id: "a",
    name: "Kitchen light",
    area: "Kitchen",
    unavailable: false,
    disabled_by: null,
    hidden_by: null,
    label_entries: [{ label_id: "l1", name: "Lights" }],
  },
  {
    id: "b",
    name: "Garden pump",
    area: "Garden",
    unavailable: true,
    disabled_by: "user",
    hidden_by: null,
    label_entries: [],
  },
  {
    id: "c",
    name: "Kitchen Fan",
    area: "Kitchen",
    unavailable: false,
    disabled_by: null,
    hidden_by: "user",
    label_entries: [
      { label_id: "l1", name: "Lights" },
      { label_id: "l2", name: "Fans" },
    ],
  },
];

const ctx = { anyFields: ["name", "area"] };

const text = (overrides: Partial<TextRule>): TextRule => ({
  id: "t",
  kind: "text",
  operator: "contains",
  field: ANY_FIELD,
  value: "kitchen",
  caseSensitive: false,
  negate: false,
  ...overrides,
});

const run = (rules: SelectRule[], combine: "all" | "any" = "all") =>
  matchRows(rows, rules, combine, ctx, "id");

describe("matchRows text rules", () => {
  it("contains ignores case by default", () => {
    expect(run([text({})]).ids).toEqual(["a", "c"]);
  });

  it("can match case", () => {
    expect(run([text({ caseSensitive: true })]).ids).toEqual([]);
    expect(
      run([text({ caseSensitive: true, value: "Fan", field: "name" })]).ids
    ).toEqual(["c"]);
  });

  it("does not contain", () => {
    expect(run([text({ operator: "not_contains" })]).ids).toEqual(["b"]);
  });

  it("starts with and ends with a chosen column", () => {
    expect(
      run([text({ operator: "starts_with", field: "name", value: "garden" })])
        .ids
    ).toEqual(["b"]);
    expect(
      run([text({ operator: "ends_with", field: "name", value: "fan" })]).ids
    ).toEqual(["c"]);
  });

  it("matches a pattern, written plain or as /pattern/flags", () => {
    expect(
      run([text({ operator: "matches", field: "name", value: "^kitchen" })]).ids
    ).toEqual(["a", "c"]);
    expect(
      run([
        text({
          operator: "matches",
          field: "name",
          value: "/Fan$/",
          caseSensitive: true,
        }),
      ]).ids
    ).toEqual(["c"]);
  });

  it("blocks on an unusable pattern instead of selecting everything", () => {
    const rule = text({ operator: "matches", value: "(" });
    expect(patternError(rule)).toBe("invalid");
    const result = run([rule]);
    expect(result.blocked).toBe("invalid");
    expect(result.ids).toEqual([]);
  });

  it("does not select anything for an unfinished rule", () => {
    const result = run([text({ value: "  " })]);
    expect(result.blocked).toBe("empty");
    expect(result.ids).toEqual([]);
  });
});

describe("matchRows other rules", () => {
  it("has and does not have a label", () => {
    const base = {
      id: "l",
      kind: "label",
      value: "l2",
      negate: false,
    } as const;
    expect(run([{ ...base, operator: "has" }]).ids).toEqual(["c"]);
    expect(run([{ ...base, operator: "not_has" }]).ids).toEqual(["a", "b"]);
    expect(run([{ ...base, operator: "has", value: "lights" }]).ids).toEqual([
      "a",
      "c",
    ]);
  });

  it("is and is not a value", () => {
    const base = {
      id: "v",
      kind: "value",
      field: "area",
      value: "kitchen",
      negate: false,
    } as const;
    expect(run([{ ...base, operator: "is" }]).ids).toEqual(["a", "c"]);
    expect(run([{ ...base, operator: "is_not" }]).ids).toEqual(["b"]);
  });

  it("tests state", () => {
    const rule = (value: "disabled" | "hidden" | "unavailable" | "enabled") =>
      ({
        id: "s",
        kind: "state",
        operator: "is",
        value,
        negate: false,
      }) as const;
    expect(run([rule("disabled")]).ids).toEqual(["b"]);
    expect(run([rule("hidden")]).ids).toEqual(["c"]);
    expect(run([rule("unavailable")]).ids).toEqual(["b"]);
    expect(run([rule("enabled")]).ids).toEqual(["a", "c"]);
  });

  it("combines with all or any, and negates a rule", () => {
    const kitchen = text({});
    const hidden = {
      id: "s",
      kind: "state",
      operator: "is",
      value: "hidden",
      negate: false,
    } as const;
    expect(run([kitchen, hidden], "all").ids).toEqual(["c"]);
    expect(run([kitchen, hidden], "any").ids).toEqual(["a", "c"]);
    expect(run([kitchen, { ...hidden, negate: true }], "all").ids).toEqual([
      "a",
    ]);
  });

  it("skips rows that cannot be selected", () => {
    const result = matchRows(
      [{ id: "x", name: "Kitchen", selectable: false }, ...rows],
      [text({})],
      "all",
      ctx,
      "id"
    );
    expect(result.ids).toEqual(["a", "c"]);
  });
});

describe("applySelection", () => {
  const current = ["a", "z"];
  const matched = ["a", "b"];
  it("replaces, adds, removes and keeps", () => {
    expect(applySelection(current, matched, "replace")).toEqual(["a", "b"]);
    expect(applySelection(current, matched, "add")).toEqual(["a", "z", "b"]);
    expect(applySelection(current, matched, "remove")).toEqual(["z"]);
    expect(applySelection(current, matched, "keep")).toEqual(["a"]);
  });
});

describe("detectRuleFields", () => {
  const fields = detectRuleFields(
    {
      name: { title: "Name" },
      area: { title: "Area" },
      secret: { title: "Hidden", hidden: true },
      icon: { title: "Icon", type: "icon" },
      templated: { title: "No data" },
    },
    rows
  );

  it("offers only what the rows really hold", () => {
    expect(fields.textFields.map((f) => f.key)).toEqual(["name", "area"]);
    expect(fields.valueFields.map((f) => f.key)).toEqual(["area"]);
    expect(fields.valueFields[0].values).toEqual(["Garden", "Kitchen"]);
    expect(fields.labels.map((l) => l.value)).toEqual(["l2", "l1"]);
    expect(fields.states).toEqual([
      "enabled",
      "disabled",
      "hidden",
      "unavailable",
    ]);
  });

  it("offers nothing the rows lack", () => {
    const plain = detectRuleFields({ name: { title: "Name" } }, [
      { id: "1", name: "x" },
    ]);
    expect(plain.labels).toEqual([]);
    expect(plain.states).toEqual([]);
    expect(plain.valueFields).toEqual([]);
  });

  it("prunes remembered rules that point at a missing field", () => {
    const kept = pruneRules(
      [
        text({ field: "name" }),
        text({ field: "gone" }),
        {
          id: "v",
          kind: "value",
          operator: "is",
          field: "domain",
          value: "x",
          negate: false,
        },
      ],
      fields
    );
    expect(kept.map((rule) => rule.id)).toEqual(["t"]);
  });
});

describe("sanitizeStoredRuleSet", () => {
  it("gives an empty set for damaged input", () => {
    expect(sanitizeStoredRuleSet("nope").rules).toEqual([]);
    expect(
      sanitizeStoredRuleSet({ rules: [1, null, { kind: "x" }] }).rules
    ).toEqual([]);
  });

  it("keeps well shaped rules and falls back on bad choices", () => {
    const result = sanitizeStoredRuleSet({
      combine: "any",
      apply: "bogus",
      rules: [
        {
          kind: "text",
          operator: "contains",
          field: "*",
          value: "x",
          negate: true,
        },
        { kind: "text", operator: "bogus", field: "*", value: "x" },
        { kind: "state", operator: "is", value: "nothing" },
      ],
    });
    expect(result.combine).toBe("any");
    expect(result.apply).toBe("replace");
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].negate).toBe(true);
  });
});
