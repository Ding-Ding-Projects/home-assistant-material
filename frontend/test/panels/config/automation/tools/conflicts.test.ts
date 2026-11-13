import { describe, expect, it } from "vitest";
import {
  findConflicts,
  findLoops,
} from "../../../../../src/panels/config/automation/tools/conflicts";

const auto = (id: string, config: object) => ({ id, name: id, config });

describe("findConflicts", () => {
  const arrive = auto("automation.arrive", {
    triggers: [{ trigger: "time", at: "18:00:00" }],
    actions: [{ action: "light.turn_on", target: { entity_id: "light.hall" } }],
  });
  const away = auto("automation.away", {
    triggers: [{ trigger: "time", at: "18:00:00" }],
    actions: [{ action: "light.turn_off", entity_id: "light.hall" }],
  });

  it("reports opposite commands on one entity with overlapping triggers", () => {
    const found = findConflicts([arrive, away]);
    expect(found).toHaveLength(1);
    expect(found[0].entity).toBe("light.hall");
    expect(found[0].basis).toBe("same_trigger");
  });

  it("ignores unrelated triggers, other entities and disabled steps", () => {
    const later = auto("automation.later", {
      triggers: [{ trigger: "time", at: "22:00:00" }],
      actions: [{ action: "light.turn_off", entity_id: "light.hall" }],
    });
    const other = auto("automation.other", {
      triggers: [{ trigger: "time", at: "18:00:00" }],
      actions: [{ action: "light.turn_off", entity_id: "light.porch" }],
    });
    const off = auto("automation.off", {
      triggers: [{ trigger: "time", at: "18:00:00" }],
      actions: [
        { action: "light.turn_off", entity_id: "light.hall", enabled: false },
      ],
    });
    expect(findConflicts([arrive, later, other, off])).toEqual([]);
  });

  it("finds commands nested in a choose", () => {
    const nested = auto("automation.nested", {
      triggers: [{ trigger: "time", at: "18:00:00" }],
      actions: [
        {
          choose: [
            {
              conditions: [],
              sequence: [
                { action: "light.turn_off", entity_id: ["light.hall"] },
              ],
            },
          ],
        },
      ],
    });
    expect(findConflicts([arrive, nested])).toHaveLength(1);
  });
});

describe("findLoops", () => {
  const fanOn = auto("automation.fan_on", {
    triggers: [{ trigger: "state", entity_id: "switch.fan", to: "off" }],
    actions: [{ action: "switch.turn_on", entity_id: "switch.fan" }],
  });
  const fanOff = auto("automation.fan_off", {
    triggers: [{ trigger: "state", entity_id: "switch.fan", to: "on" }],
    actions: [{ action: "switch.turn_off", entity_id: "switch.fan" }],
  });

  it("finds two automations that undo each other", () => {
    const found = findLoops([fanOn, fanOff]);
    expect(found).toHaveLength(1);
    expect(found[0].cycle.map((c) => c.id).sort()).toEqual([
      "automation.fan_off",
      "automation.fan_on",
    ]);
  });

  it("does not report a command that cannot wake the trigger", () => {
    const calm = auto("automation.calm", {
      triggers: [{ trigger: "state", entity_id: "switch.fan", to: "on" }],
      actions: [{ action: "switch.turn_on", entity_id: "switch.fan" }],
    });
    // Turning the fan on while waiting for it to turn on does wake it.
    expect(findLoops([calm])).toHaveLength(1);
    const quiet = auto("automation.quiet", {
      triggers: [{ trigger: "state", entity_id: "switch.fan", to: "on" }],
      actions: [{ action: "switch.turn_off", entity_id: "switch.fan" }],
    });
    expect(findLoops([quiet])).toEqual([]);
  });
});
