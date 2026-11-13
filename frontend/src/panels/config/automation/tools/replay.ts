import { hasTemplate } from "../../../../common/string/has-template";
import type { HistoryStates } from "../../../../data/history";
import type { ManualAutomationConfig } from "../../../../data/automation";
import type { HomeAssistant } from "../../../../types";
import type { DryRunConditions } from "../automation-dry-run";
import { dryRunAutomation } from "../automation-dry-run";
import { buildPathIndex, outcomesOf } from "./test-cases";
import type { PathIndex } from "./test-cases";
import { buildSimulationHass, parseClock, WEEKDAYS } from "./simulate";
import { asList, configParts, isRec, str, triggerType } from "./step-model";
import type { Rec } from "./step-model";

/**
 * Replays a recorded stretch of history against an automation: the state
 * changes the instance returned are walked in time order, the triggers that can
 * be decided from those changes are evaluated, and every time one would have
 * fired the automation is dry run against the states of that moment. Nothing is
 * executed. Triggers of a kind that cannot be replayed from state history are
 * listed as such and never guessed.
 */

export interface HistoryPoint {
  /** Milliseconds since the epoch. */
  t: number;
  state: string;
}

export type Timelines = Record<string, HistoryPoint[]>;

export interface ReplayWindow {
  start: number;
  end: number;
}

/** The longest stretch the replay reads, as the instance's history is. */
export const MAX_WINDOW_MS = 24 * 3600 * 1000;
export const MAX_FIRINGS = 200;
export const MAX_ENTITIES = 100;

export const timelinesFrom = (history: HistoryStates): Timelines => {
  const out: Timelines = {};
  for (const [entityId, entries] of Object.entries(history)) {
    out[entityId] = entries
      .map((entry) => ({ t: entry.lu * 1000, state: String(entry.s) }))
      .sort((a, b) => a.t - b.t);
  }
  return out;
};

/** The state an entity had at a moment, or undefined before its first record. */
export const stateAt = (
  timelines: Timelines,
  entityId: string,
  t: number
): string | undefined => {
  const points = timelines[entityId];
  if (!points) {
    return undefined;
  }
  let found: string | undefined;
  for (const point of points) {
    if (point.t > t) {
      break;
    }
    found = point.state;
  }
  return found;
};

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Entity ids named anywhere in a configuration, in first seen order. */
export const referencedEntities = (config: unknown): string[] => {
  const found = new Set<string>();
  const take = (value: unknown) => {
    for (const v of asList(value)) {
      if (typeof v === "string" && ENTITY_ID.test(v)) {
        found.add(v);
      }
    }
  };
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (isRec(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === "entity_id") {
          take(value);
        } else {
          walk(value);
        }
      }
    }
  };
  walk(config);
  return [...found];
};

/** Seconds in a duration written as a number, `HH:MM:SS` or a dictionary. */
export const durationSeconds = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value >= 0 ? value : undefined;
  }
  if (typeof value === "string") {
    if (hasTemplate(value)) {
      return undefined;
    }
    if (/^\d+(\.\d+)?$/.test(value.trim())) {
      return Number(value);
    }
    const clock = parseClock(value);
    return clock;
  }
  if (isRec(value)) {
    let total = 0;
    const units: [string, number][] = [
      ["days", 86400],
      ["hours", 3600],
      ["minutes", 60],
      ["seconds", 1],
      ["milliseconds", 0.001],
    ];
    for (const [unit, factor] of units) {
      const v = value[unit];
      if (v === undefined || v === null || v === "") {
        continue;
      }
      const n = Number(v);
      if (Number.isNaN(n)) {
        return undefined;
      }
      total += n * factor;
    }
    return total;
  }
  return undefined;
};

/** A signed offset such as `-00:30:00`, a number of seconds, or none. */
const offsetSeconds = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const negative = value.trim().startsWith("-");
    const seconds = durationSeconds(value.trim().replace(/^[-+]/, ""));
    return seconds === undefined ? undefined : negative ? -seconds : seconds;
  }
  return undefined;
};

