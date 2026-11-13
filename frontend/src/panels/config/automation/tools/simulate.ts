import type { HassEntities } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../../../types";
import { asList, isRec } from "./step-model";
import type { Rec } from "./step-model";

/**
 * Simulation of an automation against a situation the user enters. It reuses
 * the editor's dry run: the dry run only reads states and never calls a
 * service, and here it reads a copy of the states with the user's values on
 * top. Conditions the simulation can decide on its own are time, weekday and
 * zone conditions; every other kind it cannot decide is reported as unknown
 * with its name, never guessed.
 */

export interface Situation {
  /** States that replace or extend the live ones. */
  overrides: { entityId: string; state: string }[];
  /** The time of day to use for time conditions, as HH:MM. */
  time: string;
  /** 0 is Sunday, as in a JavaScript date. Undefined when not set. */
  weekday?: number;
}

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const parseClock = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) {
    return undefined;
  }
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return undefined;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

export const UNSUPPORTED_PREFIX = "unsupported:";

const unsupported = (what: string) => new Error(`${UNSUPPORTED_PREFIX}${what}`);

const resolveClock = (
  value: unknown,
  states: HassEntities
): number | undefined => {
  const direct = parseClock(value);
  if (direct !== undefined) {
    return direct;
  }
  // An input_datetime or time entity named instead of a time.
  if (typeof value === "string" && states[value]) {
    return parseClock(states[value].state);
  }
  return undefined;
};

/** Decides a time condition, or throws when it cannot be decided here. */
export const evaluateTime = (
  cond: Rec,
  situation: Situation,
  states: HassEntities
): boolean => {
  const now = parseClock(`${situation.time}:00`);
  if (now === undefined) {
    throw unsupported("time");
  }
  let result = true;
  if (cond.weekday !== undefined) {
    if (situation.weekday === undefined) {
      throw unsupported("weekday");
    }
    result = asList(cond.weekday).includes(WEEKDAYS[situation.weekday]);
  }
  const after =
    cond.after === undefined ? undefined : resolveClock(cond.after, states);
  const before =
    cond.before === undefined ? undefined : resolveClock(cond.before, states);
  if (
    (cond.after !== undefined && after === undefined) ||
    (cond.before !== undefined && before === undefined)
  ) {
    // A sun event or an unreadable value.
    throw unsupported("time_reference");
  }
  if (after !== undefined && before !== undefined) {
    const inWindow =
      after <= before
        ? now >= after && now < before
        : now >= after || now < before;
    result = result && inWindow;
  } else if (after !== undefined) {
    result = result && now >= after;
  } else if (before !== undefined) {
    result = result && now < before;
  }
  return result;
};

export const evaluateZone = (cond: Rec, states: HassEntities): boolean => {
  const zoneId = typeof cond.zone === "string" ? cond.zone : undefined;
  const entities = asList(cond.entity_id);
  if (!zoneId || !entities.length) {
    throw unsupported("zone");
  }
  const zoneState = states[zoneId];
  const expected =
    zoneId === "zone.home"
      ? "home"
      : (zoneState?.attributes?.friendly_name as string | undefined);
  if (!expected) {
    throw unsupported("zone");
  }
  return entities.every((id) => {
    const s = typeof id === "string" ? states[id] : undefined;
    if (!s) {
      throw unsupported("zone");
    }
    return s.state === expected;
  });
};

/** A copy of the live states with the situation on top. */
export const overlayStates = (
  live: HassEntities,
  situation: Situation
): HassEntities => {
  const states: HassEntities = { ...live };
  for (const { entityId, state } of situation.overrides) {
    if (!entityId) {
      continue;
    }
    const base = states[entityId];
    states[entityId] = base
      ? { ...base, state }
      : ({
          entity_id: entityId,
          state,
          attributes: {},
          last_changed: "",
          last_updated: "",
          context: { id: "", parent_id: null, user_id: null },
        } as HassEntities[string]);
  }
  return states;
};

/**
 * A stand-in for the instance that dry run can read. Its `callWS` answers the
 * test_condition request from the situation and rejects every other request,
 * so nothing is ever sent to the server.
 */
export const buildSimulationHass = (
  live: HassEntities,
  situation: Situation
): Pick<HomeAssistant, "states" | "callWS"> => {
  const states = overlayStates(live, situation);
  const callWS = (async (msg: { type: string; condition?: unknown }) => {
    if (msg.type !== "test_condition" || !isRec(msg.condition)) {
      throw new Error("not available in a simulation");
    }
    const cond = msg.condition;
    switch (cond.condition) {
      case "time":
        return { result: evaluateTime(cond, situation, states) };
      case "zone":
        return { result: evaluateZone(cond, states) };
      default:
        throw unsupported(String(cond.condition ?? "unknown"));
    }
  }) as unknown as HomeAssistant["callWS"];
  return { states, callWS };
};
