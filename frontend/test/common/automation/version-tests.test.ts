import { describe, expect, it } from "vitest";
import {
  guardedDomains,
  isFailing,
  runLimited,
  summarizeResults,
  versionKey,
} from "../../../src/common/automation/version-tests";

// Running many versions performs real actions in a house. These protect the
// guard that keeps locks, doors and alarms out of such a run, the count the
// person is shown before agreeing, and the limit on how much runs at once.

describe("guardedDomains", () => {
  it("finds a guarded action at the top level", () => {
    expect(
      guardedDomains([
        { action: "light.turn_on", target: { entity_id: "light.hall" } },
        { action: "lock.unlock", target: { entity_id: "lock.front" } },
      ])
    ).toEqual(["lock"]);
  });

  it("finds one however deeply it is nested", () => {
    expect(
      guardedDomains([
        {
          choose: [
            {
              conditions: [],
              sequence: [
                {
                  repeat: {
                    count: 2,
                    sequence: [
                      {
                        if: [],
                        then: [
                          {
                            parallel: [{ service: "cover.open_cover" }],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
          default: [{ action: "alarm_control_panel.alarm_disarm" }],
        },
      ])
    ).toEqual(["alarm_control_panel", "cover"]);
  });

  it("finds a guarded entity behind a general action", () => {
    expect(
      guardedDomains([
        {
          action: "homeassistant.turn_off",
          target: { entity_id: ["light.hall", "siren.attic"] },
        },
        { action: "homeassistant.toggle", entity_id: "valve.garden" },
      ])
    ).toEqual(["siren", "valve"]);
  });

  it("finds nothing in harmless actions or odd input", () => {
    expect(
      guardedDomains([
        { action: "light.turn_on" },
        { delay: "00:00:05" },
        { action: "notify.lockscreen" },
      ])
    ).toEqual([]);
    expect(guardedDomains(undefined)).toEqual([]);
    expect(guardedDomains("lock.unlock")).toEqual([]);
  });
});

describe("summarizeResults", () => {
  const refs = [
    { automationId: "a", alias: "A", sha: "1111111" },
    { automationId: "b", alias: "B", sha: "2222222" },
    { automationId: "c", alias: "C", sha: "working" },
  ];

  it("counts what is done, passed and failed", () => {
    const results = {
      [versionKey(refs[0])]: {
        loads: "pass" as const,
        conditions: "none" as const,
        testedAt: 1,
      },
      [versionKey(refs[1])]: {
        loads: "pass" as const,
        conditions: "fail" as const,
        testedAt: 1,
      },
    };
    expect(summarizeResults(refs, results)).toEqual({
      total: 3,
      done: 2,
      passed: 1,
      failed: 1,
    });
    expect(isFailing(results[versionKey(refs[1])])).toBe(true);
    expect(isFailing(undefined)).toBe(false);
  });
});

describe("runLimited", () => {
  it("never runs more than the limit at once and finishes everything", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      running--;
      done.push(item);
    });
    expect(most).toBeLessThanOrEqual(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts nothing new after a stop", async () => {
    const done: number[] = [];
    let stop = false;
    await runLimited(
      [1, 2, 3, 4, 5],
      1,
      async (item) => {
        done.push(item);
        if (item === 2) {
          stop = true;
        }
      },
      () => stop
    );
    expect(done).toEqual([1, 2]);
  });
});