export type TriggerReplayStatus = "replayed" | "unsupported" | "disabled";

export interface TriggerReplay {
  path: string;
  type: string;
  status: TriggerReplayStatus;
  /** Why a trigger cannot be replayed. */
  reason?: string;
  /** Moments the trigger would have fired, in milliseconds. */
  firings: number[];
}

const unsupported = (
  path: string,
  type: string,
  reason: string
): TriggerReplay => ({
  path,
  type,
  status: "unsupported",
  reason,
  firings: [],
});

/** The points where the state really changed, as pairs of old and new state. */
const stateChanges = (points: HistoryPoint[]) => {
  const out: { t: number; from: string; to: string; next?: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].state !== points[i - 1].state) {
      out.push({
        t: points[i].t,
        from: points[i - 1].state,
        to: points[i].state,
      });
    }
  }
  // The moment each state ended, for triggers that wait.
  out.forEach((change, i) => {
    change.next = out[i + 1]?.t;
  });
  return out;
};

const stringList = (value: unknown): string[] | undefined =>
  value === undefined
    ? undefined
    : asList(value).every((v) => typeof v === "string" || typeof v === "number")
      ? asList(value).map(String)
      : undefined;

const replayState = (
  path: string,
  trigger: Rec,
  timelines: Timelines,
  window: ReplayWindow
): TriggerReplay => {
  const type = "state";
  if (trigger.attribute !== undefined || trigger.to === null) {
    return unsupported(path, type, "attribute");
  }
  const entities = stringList(trigger.entity_id);
  if (!entities?.length || entities.some((id) => !ENTITY_ID.test(id))) {
    return unsupported(path, type, "entity");
  }
  const from = stringList(trigger.from);
  const to = stringList(trigger.to);
  const notFrom = stringList(trigger.not_from);
  const notTo = stringList(trigger.not_to);
  if (
    [trigger.from, trigger.to, trigger.not_from, trigger.not_to].some((v) =>
      asList(v).some((x) => typeof x === "string" && hasTemplate(x))
    )
  ) {
    return unsupported(path, type, "template");
  }
  const hold =
    trigger.for === undefined ? undefined : durationSeconds(trigger.for);
  if (trigger.for !== undefined && hold === undefined) {
    return unsupported(path, type, "for");
  }
  const firings: number[] = [];
  for (const entityId of entities) {
    const points = timelines[entityId];
    if (!points) {
      return unsupported(path, type, `history:${entityId}`);
    }
    for (const change of stateChanges(points)) {
      if (
        (from && !from.includes(change.from)) ||
        (to && !to.includes(change.to)) ||
        (notFrom && notFrom.includes(change.from)) ||
        (notTo && notTo.includes(change.to))
      ) {
        continue;
      }
      if (hold === undefined) {
        firings.push(change.t);
      } else {
        const at = change.t + hold * 1000;
        if (at <= (change.next ?? window.end)) {
          firings.push(at);
        }
      }
    }
  }
  return { path, type, status: "replayed", firings };
};

