import { describe, expect, it } from "vitest";
import {
  applyEntityMatches,
  findEntityMatches,
} from "../../../../src/panels/lovelace/editor/swap-entity-text";

const yaml = [
  "views:",
  "  - cards:",
  "      - entity: light.kitchen",
  "      - entity: light.kitchen_counter",
  "      - entities:",
  "          - light.kitchen",
  "      - content: '{{ states.light.kitchen.state }} # sensor.light.kitchen'",
].join("\n");

describe("findEntityMatches", () => {
  it("matches whole ids only", () => {
    const matches = findEntityMatches(yaml, "light.kitchen", "light.galley");
    expect(matches.map((m) => m.line)).toEqual([3, 6]);
  });

  it("does not match the tail of a longer dotted name", () => {
    const matches = findEntityMatches(yaml, "light.kitchen", "light.galley");
    expect(matches.some((m) => m.line === 7)).toBe(false);
  });

  it("describes the line before and after", () => {
    const [first] = findEntityMatches(yaml, "light.kitchen", "light.galley");
    expect(first.before).toBe("      - entity: light.kitchen");
    expect(first.after).toBe("      - entity: light.galley");
  });

  it("returns nothing for an invalid id", () => {
    expect(findEntityMatches(yaml, "kitchen", "x.y")).toEqual([]);
  });
});

describe("applyEntityMatches", () => {
  it("replaces only the chosen matches", () => {
    const matches = findEntityMatches(yaml, "light.kitchen", "light.galley");
    const result = applyEntityMatches(yaml, [matches[0]], "light.galley");
    expect(result).toContain("entity: light.galley\n");
    expect(result).toContain("          - light.kitchen\n");
    expect(result).toContain("light.kitchen_counter");
  });
});
