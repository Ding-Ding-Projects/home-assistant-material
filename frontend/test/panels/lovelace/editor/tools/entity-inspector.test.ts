import { describe, expect, it } from "vitest";
import { inspectEntities } from "../../../../../src/panels/lovelace/editor/tools/entity-inspector";
import type { LovelaceConfig } from "../../../../../src/data/lovelace/config/types";

const config = {
  views: [
    {
      title: "Home",
      cards: [
        { type: "tile", entity: "light.kitchen" },
        {
          type: "entities",
          title: "Garage",
          entities: ["sensor.old_garage", "light.kitchen"],
        },
        { type: "tile", entity: "switch.fan" },
      ],
    },
  ],
} as unknown as LovelaceConfig;

describe("inspectEntities", () => {
  it("lists every entity once with the cards that use it", () => {
    const rows = inspectEntities(config, {
      "light.kitchen": { state: "on" },
      "switch.fan": { state: "unavailable" },
    });
    expect(rows.map((r) => r.entityId)).toEqual([
      "sensor.old_garage",
      "switch.fan",
      "light.kitchen",
    ]);
    const kitchen = rows.find((r) => r.entityId === "light.kitchen")!;
    expect(kitchen.uses).toHaveLength(2);
    expect(kitchen.state).toBe("on");
  });

  it("marks missing and unavailable entities", () => {
    const rows = inspectEntities(config, { "switch.fan": { state: "off" } });
    expect(rows.find((r) => r.entityId === "sensor.old_garage")!.status).toBe(
      "missing"
    );
    expect(rows.find((r) => r.entityId === "switch.fan")!.status).toBe("ok");
  });
});
