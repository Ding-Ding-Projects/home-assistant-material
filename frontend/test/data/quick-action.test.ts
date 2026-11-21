import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeRuns,
  defaultActionFor,
  delaySeconds,
  duplicateStep,
  firstStepFor,
  isRiskySequence,
  moveStep,
  QUICK_ACTION_LABEL_LENGTH,
  runLabel,
  runStateFromServer,
  sequenceToSteps,
  sleepUnlessStopped,
  stepsAreComplete,
  stepsToSequence,
  validateSequence,
  waitStep,
} from "../../src/data/quick-action";
import type { QuickActionRun, QuickStep } from "../../src/data/quick-action";

const services = {
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  lock: { lock: {}, unlock: {}, open: {} },
  cover: { open_cover: {}, close_cover: {}, toggle: {} },
  button: { press: {} },
  sensor: {},
  notify: { send_message: {} },
  homeassistant: { turn_on: {}, turn_off: {} },
};

// Protects the first step a person sees: it should do the opposite of the
// present state, never repeat it.
describe("defaultActionFor", () => {
  it("offers the opposite of the present state", () => {
    expect(defaultActionFor("light.hall", "on", services)).toBe(
      "light.turn_off"
    );
    expect(defaultActionFor("light.hall", "off", services)).toBe(
      "light.turn_on"
    );
    expect(defaultActionFor("lock.front", "locked", services)).toBe(
      "lock.unlock"
    );
    expect(defaultActionFor("cover.garage", "open", services)).toBe(
      "cover.close_cover"
    );
    expect(defaultActionFor("button.bell", "unknown", services)).toBe(
      "button.press"
    );
  });

  it("falls back to toggle, then the first service, then nothing", () => {
    expect(defaultActionFor("light.hall", "unavailable", services)).toBe(
      "light.toggle"
    );
    expect(defaultActionFor("notify.phone", "unknown", services)).toBe(
      "notify.send_message"
    );
    expect(defaultActionFor("sensor.temp", "21", services)).toBeUndefined();
  });
});

// Protects the two-way sync between the guided view and the YAML view, so
// switching tabs never changes what runs.
describe("guided steps and the sequence", () => {
  const steps: QuickStep[] = [
    firstStepFor("light.hall", "off", services),
    waitStep(600),
    {
      kind: "other",
      action: "light.turn_off",
      target: { entity_id: "light.porch" },
      data: {},
    },
  ];

  it("round-trips", () => {
    const sequence = stepsToSequence(steps);
    expect(sequence).toEqual([
      { action: "light.turn_on", target: { entity_id: "light.hall" } },
      { delay: { hours: 0, minutes: 10, seconds: 0 } },
      { action: "light.turn_off", target: { entity_id: "light.porch" } },
    ]);
    expect(sequenceToSteps(sequence, "light.hall")).toEqual(steps);
  });

  it("reads legacy forms", () => {
    expect(
      sequenceToSteps(
        [
          { service: "light.turn_on", data: { entity_id: "light.hall" } },
          { delay: "00:01:30" },
        ],
        "light.hall"
      )
    ).toEqual([
      {
        kind: "action",
        action: "light.turn_on",
        target: { entity_id: "light.hall" },
        data: {},
      },
      waitStep(90),
    ]);
  });

  it("leaves what it cannot show to the YAML view", () => {
    expect(sequenceToSteps([{ condition: "state" }])).toBeUndefined();
    expect(
      sequenceToSteps([{ action: "light.turn_on", continue_on_error: true }])
    ).toBeUndefined();
    expect(sequenceToSteps([{ delay: "{{ 5 }}" }])).toBeUndefined();
    expect(
      sequenceToSteps([
        { action: "light.turn_on", target: { entity_id: "{{ x }}" } },
      ])
    ).toBeUndefined();
  });

  it("needs every step filled in before it runs", () => {
    expect(stepsAreComplete(steps)).toBe(true);
    expect(stepsAreComplete([firstStepFor(undefined, undefined, {})])).toBe(
      false
    );
    expect(stepsAreComplete([])).toBe(false);
  });
});

describe("delaySeconds", () => {
  it("reads every fixed form", () => {
    expect(delaySeconds(5)).toBe(5);
    expect(delaySeconds("01:00")).toBe(60);
    expect(delaySeconds("01:00:05")).toBe(3605);
    expect(delaySeconds({ minutes: 2, seconds: 3 })).toBe(123);
    expect(delaySeconds({ minutes: "{{ x }}" })).toBeUndefined();
    expect(delaySeconds(-1)).toBeUndefined();
  });
});

// Protects the check that runs before anything is sent.
describe("validateSequence", () => {
  it("accepts a list or a single step", () => {
    expect(validateSequence([{ action: "light.turn_on" }], services)).toEqual({
      ok: true,
      sequence: [{ action: "light.turn_on" }],
    });
    expect(validateSequence({ delay: 1 }, services)).toEqual({
      ok: true,
      sequence: [{ delay: 1 }],
    });
  });

  it("names what is wrong", () => {
    expect(validateSequence({}, services)).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(validateSequence("text", services)).toEqual({
      ok: false,
      problem: "not_list",
    });
    expect(validateSequence([{ delay: 1 }, 3], services)).toEqual({
      ok: false,
      problem: "bad_step",
      step: 2,
    });
    expect(validateSequence([{ action: "" }], services)).toEqual({
      ok: false,
      problem: "missing_action",
      step: 1,
    });
    expect(validateSequence([{ action: "light.melt" }], services)).toEqual({
      ok: false,
      problem: "unknown_action",
      step: 1,
    });
  });
});