const replayNumeric = (
  path: string,
  trigger: Rec,
  timelines: Timelines,
  window: ReplayWindow
): TriggerReplay => {
  const type = "numeric_state";
  if (trigger.attribute !== undefined || trigger.value_template !== undefined) {
    return unsupported(path, type, "attribute");
  }
  const entities = stringList(trigger.entity_id);
  if (!entities?.length) {
    return unsupported(path, type, "entity");
  }
  const bound = (value: unknown): number | undefined | "bad" => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const n = typeof value === "number" ? value : Number(value);
    return Number.isNaN(n) ? "bad" : n;
  };
  const above = bound(trigger.above);
  const below = bound(trigger.below);
  if (above === "bad" || below === "bad") {
    return unsupported(path, type, "bound");
  }
  if (above === undefined && below === undefined) {
    return unsupported(path, type, "bound");
  }
  const hold =
    trigger.for === undefined ? undefined : durationSeconds(trigger.for);
  if (trigger.for !== undefined && hold === undefined) {
    return unsupported(path, type, "for");
  }
  const inRange = (state: string) => {
    const v = Number(state);
    if (state === "" || Number.isNaN(v)) {
      return false;
    }
    return (
      (above === undefined || v > above) && (below === undefined || v < below)
    );
  };
  const firings: number[] = [];
  for (const entityId of entities) {
    const points = timelines[entityId];
    if (!points) {
      return unsupported(path, type, `history:${entityId}`);
    }
    for (let i = 1; i < points.length; i++) {
      if (inRange(points[i - 1].state) || !inRange(points[i].state)) {
        continue;
      }
      if (hold === undefined) {
        firings.push(points[i].t);
        continue;
      }
      // It has to stay in range for the whole wait.
      let leaves = window.end;
      for (let j = i + 1; j < points.length; j++) {
        if (!inRange(points[j].state)) {
          leaves = points[j].t;
          break;
        }
      }
      const at = points[i].t + hold * 1000;
      if (at <= leaves) {
        firings.push(at);
      }
    }
  }
  return { path, type, status: "replayed", firings };
};

