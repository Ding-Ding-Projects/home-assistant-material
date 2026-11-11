import { describe, expect, it } from "vitest";
import {
  conditionStatus,
  evaluateSchedules,
  nextChange,
  parseNumericState,
  ruleProblem,
  sanitizeRule,
  sanitizeSchedules,
  watchedEntityIds,
  type EntityCondition,
  type ScheduleRule,
} from "../../../src/common/preferences/preference-schedule";

const ZONE = "America/Toronto";
// Wednesday 2024-01-10 12:00 in Toronto.
const NOON = new Date("2024-01-10T17:00:00Z");

const rule = (partial: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: "r1",
  name: "",
  enabled: true,
  preference: "lowStimulation",
  value: true,
  from: "00:00",
  to: "00:00",
  days: [0, 1, 2, 3, 4, 5, 6],
  ...partial,
});

const cond = (partial: Partial<EntityCondition> = {}): EntityCondition => ({
  entityId: "binary_sensor.tv_on",
  comparison: "is",
  states: ["on"],
  ...partial,
});

const lookupOf =
  (states: Record<string, string>) =>
  (id: string): string | undefined =>
    states[id];

describe("entity conditions", () => {
  it("is: holds when the state is one of the listed states", () => {
    const c = cond({ states: ["on", "playing"] });
    expect(conditionStatus(c, lookupOf({ [c.entityId]: "on" }))).toBe("met");
    expect(conditionStatus(c, lookupOf({ [c.entityId]: "Playing" }))).toBe(
      "met"
    );
    expect(conditionStatus(c, lookupOf({ [c.entityId]: "off" }))).toBe(
      "not_met"
    );
  });

  it("is not: holds for any other readable state", () => {
    const c = cond({ comparison: "is_not" });
    expect(conditionStatus(c, lookupOf({ [c.entityId]: "off" }))).toBe("met");
    expect(conditionStatus(c, lookupOf({ [c.entityId]: "on" }))).toBe(
      "not_met"
    );
  });

  it("above and below compare numbers strictly", () => {
    const above = cond({
      entityId: "sensor.lux",
      comparison: "above",
      states: [],
      threshold: 50,
    });
    const below = { ...above, comparison: "below" as const };
    expect(conditionStatus(above, lookupOf({ "sensor.lux": "51" }))).toBe(
      "met"
    );
    expect(conditionStatus(above, lookupOf({ "sensor.lux": "50" }))).toBe(
      "not_met"
    );
    expect(conditionStatus(below, lookupOf({ "sensor.lux": "49.5" }))).toBe(
      "met"
    );
    expect(conditionStatus(below, lookupOf({ "sensor.lux": "50" }))).toBe(
      "not_met"
    );
  });

  it("never holds for a missing, unavailable or unknown entity", () => {
    for (const comparison of ["is", "is_not", "above", "below"] as const) {
      const c = cond({ comparison, states: ["on"], threshold: 1 });
      expect(conditionStatus(c, lookupOf({}))).toBe("unavailable");
      expect(conditionStatus(c, undefined)).toBe("unavailable");
      expect(
        conditionStatus(c, lookupOf({ [c.entityId]: "unavailable" }))
      ).toBe("unavailable");
      expect(conditionStatus(c, lookupOf({ [c.entityId]: "unknown" }))).toBe(
        "unavailable"
      );
    }
  });

  it("does not hold for a number comparison against a state that is no number", () => {
    const c = cond({ comparison: "above", states: [], threshold: -5 });
    for (const state of ["", " ", "abc", "0x10", "Infinity", "1,5", "NaN"]) {
      expect(conditionStatus(c, lookupOf({ [c.entityId]: state }))).toBe(
        "not_met"
      );
    }
    expect(parseNumericState(" 12.5 ")).toBe(12.5);
    expect(parseNumericState("-3")).toBe(-3);
    expect(parseNumericState("1e3")).toBe(1000);
    expect(parseNumericState("")).toBeUndefined();
    expect(parseNumericState("Infinity")).toBeUndefined();
  });
});