// Protects the rule that anything able to unlock or open the home asks first,
// including when it is hidden in a nested step or behind an area target.
describe("isRiskySequence", () => {
  const risky = (id: string) => id === "cover.garage";

  it("asks for risky domains and risky entities", () => {
    expect(
      isRiskySequence([{ action: "lock.unlock", target: {} }], risky)
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "cover.open_cover", target: { entity_id: "cover.garage" } }],
        risky
      )
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "homeassistant.turn_on", entity_id: "cover.garage" }],
        risky
      )
    ).toBe(true);
  });

  it("looks inside nested steps and unresolved targets", () => {
    expect(
      isRiskySequence(
        [
          {
            if: [],
            then: [
              {
                action: "light.turn_on",
                target: { entity_id: ["light.a", "cover.garage"] },
              },
            ],
          },
        ],
        risky
      )
    ).toBe(true);
    expect(
      isRiskySequence(
        [{ action: "cover.open_cover", target: { area_id: "garage" } }],
        risky
      )
    ).toBe(true);
  });

  it("lets ordinary steps run straight away", () => {
    expect(
      isRiskySequence(
        [
          { action: "light.turn_on", target: { entity_id: "light.hall" } },
          { delay: 5 },
          { action: "light.turn_on", target: { area_id: "kitchen" } },
        ],
        risky
      )
    ).toBe(false);
  });
});

describe("step list edits", () => {
  it("moves, duplicates and keeps bounds", () => {
    const list: QuickStep[] = [waitStep(1), waitStep(2), waitStep(3)];
    expect(moveStep(list, 0, 1).map((s) => (s as any).seconds)).toEqual([
      2, 1, 3,
    ]);
    expect(moveStep(list, 0, -1)).toBe(list);
    const copy = duplicateStep(list, 1);
    expect(copy).toHaveLength(4);
    expect(copy[2]).toEqual(list[1]);
    expect(copy[2]).not.toBe(list[1]);
  });
});

const serverRun = (
  overrides: Partial<QuickActionRun> = {}
): QuickActionRun => ({
  id: "a",
  label: "Front door",
  entity_id: "lock.front",
  user_id: "user",
  started: "2026-11-20T10:00:00+00:00",
  ended: null,
  state: "running",
  total_steps: 2,
  current_step: null,
  error: null,
  ...overrides,
});

// The dialog's progress, its Stop button and its result all follow these.
describe("server runs", () => {
  it("shows a run that is still going as running, with what it is doing", () => {
    expect(
      runStateFromServer(serverRun({ current_step: "delay 0:10:00" }))
    ).toEqual({ phase: "running", total: 2, now: "delay 0:10:00" });
    expect(runStateFromServer(serverRun())).toEqual({
      phase: "running",
      total: 2,
      now: undefined,
    });
  });

  it("tells a stopped run apart from a finished or failed one", () => {
    expect(runStateFromServer(serverRun({ state: "finished" }))).toEqual({
      phase: "done",
    });
    expect(runStateFromServer(serverRun({ state: "stopped" }))).toEqual({
      phase: "stopped",
    });
    expect(
      runStateFromServer(serverRun({ state: "failed", error: "Jammed" }))
    ).toEqual({ phase: "failed", reason: "Jammed" });
  });

  it("treats a run that is not listed yet as not started", () => {
    expect(runStateFromServer(undefined)).toEqual({ phase: "idle" });
  });

  it("lists only runs that are still going, oldest first", () => {
    const runs = [
      serverRun({ id: "late", started: "2026-11-20T10:05:00+00:00" }),
      serverRun({ id: "done", state: "finished" }),
      serverRun({ id: "early", started: "2026-11-20T09:55:00+00:00" }),
      serverRun({ id: "stopped", state: "stopped" }),
    ];
    expect(activeRuns(runs).map((run) => run.id)).toEqual(["early", "late"]);
  });

  it("cuts a label to the length the server accepts", () => {
    expect(runLabel("  Kitchen  ")).toBe("Kitchen");
    expect(runLabel(undefined)).toBe("");
    expect(runLabel("x".repeat(250))).toHaveLength(QUICK_ACTION_LABEL_LENGTH);
  });
});

// A run from the page relies on this to skip the steps after a stopped wait.
describe("sleepUnlessStopped", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves true when the full time passes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const done = sleepUnlessStopped(1000, controller.signal);
    vi.advanceTimersByTime(1000);
    await expect(done).resolves.toBe(true);
  });

  it("resolves false as soon as it is stopped", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const done = sleepUnlessStopped(60_000, controller.signal);
    vi.advanceTimersByTime(10);
    controller.abort();
    await expect(done).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait at all when already stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleepUnlessStopped(60_000, controller.signal)).resolves.toBe(
      false
    );
  });
});