const replayTime = (
  path: string,
  trigger: Rec,
  window: ReplayWindow
): TriggerReplay => {
  const type = "time";
  const times = asList(trigger.at);
  if (!times.length) {
    return unsupported(path, type, "at");
  }
  const seconds: number[] = [];
  for (const at of times) {
    const clock = parseClock(at);
    if (clock === undefined) {
      // An entity such as an input_datetime, or an offset form.
      return unsupported(path, type, "at");
    }
    seconds.push(clock);
  }
  const weekdays =
    trigger.weekday === undefined ? undefined : stringList(trigger.weekday);
  const firings: number[] = [];
  const day = new Date(window.start);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() <= window.end) {
    for (const s of seconds) {
      const moment = new Date(day);
      moment.setHours(0, 0, s, 0);
      const t = moment.getTime();
      if (
        t >= window.start &&
        t <= window.end &&
        (!weekdays || weekdays.includes(WEEKDAYS[moment.getDay()]))
      ) {
        firings.push(t);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return { path, type, status: "replayed", firings };
};

const replaySun = (
  path: string,
  trigger: Rec,
  timelines: Timelines
): TriggerReplay => {
  const type = "sun";
  const event = str(trigger.event);
  const offset = offsetSeconds(trigger.offset);
  if ((event !== "sunrise" && event !== "sunset") || offset === undefined) {
    return unsupported(path, type, "event");
  }
  const points = timelines["sun.sun"];
  if (!points) {
    return unsupported(path, type, "history:sun.sun");
  }
  const wanted = event === "sunrise" ? "above_horizon" : "below_horizon";
  const firings = stateChanges(points)
    .filter((change) => change.to === wanted)
    .map((change) => change.t + offset * 1000);
  return { path, type, status: "replayed", firings };
};

/** Works out when each trigger would have fired in a stretch of history. */
export const replayTriggers = (
  config: unknown,
  timelines: Timelines,
  window: ReplayWindow
): TriggerReplay[] =>
  configParts(config).triggers.map((trigger, index) => {
    const path = `trigger/${index}`;
    const type = triggerType(trigger);
    if (trigger.enabled === false) {
      return { path, type, status: "disabled", firings: [] };
    }
    let replay: TriggerReplay;
    switch (type) {
      case "state":
        replay = replayState(path, trigger, timelines, window);
        break;
      case "numeric_state":
        replay = replayNumeric(path, trigger, timelines, window);
        break;
      case "time":
        replay = replayTime(path, trigger, window);
        break;
      case "sun":
        replay = replaySun(path, trigger, timelines);
        break;
      default:
        replay = unsupported(path, type, `kind:${type}`);
    }
    replay.firings = replay.firings
      .filter((t) => t >= window.start && t <= window.end)
      .sort((a, b) => a - b);
    return replay;
  });

/** Entities whose history a replay needs: the ones named, and the sun. */
export const entitiesToFetch = (config: unknown): string[] => {
  const ids = referencedEntities(config);
  const needsSun = configParts(config).triggers.some(
    (t) => triggerType(t) === "sun"
  );
  if (needsSun && !ids.includes("sun.sun")) {
    ids.push("sun.sun");
  }
  return ids;
};

export type FiringOutcome = "would_run" | "conditions_fail" | "cannot_tell";

export interface ReplayFiring {
  time: number;
  triggerPath: string;
  outcome: FiringOutcome;
  conditions: DryRunConditions;
  /** Branches that would have run, as flow graph paths. */
  branches: string[];
  /** How many steps could not be decided. */
  undecided: number;
}

const outcomeOf = (conditions: DryRunConditions): FiringOutcome =>
  conditions === "fail"
    ? "conditions_fail"
    : conditions === "unknown"
      ? "cannot_tell"
      : "would_run";

/** The states at a moment as overrides of the live ones. */
export const snapshotAt = (timelines: Timelines, t: number) =>
  Object.keys(timelines).flatMap((entityId) => {
    const state = stateAt(timelines, entityId, t);
    return state === undefined ? [] : [{ entityId, state }];
  });

const pad = (n: number) => String(n).padStart(2, "0");

/** Dry runs the automation at one moment against the states of that moment. */
export const evaluateFiring = async (
  hass: Pick<HomeAssistant, "states" | "callWS">,
  config: ManualAutomationConfig,
  index: PathIndex,
  timelines: Timelines,
  triggerPath: string,
  time: number
): Promise<ReplayFiring> => {
  const date = new Date(time);
  const simulated = buildSimulationHass(hass.states, {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    weekday: date.getDay(),
    overrides: snapshotAt(timelines, time),
  });
  const result = await dryRunAutomation(simulated, {
    conditions: config.conditions ?? config.condition ?? [],
    actions: config.actions ?? config.action ?? [],
  });
  const outcomes = outcomesOf(index, result);
  const branches = index.items
    .filter((item) => item.kind === "branch")
    .filter((item) => outcomes[item.path]?.verdict === "would_run")
    .map((item) => item.path);
  return {
    time,
    triggerPath,
    outcome: outcomeOf(result.conditions),
    conditions: result.conditions,
    branches,
    undecided: result.counts.cannot_tell,
  };
};

export interface ReplayResult {
  triggers: TriggerReplay[];
  firings: ReplayFiring[];
  /** True when more firings were found than are evaluated. */
  truncated: boolean;
  /** Named entities without recorded history, read at their current state. */
  usedLive: string[];
}

/** Replays a day: finds every firing, then evaluates each in time order. */
export const replayDay = async (
  hass: Pick<HomeAssistant, "states" | "callWS">,
  config: ManualAutomationConfig,
  timelines: Timelines,
  window: ReplayWindow
): Promise<ReplayResult> => {
  const triggers = replayTriggers(config, timelines, window);
  const all = triggers
    .flatMap((trigger) =>
      trigger.firings.map((time) => ({ time, path: trigger.path }))
    )
    .sort((a, b) => a.time - b.time);
  const chosen = all.slice(0, MAX_FIRINGS);
  const index = buildPathIndex(config);
  const firings = await Promise.all(
    chosen.map((item) =>
      evaluateFiring(hass, config, index, timelines, item.path, item.time)
    )
  );
  return {
    triggers,
    firings,
    truncated: all.length > chosen.length,
    usedLive: referencedEntities(config).filter((id) => !timelines[id]),
  };
};
