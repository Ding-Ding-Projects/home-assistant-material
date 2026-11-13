import { describe, expect, it } from "vitest";
import type { HaFormSchema } from "../../../src/components/ha-form/types";
import {
  buildStepChips,
  countConditionallyHidden,
  isShortField,
  splitFormSegments,
} from "../../../src/dialogs/config-flow/step-flow-form-helpers";

const text = (name: string, config: Record<string, unknown> = {}) =>
  ({ name, selector: { text: config } }) as HaFormSchema;

const number = (name: string, config: Record<string, unknown> = {}) =>
  ({ name, selector: { number: config } }) as HaFormSchema;

describe("isShortField", () => {
  it("treats single line inputs and dropdowns as short", () => {
    expect(isShortField(text("host"))).toBe(true);
    expect(isShortField(number("port", { min: 1 }))).toBe(true);
    expect(isShortField({ name: "name", type: "string" } as HaFormSchema)).toBe(
      true
    );
    expect(
      isShortField({
        name: "unit",
        selector: { select: { options: ["a", "b"] } },
      } as HaFormSchema)
    ).toBe(true);
  });

  it("keeps wide controls on a row of their own", () => {
    expect(isShortField(text("notes", { multiline: true }))).toBe(false);
    expect(isShortField(number("level", { mode: "slider" }))).toBe(false);
    expect(
      isShortField({
        name: "tags",
        selector: { select: { options: ["a"], multiple: true } },
      } as HaFormSchema)
    ).toBe(false);
    expect(isShortField({ name: "on", type: "boolean" } as HaFormSchema)).toBe(
      false
    );
    expect(
      isShortField({
        name: "more",
        type: "expandable",
        schema: [],
      } as HaFormSchema)
    ).toBe(false);
    expect(
      isShortField({ name: "x", selector: { object: {} } } as HaFormSchema)
    ).toBe(false);
  });
});

describe("splitFormSegments", () => {
  it("puts neighbouring short fields in columns and keeps the order", () => {
    const schema = [
      text("host"),
      number("port"),
      text("units"),
      { name: "on", type: "boolean" } as HaFormSchema,
      text("alone"),
      text("notes", { multiline: true }),
    ];
    const segments = splitFormSegments(schema);
    expect(segments.map((s) => [s.kind, s.fields.map((f) => f.name)])).toEqual([
      ["columns", ["host", "port", "units"]],
      ["full", ["on", "alone", "notes"]],
    ]);
  });

  it("merges neighbouring wide and lone fields into one full part", () => {
    const schema = [
      text("a", { multiline: true }),
      text("b"),
      text("c", { multiline: true }),
    ];
    expect(splitFormSegments(schema)).toHaveLength(1);
  });

  it("leaves hidden fields out of rows", () => {
    const segments = splitFormSegments(
      [text("a"), text("b"), text("c")],
      new Set(["b"])
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].fields.map((f) => f.name)).toEqual(["a", "c"]);
  });

  it("returns nothing for no schema", () => {
    expect(splitFormSegments(undefined)).toEqual([]);
  });
});

describe("countConditionallyHidden", () => {
  it("counts only fields hidden by a condition", () => {
    const schema = [
      {
        ...text("local_host"),
        visible: { field: "mode", value: "local" },
      },
      { ...text("always"), visible: false },
      text("plain"),
    ] as HaFormSchema[];
    const hidden = new Set(["local_host", "always"]);
    expect(countConditionallyHidden(schema, hidden)).toBe(1);
    expect(countConditionallyHidden(schema, new Set())).toBe(0);
  });
});

describe("buildStepChips", () => {
  it("shows only steps that were really taken", () => {
    expect(buildStepChips(1, undefined)).toEqual([
      { kind: "current", number: 1 },
    ]);
    expect(buildStepChips(2, false)).toEqual([
      { kind: "done", number: 1 },
      { kind: "current", number: 2 },
      { kind: "more" },
    ]);
  });

  it("marks the final step and never invents a total", () => {
    const chips = buildStepChips(3, true);
    expect(chips[chips.length - 1]).toEqual({ kind: "final" });
    expect(chips.some((chip) => (chip.number ?? 0) > 3)).toBe(false);
  });

  it("folds long histories into an ellipsis", () => {
    const chips = buildStepChips(9, null);
    expect(chips[0]).toEqual({ kind: "earlier" });
    expect(chips).toHaveLength(5);
    expect(chips[chips.length - 1]).toEqual({ kind: "current", number: 9 });
  });

  it("is empty without a step number", () => {
    expect(buildStepChips(undefined, true)).toEqual([]);
    expect(buildStepChips(0, true)).toEqual([]);
  });
});
