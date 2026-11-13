import { describe, expect, it } from "vitest";
import { resolveStepPath } from "../../../../../src/panels/config/automation/tools/find-step-row";

const config = {
  triggers: [
    { trigger: "time", at: "07:00:00" },
    { triggers: [{ trigger: "sun", event: "sunset" }] },
  ],
  conditions: [{ condition: "state", entity_id: "a.b", state: "on" }],
  actions: [
    { action: "light.turn_on" },
    {
      choose: [
        { conditions: [], sequence: [{ delay: "00:00:01" }, { stop: "x" }] },
        { conditions: [], sequence: { action: "notify.alex" } },
      ],
      default: [{ action: "light.turn_off" }],
    },
    {
      if: [],
      then: [{ delay: "00:00:02" }],
      else: { action: "notify.sam" },
    },
    { repeat: { count: 2, sequence: [{ action: "switch.toggle" }] } },
  ],
};

describe("resolveStepPath", () => {
  it("finds top level steps, with triggers flattened", () => {
    expect(resolveStepPath(config, "trigger/0")).toBe(config.triggers[0]);
    expect(resolveStepPath(config, "trigger/1")).toEqual({
      trigger: "sun",
      event: "sunset",
    });
    expect(resolveStepPath(config, "condition/0")).toBe(config.conditions[0]);
    expect(resolveStepPath(config, "action/0")).toBe(config.actions[0]);
  });

  it("finds a choose option and the steps inside it", () => {
    const choose: any = config.actions[1];
    expect(resolveStepPath(config, "action/1/choose/1")).toBe(choose.choose[1]);
    expect(resolveStepPath(config, "action/1/choose/0/sequence/1")).toBe(
      choose.choose[0].sequence[1]
    );
    expect(resolveStepPath(config, "action/1/choose/1/sequence/0")).toBe(
      choose.choose[1].sequence
    );
  });

  it("names the owning step for a branch list", () => {
    expect(resolveStepPath(config, "action/1/default")).toBe(config.actions[1]);
    expect(resolveStepPath(config, "action/2/then")).toBe(config.actions[2]);
    expect(resolveStepPath(config, "action/2/else")).toBe(config.actions[2]);
  });

  it("finds steps inside then, else and repeat", () => {
    const iff: any = config.actions[2];
    expect(resolveStepPath(config, "action/2/then/0")).toBe(iff.then[0]);
    expect(resolveStepPath(config, "action/2/else/0")).toBe(iff.else);
    const repeat: any = config.actions[3];
    expect(resolveStepPath(config, "action/3/repeat/sequence/0")).toBe(
      repeat.repeat.sequence[0]
    );
  });

  it("returns undefined for paths that lead nowhere", () => {
    expect(resolveStepPath(config, "action/9")).toBeUndefined();
    expect(resolveStepPath(config, "action/2/then/5")).toBeUndefined();
    expect(resolveStepPath(config, "nothing/0")).toBeUndefined();
    expect(resolveStepPath(config, "action")).toBeUndefined();
  });
});
