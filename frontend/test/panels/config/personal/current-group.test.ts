import { describe, expect, it } from "vitest";
import { pickCurrentGroup } from "../../../../src/panels/config/personal/current-group";

describe("pickCurrentGroup", () => {
  const order = ["language", "sounds", "modes", "schedules"];

  it("returns the first group in page order that is in view", () => {
    expect(pickCurrentGroup(order, new Set(["modes", "sounds"]))).toBe(
      "sounds"
    );
  });

  it("ignores the order in which groups became visible", () => {
    expect(pickCurrentGroup(order, new Set(["schedules", "language"]))).toBe(
      "language"
    );
  });

  it("returns undefined when nothing is in view", () => {
    expect(pickCurrentGroup(order, new Set())).toBeUndefined();
    expect(pickCurrentGroup([], new Set(["language"]))).toBeUndefined();
  });

  it("ignores visible ids that are not in the list", () => {
    expect(pickCurrentGroup(order, new Set(["other"]))).toBeUndefined();
  });
});
