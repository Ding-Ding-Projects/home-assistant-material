import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTimePatternFormData,
  parseTimePatternValue,
  serializeTimePatternField,
  toTimePatternFormData,
} from "../../../../../src/panels/config/automation/trigger/types/time-pattern-model";

const ROOT = resolve(__dirname, "../../../../../src/panels/config/automation");

// Written by hand on purpose: a new kind must be added here with its editor.
const TRIGGERS = [
  "calendar",
  "conversation",
  "device",
  "event",
  "geo_location",
  "homeassistant",
  "list",
  "numeric_state",
  "persistent_notification",
  "platform",
  "state",
  "sun",
  "tag",
  "template",
  "time",
  "time_pattern",
  "webhook",
  "zone",
];
const CONDITIONS = [
  "and",
  "device",
  "logical",
  "not",
  "numeric_state",
  "or",
  "platform",
  "state",
  "sun",
  "template",
  "time",
  "trigger",
  "zone",
];
const ACTIONS = [
  "choose",
  "condition",
  "delay",
  "device_id",
  "event",
  "if",
  "parallel",
  "repeat",
  "sequence",
  "service",
  "set_conversation_response",
  "stop",
  "variables",
  "wait_for_trigger",
  "wait_template",
];

const check = (folder: string, prefix: string, kinds: string[]) => {
  kinds.forEach((kind) => {
    const file = resolve(
      ROOT,
      folder,
      "types",
      `ha-automation-${prefix}-${kind}.ts`
    );
    expect(existsSync(file), file).toBe(true);
    expect(readFileSync(file, "utf8")).toContain(
      `@customElement("ha-automation-${prefix}-${kind}")`
    );
  });
};

describe("automation entry kinds", () => {
  it("has an editor for every trigger kind", () =>
    check("trigger", "trigger", TRIGGERS));
  it("has an editor for every condition kind", () =>
    check("condition", "condition", CONDITIONS));
  it("has an editor for every action kind", () =>
    check("action", "action", ACTIONS));

  it("lists every editor file on disk", () => {
    const count = (folder: string) =>
      readdirSync(resolve(ROOT, folder, "types")).filter((f: string) =>
        f.startsWith("ha-automation-")
      ).length;
    expect(count("trigger")).toBe(TRIGGERS.length);
    expect(count("condition")).toBe(CONDITIONS.length);
    expect(count("action")).toBe(ACTIONS.length);
  });
});

describe("time pattern value handling", () => {
  const samples = [
    {},
    { minutes: "/5" },
    { hours: "*", minutes: "30" },
    { hours: 7, minutes: 0, seconds: "/10" },
    { minutes: "0-5" },
  ];

  it("leaves a stored trigger unchanged when the form reports no change", () => {
    samples.forEach((sample) => {
      const data = toTimePatternFormData(sample);
      const trigger = { trigger: "time_pattern", ...sample };
      expect(applyTimePatternFormData(trigger, data, { ...data })).toEqual(
        trigger
      );
    });
  });

  it("reads each stored shape into the matching mode", () => {
    expect(parseTimePatternValue(undefined).mode).toBe("any");
    expect(parseTimePatternValue("*").mode).toBe("any");
    expect(parseTimePatternValue("/15")).toEqual({ mode: "every", value: 15 });
    expect(parseTimePatternValue("7")).toEqual({ mode: "at", value: 7 });
    expect(parseTimePatternValue(7)).toEqual({ mode: "at", value: 7 });
    expect(parseTimePatternValue("0-5")).toEqual({
      mode: "custom",
      value: "0-5",
    });
  });

  it("writes the choice back in Home Assistant's own notation", () => {
    expect(serializeTimePatternField({ mode: "every", value: 5 })).toBe("/5");
    expect(serializeTimePatternField({ mode: "at", value: 30 })).toBe("30");
    expect(serializeTimePatternField({ mode: "any" })).toBeUndefined();
  });

  it("drops the key when a unit is switched to every one", () => {
    const previous = toTimePatternFormData({ minutes: "/5" });
    const next = { ...previous, minutes_mode: "any" };
    expect(
      applyTimePatternFormData(
        { trigger: "time_pattern", minutes: "/5" },
        previous,
        next
      )
    ).toEqual({ trigger: "time_pattern" });
  });
});
