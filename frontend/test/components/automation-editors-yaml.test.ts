import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  CONDITION_EDITORS,
  TRIGGER_EDITORS,
} from "../../src/components/automation-editors";
import type {
  AutomationEditorContext,
  AutomationEditorEntry,
  QuickControl,
} from "../../src/components/automation-editors";

/**
 * Reads the trigger and condition descriptions of the bundled Core and checks
 * what the editors offer against them. A control that writes a value the
 * backend refuses makes the automation fail to save with no hint why.
 */

const components = resolve(__dirname, "../../../core/homeassistant/components");

interface YamlField {
  required?: boolean;
  selector?: Record<string, any> | null;
}

const readDescriptions = (
  domain: string,
  file: string
): Record<string, { fields?: Record<string, YamlField> }> => {
  const path = resolve(components, domain, file);
  if (!existsSync(path)) return {};
  const doc = load(readFileSync(path, "utf8"));
  return doc && typeof doc === "object" ? (doc as any) : {};
};

const cases: {
  id: string;
  kind: "trigger" | "condition";
  entry: AutomationEditorEntry;
  fields: Record<string, YamlField>;
}[] = [];

for (const [kind, map, file] of [
  ["trigger", TRIGGER_EDITORS, "triggers.yaml"],
  ["condition", CONDITION_EDITORS, "conditions.yaml"],
] as const) {
  for (const [id, entry] of Object.entries(map)) {
    const [domain, ...rest] = id.split(".");
    const description = readDescriptions(domain, file)[rest.join(".")];
    if (description?.fields) {
      cases.push({ id, kind, entry, fields: description.fields });
    }
  }
}

const controlsOf = (item: (typeof cases)[number]): QuickControl[] => {
  const ctx: AutomationEditorContext = {
    kind: item.kind,
    id: item.id,
    data: {},
    fields: Object.fromEntries(
      Object.entries(item.fields).map(([key, field]) => [
        key,
        { selector: field?.selector ?? null, required: field?.required },
      ])
    ),
    entities: [],
  };
  return item.entry.controls(ctx);
};

describe("trigger and condition editors against the Core descriptions", () => {
  it("reads the descriptions", () => {
    if (!existsSync(components)) return;
    expect(cases.length).toBeGreaterThan(100);
  });

  it("offers every required option", () => {
    const missing: string[] = [];
    for (const item of cases) {
      const keys = new Set(controlsOf(item).map((control) => control.key));
      for (const [key, field] of Object.entries(item.fields)) {
        if (field?.required && !["behavior", "for"].includes(key)) {
          if (!keys.has(key)) missing.push(`${item.kind} ${item.id}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives a numeric threshold the same units as the description", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const item of cases) {
      const described = item.fields.threshold?.selector?.numeric_threshold;
      const control = controlsOf(item).find((c) => c.key === "threshold");
      if (!described || control?.kind !== "selector") continue;
      checked += 1;
      const offered = control.selector.numeric_threshold;
      if (offered.mode !== described.mode) {
        wrong.push(`${item.id}: mode ${offered.mode} != ${described.mode}`);
      }
      const units = described.unit_of_measurement;
      if (units !== undefined) {
        if (
          !Array.isArray(offered.unit_of_measurement) ||
          JSON.stringify([...offered.unit_of_measurement].sort()) !==
            JSON.stringify([...units].sort())
        ) {
          wrong.push(
            `${item.id}: units ${JSON.stringify(offered.unit_of_measurement)} != ${JSON.stringify(units)}`
          );
        }
      } else if (offered.unit_of_measurement !== undefined) {
        // The backend then accepts no unit, so one must not be required.
        wrong.push(`${item.id}: lists units the description does not`);
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(wrong).toEqual([]);
  });

  it("edits a duration the backend only takes as a mapping as a mapping", () => {
    const item = cases.find(
      (entry) => entry.id === "timer.remaining_time_reached"
    )!;
    const control = controlsOf(item).find((c) => c.key === "remaining")!;
    expect(control.kind).toBe("selector");
    expect((control as any).selector).toEqual({ duration: {} });
  });
});
