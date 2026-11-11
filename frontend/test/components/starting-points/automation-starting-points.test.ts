import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STARTING_POINTS,
  SCRIPT_STARTING_POINTS,
  automationConfigForStartingPoint,
  scriptConfigForStartingPoint,
  validateStartingPointConfig,
} from "../../../src/components/starting-points/automation-starting-points";

// Protects the starting points for an empty automation and an empty script:
// each must be a valid configuration the editor accepts, none may name an
// entity that might be missing, and every text it shows must exist in both
// language files.

// A localize that returns the key, so the keys it asks for can be checked.
const localize = ((key: string) => key) as any;

const readJson = (file: string) =>
  JSON.parse(readFileSync(`src/translations/${file}`, "utf8"));
const lookup = (json: any, key: string) =>
  key.split(".").reduce((node, part) => node?.[part], json);

const en = readJson("en.json");
const yue = readJson("yue-own.json");

const ENTITY = /\b[a-z_]+\.[a-z0-9_]+\b(?<!persistent_notification\.create)/;

describe("automation and script starting points", () => {
  it("has six of each with unique ids", () => {
    for (const list of [AUTOMATION_STARTING_POINTS, SCRIPT_STARTING_POINTS]) {
      const ids = list.map((item) => item.id);
      expect(ids).toHaveLength(6);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("validates every automation example", () => {
    for (const item of AUTOMATION_STARTING_POINTS) {
      expect(() =>
        validateStartingPointConfig("automation", item.build(localize))
      ).not.toThrow();
    }
  });

  it("validates every script example", () => {
    for (const item of SCRIPT_STARTING_POINTS) {
      expect(() =>
        validateStartingPointConfig("script", item.build(localize))
      ).not.toThrow();
    }
  });

  it("rejects a configuration that is not valid", () => {
    expect(() =>
      validateStartingPointConfig("automation", {
        alias: "x",
        triggers: [{ at: "07:00" }],
        actions: [{ action: "a.b" }],
      })
    ).toThrow();
    expect(() =>
      validateStartingPointConfig("script", { alias: "x", sequence: [] })
    ).toThrow();
  });

  it("names no entity that might be missing", () => {
    const all = [...AUTOMATION_STARTING_POINTS, ...SCRIPT_STARTING_POINTS];
    for (const item of all) {
      const text = JSON.stringify(item.build(localize)).replace(
        /persistent_notification\.create|repeat\.index|ui\.components\.starting_points\.[a-z_]+/g,
        ""
      );
      expect(text).not.toMatch(
        /"(light|switch|sensor|binary_sensor|climate|cover)\.[a-z0-9_]+"/
      );
      expect(text).not.toMatch(ENTITY);
    }
  });

  it("has every localization key in English and in Cantonese", () => {
    const all = [...AUTOMATION_STARTING_POINTS, ...SCRIPT_STARTING_POINTS];
    const keys = new Set<string>([
      "ui.components.starting_points.automation_heading",
      "ui.components.starting_points.script_heading",
    ]);
    for (const item of all) {
      keys.add(item.titleKey);
      keys.add(item.descriptionKey);
      for (const match of JSON.stringify(item.build(localize)).matchAll(
        /ui\.components\.starting_points\.[a-z_]+/g
      )) {
        keys.add(match[0]);
      }
    }
    for (const key of keys) {
      expect(typeof lookup(en, key), key).toBe("string");
      expect(typeof lookup(yue, key), key).toBe("string");
    }
  });

  it("gives nothing for an unknown id", () => {
    expect(automationConfigForStartingPoint("nope", localize)).toBeUndefined();
    expect(scriptConfigForStartingPoint("nope", localize)).toBeUndefined();
  });
});
