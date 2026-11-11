import { describe, expect, it, vi } from "vitest";
import {
  dryRunAutomation,
  formatDelay,
} from "../../../../src/panels/config/automation/automation-dry-run";
import { isSaveDisabled } from "../../../../src/panels/config/automation/run-helpers";

const makeHass = (
  states: Record<string, { state: string; attributes?: object }>,
  serverResult: boolean | Error = true
) => {
  const callWS = vi.fn(async (msg: { type: string }) => {
    if (msg.type !== "test_condition") {
      throw new Error(`unexpected ${msg.type}`);
    }
    if (serverResult instanceof Error) {
      throw serverResult;
    }
    return { result: serverResult };
  });
  const callService = vi.fn();
  const full = Object.fromEntries(
    Object.entries(states).map(([id, s]) => [
      id,
      { entity_id: id, state: s.state, attributes: s.attributes ?? {} },
    ])
  );
  return { states: full, callWS, callService } as any;
};

const light = { action: "light.turn_on", target: { entity_id: "light.hall" } };

describe("dryRunAutomation conditions", () => {
  it("passes a state condition and would run the actions", async () => {
    const hass = makeHass({
      "input_boolean.home": { state: "on" },
      "light.hall": { state: "off", attributes: { friendly_name: "Hall" } },
    });
    const result = await dryRunAutomation(hass, {
      conditions: [
        { condition: "state", entity_id: "input_boolean.home", state: "on" },
      ],
      actions: [light],
    } as any);
    expect(result.conditions).toBe("pass");
    const action = result.steps.find((s) => s.section === "action")!;
    expect(action.verdict).toBe("would_run");
    expect(action.service).toBe("light.turn_on");
    expect(action.targets).toEqual([
      { kind: "entity_id", id: "light.hall", name: "Hall" },
    ]);
    expect(hass.callService).not.toHaveBeenCalled();
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("skips the actions when a state condition fails", async () => {
    const hass = makeHass({ "input_boolean.home": { state: "off" } });
    const result = await dryRunAutomation(hass, {
      conditions: [
        { condition: "state", entity_id: "input_boolean.home", state: "on" },
      ],
      actions: [light, { delay: 5 }],
    } as any);
    expect(result.conditions).toBe("fail");
    const actions = result.steps.filter((s) => s.section === "action");
    expect(actions.map((s) => s.verdict)).toEqual(["would_skip", "would_skip"]);
    expect(actions[0].reason).toBe("conditions_fail");
  });

  it("does not pass a state condition with a for option from the state alone", async () => {
    const hass = makeHass({ "binary_sensor.door": { state: "on" } }, false);
    const result = await dryRunAutomation(hass, {
      conditions: [
        {
          condition: "state",
          entity_id: "binary_sensor.door",
          state: "on",
          for: { minutes: 10 },
        },
      ],
      actions: [light],
    } as any);
    // The server knows how long the state held, so it decides.
    expect(hass.callWS).toHaveBeenCalledTimes(1);
    expect(result.conditions).toBe("fail");
  });

  it("decides a numeric state condition from the live value", async () => {
    const hass = makeHass({ "sensor.temp": { state: "21.5" } });
    const run = (above: number) =>
      dryRunAutomation(hass, {
        conditions: [
          { condition: "numeric_state", entity_id: "sensor.temp", above },
        ],
        actions: [],
      } as any);
    expect((await run(20)).conditions).toBe("pass");
    expect((await run(25)).conditions).toBe("fail");
    const bad = makeHass({ "sensor.temp": { state: "unavailable" } });
    const result = await dryRunAutomation(bad, {
      conditions: [
        { condition: "numeric_state", entity_id: "sensor.temp", above: 1 },
      ],
      actions: [light],
    } as any);
    expect(result.conditions).toBe("unknown");
    expect(result.steps[result.steps.length - 1]!.verdict).toBe("cannot_tell");
  });

  it("cannot tell a template that reads the trigger, and never asks the server", async () => {
    const hass = makeHass({});
    const result = await dryRunAutomation(hass, {
      conditions: [
        {
          condition: "template",
          value_template: "{{ trigger.to_state.state == 'on' }}",
        },
      ],
      actions: [light],
    } as any);
    expect(result.conditions).toBe("unknown");
    expect(result.steps[0]).toMatchObject({
      verdict: "cannot_tell",
      reason: "needs_trigger",
    });
    expect(result.steps[result.steps.length - 1]).toMatchObject({
      verdict: "cannot_tell",
      reason: "conditions_unknown",
    });
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("asks the server about other conditions, which only reads", async () => {
    const hass = makeHass({}, false);
    const result = await dryRunAutomation(hass, {
      conditions: [{ condition: "sun", after: "sunset" }],
      actions: [],
    } as any);
    expect(result.conditions).toBe("fail");
    expect(hass.callWS).toHaveBeenCalledTimes(1);
    const failing = await dryRunAutomation(makeHass({}, new Error("boom")), {
      conditions: [{ condition: "sun", after: "sunset" }],
      actions: [],
    } as any);
    expect(failing.steps[0]).toMatchObject({
      reason: "server_error",
      detail: "boom",
    });
  });
});

describe("dryRunAutomation actions", () => {
  it("takes the first choose option that passes and skips the rest", async () => {
    const hass = makeHass({ "sensor.a": { state: "2" } });
    const result = await dryRunAutomation(hass, {
      conditions: [],
      actions: [
        {
          choose: [
            {
              conditions: [
                { condition: "state", entity_id: "sensor.a", state: "1" },
              ],
              sequence: [{ delay: 1 }],
            },
            {
              conditions: [
                { condition: "state", entity_id: "sensor.a", state: "2" },
              ],
              sequence: [light],
            },
            { conditions: [], sequence: [{ delay: 3 }] },
          ],
          default: [{ event: "none" }],
        },
      ],
    } as any);
    const options = result.steps.filter((s) => s.kind === "option");
    expect(options.map((s) => s.verdict)).toEqual([
      "would_skip",
      "would_run",
      "would_skip",
    ]);
    expect(result.steps.find((s) => s.kind === "service")!.verdict).toBe(
      "would_run"
    );
    expect(result.steps.find((s) => s.kind === "delay")).toBeUndefined();
    expect(result.steps.find((s) => s.kind === "default")!.verdict).toBe(
      "would_skip"
    );
  });

  it("falls back to the default and cannot tell after an unknown option", async () => {
    const hass = makeHass({});
    const none = await dryRunAutomation(hass, {
      conditions: [],
      actions: [
        {
          choose: [
            {
              conditions: [
                { condition: "state", entity_id: "sensor.x", state: "1" },
              ],
              sequence: [],
            },
          ],
          default: [{ event: "fallback" }],
        },
      ],
    } as any);
    // The entity does not exist, so the option cannot be told.
    expect(none.steps.find((s) => s.kind === "default")).toMatchObject({
      verdict: "cannot_tell",
    });
    const noMatch = await dryRunAutomation(
      makeHass({ "sensor.x": { state: "2" } }),
      {
        conditions: [],
        actions: [
          {
            choose: [
              {
                conditions: [
                  { condition: "state", entity_id: "sensor.x", state: "1" },
                ],
                sequence: [],
              },
            ],
            default: [{ event: "fallback" }],
          },
        ],
      } as any
    );
    expect(noMatch.steps.find((s) => s.kind === "event")).toMatchObject({
      verdict: "would_run",
      event: "fallback",
    });
  });

  it("lists a delay with its length and a stop skips what follows", async () => {
    const result = await dryRunAutomation(makeHass({}), {
      conditions: [],
      actions: [
        { delay: { minutes: 1, seconds: 30 } },
        { delay: "{{ states('input_number.x') }}" },
        { stop: "done" },
        light,
      ],
    } as any);
    const [first, second, stop, after] = result.steps;
    expect(first).toMatchObject({
      kind: "delay",
      delay: "00:01:30",
      verdict: "would_run",
    });
    expect(second.delay).toBeUndefined();
    expect(stop.kind).toBe("stop");
    expect(after).toMatchObject({ verdict: "would_skip", reason: "stopped" });
  });

  it("follows the then branch of an if", async () => {
    const result = await dryRunAutomation(
      makeHass({ "sensor.a": { state: "on" } }),
      {
        conditions: [],
        actions: [
          {
            if: [{ condition: "state", entity_id: "sensor.a", state: "on" }],
            then: [light],
            else: [{ event: "no" }],
          },
        ],
      } as any
    );
    expect(result.steps.find((s) => s.kind === "then")!.verdict).toBe(
      "would_run"
    );
    expect(result.steps.find((s) => s.kind === "else")!.verdict).toBe(
      "would_skip"
    );
    expect(result.steps.some((s) => s.kind === "event")).toBe(false);
  });

  it("marks a disabled action as skipped", async () => {
    const result = await dryRunAutomation(makeHass({}), {
      conditions: [],
      actions: [{ ...light, enabled: false }],
    } as any);
    expect(result.steps[0]).toMatchObject({
      verdict: "would_skip",
      reason: "disabled",
    });
  });
});

describe("formatDelay", () => {
  it("formats numbers, strings and parts; a template has no length", () => {
    expect(formatDelay(90)).toBe("00:01:30");
    expect(formatDelay("0:05")).toBe("00:05:00");
    expect(formatDelay({ hours: 1, milliseconds: 500 })).toBe("01:00:00.500");
    expect(formatDelay("{{ x }}")).toBeUndefined();
  });
});

describe("isSaveDisabled", () => {
  it("is off for a read-only automation, while saving and when unchanged", () => {
    expect(isSaveDisabled({ readOnly: true, saving: false, dirty: true })).toBe(
      true
    );
    expect(isSaveDisabled({ readOnly: false, saving: true, dirty: true })).toBe(
      true
    );
    expect(
      isSaveDisabled({ readOnly: false, saving: false, dirty: false })
    ).toBe(true);
    expect(
      isSaveDisabled({ readOnly: false, saving: false, dirty: true })
    ).toBe(false);
  });
});
