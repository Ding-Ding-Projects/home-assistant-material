import { describe, expect, it } from "vitest";
import {
  sectionCounts,
  sectionSummaries,
} from "../../../../src/panels/config/dashboard/section-summaries";

// Protects the counts on the settings home cards: they are read from what
// the instance holds, and a count that is not known yet is left out rather
// than shown as zero.

const hass = {
  devices: { a: {}, b: {}, c: {} },
  states: {
    "automation.one": {},
    "automation.two": {},
    "scene.movie": {},
    "person.sam": {},
    "light.automation_lamp": {},
  },
  areas: { kitchen: {}, hall: {} },
  floors: { ground: {} },
  panels: {
    lovelace: { component_name: "lovelace" },
    extra: { component_name: "lovelace" },
    config: { component_name: "config" },
  },
  config: { version: "2026.11.1.32" },
} as any;

const localize = ((key: string, values: Record<string, unknown>) =>
  `${key.split(".").pop()}:${Object.values(values).join("/")}`) as any;

describe("sectionCounts", () => {
  it("counts by domain prefix, not by text anywhere in the id", () => {
    const counts = sectionCounts(hass, 7);
    expect(counts).toEqual({
      devices: 3,
      integrations: 7,
      automations: 2,
      scenes: 1,
      areas: 2,
      floors: 1,
      dashboards: 2,
      people: 1,
      version: "2026.11.1.32",
    });
  });
});

describe("sectionSummaries", () => {
  it("names what each section holds", () => {
    const summaries = sectionSummaries(sectionCounts(hass, 7), localize);
    expect(summaries["/config/integrations"]).toBe("devices:3, integrations:7");
    expect(summaries["/config/automation"]).toBe("automations:2, scenes:1");
    expect(summaries["/config/areas"]).toBe("areas_floors:2/1");
    expect(summaries["/config/info"]).toBe("version:2026.11.1.32");
  });

  it("leaves integrations out until they are known", () => {
    const summaries = sectionSummaries(sectionCounts(hass), localize);
    expect(summaries["/config/integrations"]).toBe("devices:3");
  });

  it("does not mention floors when there are none", () => {
    const summaries = sectionSummaries(
      sectionCounts({ ...hass, floors: {} }, 1),
      localize
    );
    expect(summaries["/config/areas"]).toBe("areas:2");
  });
});