describe("evaluating rules with an entity", () => {
  const tv = rule({ condition: cond(), timed: false });

  it("applies an entity-only rule while the condition holds", () => {
    const on = evaluateSchedules(
      [tv],
      NOON,
      ZONE,
      new Set(),
      lookupOf({ "binary_sensor.tv_on": "on" })
    );
    expect(on.overlay.lowStimulation).toBe(true);
    const off = evaluateSchedules(
      [tv],
      NOON,
      ZONE,
      new Set(),
      lookupOf({ "binary_sensor.tv_on": "off" })
    );
    expect(off.overlay).toEqual({});
    const gone = evaluateSchedules([tv], NOON, ZONE, new Set(), lookupOf({}));
    expect(gone.overlay).toEqual({});
  });

  it("without a lookup an entity rule does not apply", () => {
    expect(evaluateSchedules([tv], NOON, ZONE).overlay).toEqual({});
  });

  it("needs both the time window and the condition when it has both", () => {
    const both = rule({
      from: "08:00",
      to: "10:00",
      condition: cond(),
    });
    const on = lookupOf({ "binary_sensor.tv_on": "on" });
    // 12:00 is outside 08:00 to 10:00.
    expect(
      evaluateSchedules([both], NOON, ZONE, new Set(), on).overlay
    ).toEqual({});
    const morning = new Date("2024-01-10T14:00:00Z"); // 09:00 Toronto
    expect(
      evaluateSchedules([both], morning, ZONE, new Set(), on).overlay
    ).toEqual({ lowStimulation: true });
    expect(
      evaluateSchedules(
        [both],
        morning,
        ZONE,
        new Set(),
        lookupOf({ "binary_sensor.tv_on": "off" })
      ).overlay
    ).toEqual({});
  });

  it("keeps the order: the first rule that applies wins, and School mode wins", () => {
    const first = rule({
      id: "a",
      value: false,
      timed: false,
      condition: cond(),
    });
    const second = rule({ id: "b", value: true });
    const on = lookupOf({ "binary_sensor.tv_on": "on" });
    const result = evaluateSchedules(
      [first, second],
      NOON,
      ZONE,
      new Set(),
      on
    );
    expect(result.deciding.lowStimulation?.ruleId).toBe("a");
    expect(result.overridden.b).toBe("a");
    // The condition fails, so the next rule decides.
    const off = evaluateSchedules(
      [first, second],
      NOON,
      ZONE,
      new Set(),
      lookupOf({ "binary_sensor.tv_on": "off" })
    );
    expect(off.deciding.lowStimulation?.ruleId).toBe("b");
    const held = evaluateSchedules(
      [first],
      NOON,
      ZONE,
      new Set(["lowStimulation"]),
      on
    );
    expect(held.overlay).toEqual({});
    expect(held.heldBySchool.a).toBeDefined();
  });

  it("the next change reads the entity as it is now", () => {
    const timed = rule({ from: "14:00", to: "15:00", condition: cond() });
    const on = lookupOf({ "binary_sensor.tv_on": "on" });
    expect(
      nextChange([timed], NOON, ZONE, "lowStimulation", new Set(), 8 * 1440, on)
        ?.value
    ).toBe(true);
    // Nothing ever changes while the entity cannot be read.
    expect(
      nextChange(
        [timed],
        NOON,
        ZONE,
        "lowStimulation",
        new Set(),
        8 * 1440,
        lookupOf({})
      )
    ).toBeUndefined();
  });
});

