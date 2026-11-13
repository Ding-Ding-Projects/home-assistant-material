import { describe, expect, it } from "vitest";
import {
  isLocked,
  setStepEnabled,
  setStepLocked,
} from "../../../../../src/panels/config/automation/tools/step-toggle";

const config = {
  triggers: [
    { trigger: "time", at: "07:00:00" },
    { triggers: [{ trigger: "sun", event: "sunset" }] },
  ],
  conditions: ["{{ true }}"],
  actions: [
    { action: "light.turn_on" },
    {
      if: [{ condition: "state", entity_id: "a.b", state: "on" }],
      then: [{ delay: "00:00:01" }],
      else: { action: "notify.alex" },
    },
  ],
};

describe("setStepEnabled", () => {
  it("switches a top level step off and on without touching the input", () => {
    const off = setStepEnabled(config, "action/0", false)!;
    expect(off.actions[0]).toEqual({ action: "light.turn_on", enabled: false });
    expect(config.actions[0]).toEqual({ action: "light.turn_on" });
    expect(setStepEnabled(off, "action/0", true)!.actions[0]).toEqual({
      action: "light.turn_on",
    });
  });

  it("reaches nested steps, including a single step written without a list", () => {
    const next = setStepEnabled(config, "action/1/else/0", false)!;
    expect((next.actions[1] as any).else).toEqual([
      { action: "notify.alex", enabled: false },
    ]);
    const then = setStepEnabled(config, "action/1/then/0", false)!;
    expect((then.actions[1] as any).then[0].enabled).toBe(false);
  });

  it("finds a trigger inside a trigger group by its flat index", () => {
    const next = setStepEnabled(config, "trigger/1", false)!;
    expect((next.triggers[1] as any).triggers[0].enabled).toBe(false);
  });

  it("turns a template shorthand condition into a condition", () => {
    const next = setStepEnabled(config, "condition/0", false)!;
    expect(next.conditions[0]).toEqual({
      condition: "template",
      value_template: "{{ true }}",
      enabled: false,
    });
  });

  it("returns undefined for a path that names nothing", () => {
    expect(setStepEnabled(config, "action/9", false)).toBeUndefined();
    expect(setStepEnabled(config, "action/1/then/4", false)).toBeUndefined();
  });
});

describe("setStepLocked", () => {
  it("writes and removes the lock marker without touching the input", () => {
    const locked = setStepLocked(config, "action/0", true)!;
    expect(locked.actions[0]).toEqual({
      action: "light.turn_on",
      editor_locked: true,
    });
    expect(isLocked(locked.actions[0])).toBe(true);
    expect(isLocked(config.actions[0])).toBe(false);
    expect(setStepLocked(locked, "action/0", false)!.actions[0]).toEqual({
      action: "light.turn_on",
    });
  });

  it("locks a nested step", () => {
    const next = setStepLocked(config, "action/1/then/0", true)!;
    expect((next.actions[1] as any).then[0].editor_locked).toBe(true);
  });
});
