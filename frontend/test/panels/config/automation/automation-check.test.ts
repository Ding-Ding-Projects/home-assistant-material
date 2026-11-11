import { describe, expect, it, vi } from "vitest";
import { checkAutomation } from "../../../../src/panels/config/automation/automation-check";

const ok = { valid: true };

const makeHass = (responses: Record<string, any>) =>
  ({
    callWS: vi.fn(async (msg: { type: string }) => {
      const value = responses[msg.type];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    }),
  }) as any;

const config = {
  triggers: [{ trigger: "homeassistant", event: "start" }],
  conditions: [{ condition: "sun" }],
  actions: [],
} as any;

describe("checkAutomation", () => {
  it("names the first invalid part and tests nothing else", async () => {
    const hass = makeHass({
      validate_config: {
        triggers: ok,
        conditions: { valid: false, error: "bad" },
        actions: ok,
      },
    });
    expect(await checkAutomation(hass, config)).toEqual({
      status: "invalid",
      part: "conditions",
      message: "bad",
    });
    expect(hass.callWS).toHaveBeenCalledTimes(1);
  });

  it("reports whether the conditions pass", async () => {
    const valid = { triggers: ok, conditions: ok, actions: ok };
    const pass = makeHass({
      validate_config: valid,
      test_condition: { result: true },
    });
    expect(await checkAutomation(pass, config)).toEqual({
      status: "ok",
      conditions: "pass",
    });
    const fail = makeHass({
      validate_config: valid,
      test_condition: { result: false },
    });
    expect(await checkAutomation(fail, config)).toEqual({
      status: "ok",
      conditions: "fail",
    });
  });

  it("does not test conditions that are not there", async () => {
    const hass = makeHass({
      validate_config: { triggers: ok, conditions: ok, actions: ok },
    });
    expect(
      await checkAutomation(hass, { ...config, conditions: undefined })
    ).toEqual({ status: "ok", conditions: "none" });
    expect(hass.callWS).toHaveBeenCalledTimes(1);
  });

  it("turns a failing call into an error result", async () => {
    const hass = makeHass({ validate_config: new Error("offline") });
    expect(await checkAutomation(hass, config)).toEqual({
      status: "error",
      message: "offline",
    });
  });
});