describe("storing rules with a condition", () => {
  it("keeps a valid condition and cleans its states", () => {
    const stored = sanitizeRule({
      ...rule(),
      condition: {
        entityId: "sensor.bedroom_occupancy",
        comparison: "is",
        states: ["  occupied ", "occupied", "", 5, "a".repeat(200)],
        extra: "ignored",
      },
    });
    expect(stored?.condition?.states).toHaveLength(2);
    expect(stored?.condition?.states[0]).toBe("occupied");
    expect(stored?.condition?.states[1]).toHaveLength(64);
    expect(stored?.condition).not.toHaveProperty("extra");
  });

  it("caps the list of states at ten", () => {
    const stored = sanitizeRule({
      ...rule(),
      condition: {
        entityId: "sensor.a",
        comparison: "is_not",
        states: Array.from({ length: 40 }, (_, i) => `s${i}`),
      },
    });
    expect(stored?.condition?.states).toHaveLength(10);
  });

  it("drops a hostile condition but keeps the time rule", () => {
    const hostile: unknown[] = [
      { entityId: "../etc", comparison: "is", states: ["on"] },
      { entityId: "Sensor.Upper", comparison: "is", states: ["on"] },
      {
        entityId: "sensor." + "a".repeat(300),
        comparison: "is",
        states: ["x"],
      },
      { entityId: "sensor.a", comparison: "equals", states: ["on"] },
      { entityId: "sensor.a", comparison: "is", states: [] },
      { entityId: "sensor.a", comparison: "is", states: "on" },
      { entityId: "sensor.a", comparison: "above", threshold: "5" },
      { entityId: "sensor.a", comparison: "above", threshold: NaN },
      { entityId: "sensor.a", comparison: "below", threshold: Infinity },
      { entityId: 5, comparison: "is", states: ["on"] },
      "sensor.a",
      null,
      [],
    ];
    for (const condition of hostile) {
      const stored = sanitizeRule({ ...rule(), condition });
      expect(stored).toBeDefined();
      expect(stored?.condition).toBeUndefined();
    }
  });

  it("drops an entity-only rule that has no valid condition", () => {
    expect(sanitizeRule({ ...rule(), timed: false })).toBeUndefined();
    expect(
      sanitizeRule({
        ...rule(),
        timed: false,
        condition: { entityId: "bad id", comparison: "is", states: ["on"] },
      })
    ).toBeUndefined();
    const kept = sanitizeRule({
      ...rule(),
      timed: false,
      condition: cond(),
    });
    expect(kept?.timed).toBe(false);
  });

  it("reads a rule stored before conditions existed unchanged", () => {
    const old = {
      id: "old",
      name: "Night",
      enabled: true,
      preference: "soundEffects",
      value: false,
      from: "22:00",
      to: "07:00",
      days: [1, 2],
    };
    const stored = sanitizeRule(old);
    expect(stored).toEqual(old);
    expect(stored).not.toHaveProperty("timed");
    expect(stored).not.toHaveProperty("condition");
  });

  it("a stored rule keeps the fields older builds read", () => {
    const stored = sanitizeSchedules([
      rule({ id: "x", timed: false, condition: cond() }),
    ]);
    expect(stored[0]).toMatchObject({
      from: "00:00",
      to: "00:00",
      days: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("flags problems while a rule is being edited", () => {
    expect(ruleProblem(rule({ timed: false }))).toBe("no_condition");
    expect(
      ruleProblem(rule({ timed: false, condition: cond({ entityId: "" }) }))
    ).toBe("invalid_entity");
    expect(
      ruleProblem(rule({ condition: cond({ comparison: "is", states: [] }) }))
    ).toBe("no_states");
    expect(
      ruleProblem(
        rule({ condition: cond({ comparison: "below", states: [] }) })
      )
    ).toBe("invalid_number");
    expect(ruleProblem(rule({ timed: false, condition: cond() }))).toBe(
      undefined
    );
    expect(ruleProblem(rule({ days: [], condition: cond() }))).toBe("no_days");
  });
});

describe("the entities that are watched", () => {
  it("is exactly the entities named by valid, enabled rules", () => {
    const rules = sanitizeSchedules([
      rule({ id: "a", condition: cond({ entityId: "binary_sensor.tv_on" }) }),
      rule({
        id: "b",
        condition: cond({ entityId: "binary_sensor.tv_on" }),
      }),
      rule({ id: "c", condition: cond({ entityId: "sensor.lux" }) }),
      rule({
        id: "d",
        enabled: false,
        condition: cond({ entityId: "sensor.off_rule" }),
      }),
      rule({ id: "e" }),
      // Not valid: never watched.
      rule({ id: "f", condition: cond({ entityId: "not an id" }) }),
    ]);
    expect(watchedEntityIds(rules)).toEqual([
      "binary_sensor.tv_on",
      "sensor.lux",
    ]);
  });

  it("is empty when no rule names an entity", () => {
    expect(watchedEntityIds([rule()])).toEqual([]);
  });
});
