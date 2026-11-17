import { hasTemplate } from "../../../../common/string/has-template";
import { parseClock, WEEKDAYS } from "../tools/simulate";
import { replayTriggers, stateAt } from "../tools/replay";
import type { ReplayWindow, Timelines, TriggerReplay } from "../tools/replay";
import {
  asList,
  configParts,
  expandCondition,
  isRec,
  str,
  triggerType,
} from "../tools/step-model";
import type { Rec } from "../tools/step-model";

/**
 * Replays recorded history against an automation and works out, for every
 * moment a trigger would have fired, whether the conditions would have let the
 * run through. Everything here is pure: no action is ever called and no
 * request is made. Whatever cannot be decided from recorded history alone is
 * marked "cannot tell" and is never guessed.
 */

export const DAY_MS = 24 * 3600 * 1000;
/** The longest stretch one replay reads. */
export const MAX_PERIOD_MS = 7 * DAY_MS;
/** The most firings that are listed. */
export const MAX_FIRINGS = 500;
/** The most moments one time pattern trigger may produce before it is dropped. */
const MAX_PATTERN_MOMENTS = 20000;

export type PeriodKind = "day" | "week" | "custom";

export interface PeriodWindow extends ReplayWindow {
  /** True when a custom stretch was cut down to fit the limits. */
  clamped: boolean;
}

/**
 * The stretch of history for a period choice. The end never lies in the future
 * and the stretch never exceeds seven days. A custom stretch that is empty or
 * reversed gives undefined.
 */
export const periodWindow = (
  kind: PeriodKind,
  now: number,
  custom?: { start: number; end: number }
): PeriodWindow | undefined => {
  if (kind === "day") {
    return { start: now - DAY_MS, end: now, clamped: false };
  }
  if (kind === "week") {
    return { start: now - MAX_PERIOD_MS, end: now, clamped: false };
  }
  if (!custom) {
    return undefined;
  }
  const end = Math.min(custom.end, now);
  if (!(end > custom.start)) {
    return undefined;
  }
  const start = Math.max(custom.start, end - MAX_PERIOD_MS);
  return {
    start,
    end,
    clamped: start !== custom.start || end !== custom.end,
  };
};

// ---------------------------------------------------------------------------
// Triggers that need more than the shared replay offers
// ---------------------------------------------------------------------------

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const stringList = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const list = asList(value);
  return list.every((v) => typeof v === "string" || typeof v === "number")
    ? list.map(String)
    : undefined;
};

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

/** Values a time pattern field matches inside 0..max, or undefined if odd. */
const expandPattern = (value: unknown, max: number): number[] | undefined => {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string") {
    return undefined;
  }
  const all = Array.from({ length: max + 1 }, (_, i) => i);
  if (text.trim() === "*") {
    return all;
  }
  const step = /^\/(\d+)$/.exec(text.trim());
  if (step) {
    const k = Number(step[1]);
    return k > 0 ? all.filter((i) => i % k === 0) : undefined;
  }
  if (/^\d+$/.test(text.trim())) {
    const n = Number(text.trim());
    return n <= max ? [n] : undefined;
  }
  return undefined;
};

const replayTimePattern = (
  path: string,
  trigger: Rec,
  window: ReplayWindow
): TriggerReplay => {
  const type = "time_pattern";
  const given = (key: string) =>
    trigger[key] !== undefined && trigger[key] !== null && trigger[key] !== "";
  const hasHours = given("hours");
  const hasMinutes = given("minutes");
  const hours = expandPattern(hasHours ? trigger.hours : "*", 23);
  // A field left out means "every" only when no larger field is named; after
  // that it means "at zero", as the instance reads it.
  const minutes = expandPattern(
    hasMinutes ? trigger.minutes : hasHours ? 0 : "*",
    59
  );
  const seconds = expandPattern(
    given("seconds") ? trigger.seconds : hasHours || hasMinutes ? 0 : "*",
    59
  );
  if (!hours || !minutes || !seconds) {
    return unsupported(path, type, "pattern");
  }
  const perDay = hours.length * minutes.length * seconds.length;
  const days = Math.ceil((window.end - window.start) / DAY_MS) + 1;
  if (perDay * days > MAX_PATTERN_MOMENTS) {
    return unsupported(path, type, "too_often");
  }
  const firings: number[] = [];
  const day = new Date(window.start);
  day.setHours(0, 0, 0, 0);
  while (day.getTime() <= window.end) {
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          const moment = new Date(day);
          moment.setHours(h, m, s, 0);
          const t = moment.getTime();
          if (t >= window.start && t <= window.end) {
            firings.push(t);
          }
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return { path, type, status: "replayed", firings };
};

const replayZone = (
  path: string,
  trigger: Rec,
  timelines: Timelines,
  zoneNames: Record<string, string>
): TriggerReplay => {
  const type = "zone";
  const entities = stringList(trigger.entity_id);
  const zone = str(trigger.zone);
  const event = str(trigger.event);
  if (
    !entities?.length ||
    entities.some((id) => !ENTITY_ID.test(id)) ||
    !zone ||
    (event !== "enter" && event !== "leave")
  ) {
    return unsupported(path, type, "entity");
  }
  const name = zoneName(zone, zoneNames);
  if (name === undefined) {
    return unsupported(path, type, `zone:${zone}`);
  }
  const firings: number[] = [];
  for (const entityId of entities) {
    const points = timelines[entityId];
    if (!points) {
      return unsupported(path, type, `history:${entityId}`);
    }
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1].state;
      const to = points[i].state;
      if (from === to) {
        continue;
      }
      if (
        (event === "enter" && to === name) ||
        (event === "leave" && from === name)
      ) {
        firings.push(points[i].t);
      }
    }
  }
  return { path, type, status: "replayed", firings };
};

/** The state a person or tracker has while inside a zone. */
const zoneName = (
  zone: string,
  zoneNames: Record<string, string>
): string | undefined =>
  zone === "zone.home" ? (zoneNames[zone] ?? "home") : zoneNames[zone];

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** A value that was seen while a condition was being decided. */
export interface Seen {
  entityId?: string;
  value: string;
}

export interface ConditionLeaf {
  /** Position in the config, such as "1" or "1/0" for a child of and, or, not. */
  path: string;
  type: string;
  seen?: Seen;
  /** Why it cannot be told, when it cannot. */
  reason?: string;
}

type Tri = "pass" | "fail" | "unknown";

interface Node {
  result: Tri;
  /** The first condition that failed, when the result is a fail. */
  failed?: ConditionLeaf;
  /** The first condition that cannot be told, when nothing failed. */
  unknown?: ConditionLeaf;
  /** The first condition that passed, so a "not" can name what stopped it. */
  passed?: ConditionLeaf;
}

interface EvalContext {
  timelines: Timelines;
  zoneNames: Record<string, string>;
  t: number;
  triggerId: string;
}

const leafResult = (
  result: Tri,
  path: string,
  type: string,
  seen?: Seen,
  reason?: string
): Node => {
  const leaf: ConditionLeaf = { path, type };
  if (seen) {
    leaf.seen = seen;
  }
  if (reason) {
    leaf.reason = reason;
  }
  return result === "fail"
    ? { result, failed: leaf }
    : result === "unknown"
      ? { result, unknown: leaf }
      : { result, passed: leaf };
};

const cannot = (path: string, type: string, reason: string): Node =>
  leafResult("unknown", path, type, undefined, reason);

const evalState = (c: Rec, path: string, ctx: EvalContext): Node => {
  const type = "state";
  if (c.attribute !== undefined) {
    return cannot(path, type, "attribute");
  }
  const ids = stringList(c.entity_id);
  const wanted = stringList(c.state);
  if (!ids?.length || !wanted?.length) {
    return cannot(path, type, "entity");
  }
  if (wanted.some((w) => hasTemplate(w) || /^[a-z_]+\.\w+$/.test(w))) {
    return cannot(path, type, "template");
  }
  const hold = c.for === undefined ? undefined : holdSeconds(c.for);
  if (c.for !== undefined && hold === undefined) {
    return cannot(path, type, "for");
  }
  const matches: boolean[] = [];
  let firstSeen: Seen | undefined;
  let failSeen: Seen | undefined;
  for (const id of ids) {
    const points = ctx.timelines[id];
    const current = stateAt(ctx.timelines, id, ctx.t);
    if (!points || current === undefined) {
      return cannot(path, type, `history:${id}`);
    }
    const seen = { entityId: id, value: current };
    firstSeen ??= seen;
    let ok = wanted.includes(current);
    if (ok && hold !== undefined) {
      const held = heldSince(points, ctx.t);
      if (held.fromStart && ctx.t - held.since < hold * 1000) {
        return cannot(path, type, "history_short");
      }
      ok = ctx.t - held.since >= hold * 1000;
    }
    if (!ok) {
      failSeen ??= seen;
    }
    matches.push(ok);
  }
  const passed =
    c.match === "any" ? matches.some(Boolean) : matches.every(Boolean);
  return leafResult(
    passed ? "pass" : "fail",
    path,
    type,
    passed ? firstSeen : (failSeen ?? firstSeen)
  );
};

const holdSeconds = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value >= 0 ? value : undefined;
  }
  if (typeof value === "string" && !hasTemplate(value)) {
    return /^\d+(\.\d+)?$/.test(value.trim())
      ? Number(value)
      : parseClock(value);
  }
  if (isRec(value)) {
    const units: [string, number][] = [
      ["days", 86400],
      ["hours", 3600],
      ["minutes", 60],
      ["seconds", 1],
    ];
    let total = 0;
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

/** When the state at a moment began, and whether that is only the first record. */
const heldSince = (
  points: Timelines[string],
  t: number
): { since: number; fromStart: boolean } => {
  let index = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].t > t) {
      break;
    }
    index = i;
  }
  let j = Math.max(index, 0);
  while (j > 0 && points[j - 1].state === points[index].state) {
    j--;
  }
  return { since: points[j].t, fromStart: j === 0 };
};

const evalNumeric = (c: Rec, path: string, ctx: EvalContext): Node => {
  const type = "numeric_state";
  if (
    c.attribute !== undefined ||
    c.value_template !== undefined ||
    c.for !== undefined
  ) {
    return cannot(path, type, "attribute");
  }
  const ids = stringList(c.entity_id);
  if (!ids?.length) {
    return cannot(path, type, "entity");
  }
  const bound = (value: unknown): number | undefined | "bad" => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const n = typeof value === "number" ? value : Number(value);
    return Number.isNaN(n) ? "bad" : n;
  };
  const above = bound(c.above);
  const below = bound(c.below);
  if (
    above === "bad" ||
    below === "bad" ||
    (above === undefined && below === undefined)
  ) {
    return cannot(path, type, "bound");
  }
  let firstSeen: Seen | undefined;
  for (const id of ids) {
    const current = stateAt(ctx.timelines, id, ctx.t);
    if (current === undefined) {
      return cannot(path, type, `history:${id}`);
    }
    const value = Number(current);
    if (current === "" || Number.isNaN(value)) {
      return cannot(path, type, `not_numeric:${id}`);
    }
    const seen = { entityId: id, value: current };
    firstSeen ??= seen;
    if (
      (above !== undefined && !(value > above)) ||
      (below !== undefined && !(value < below))
    ) {
      return leafResult("fail", path, type, seen);
    }
  }
  return leafResult("pass", path, type, firstSeen);
};

const pad = (n: number) => String(n).padStart(2, "0");

export const clockText = (t: number): string => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const secondsOfDay = (t: number): number => {
  const d = new Date(t);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

const evalTime = (c: Rec, path: string, ctx: EvalContext): Node => {
  const type = "time";
  const parse = (v: unknown): number | undefined | "bad" => {
    if (v === undefined || v === null || v === "") {
      return undefined;
    }
    const s = parseClock(v);
    return s === undefined ? "bad" : s;
  };
  const after = parse(c.after);
  const before = parse(c.before);
  if (after === "bad" || before === "bad") {
    return cannot(path, type, "time_entity");
  }
  const seen = { value: clockText(ctx.t) };
  const weekdays = c.weekday === undefined ? undefined : stringList(c.weekday);
  if (weekdays && !weekdays.includes(WEEKDAYS[new Date(ctx.t).getDay()])) {
    return leafResult("fail", path, type, {
      value: WEEKDAYS[new Date(ctx.t).getDay()],
    });
  }
  const now = secondsOfDay(ctx.t);
  let ok = true;
  if (after !== undefined && before !== undefined) {
    ok =
      after < before
        ? now >= after && now < before
        : now >= after || now < before;
  } else if (after !== undefined) {
    ok = now >= after;
  } else if (before !== undefined) {
    ok = now < before;
  }
  return leafResult(ok ? "pass" : "fail", path, type, seen);
};

/** The moment a sun event happened on the local day of a moment, from history. */
const sunEventTime = (
  timelines: Timelines,
  event: "sunrise" | "sunset",
  t: number
): number | undefined => {
  const points = timelines["sun.sun"];
  if (!points) {
    return undefined;
  }
  const wanted = event === "sunrise" ? "above_horizon" : "below_horizon";
  const day = new Date(t);
  day.setHours(0, 0, 0, 0);
  const from = day.getTime();
  const to = from + DAY_MS;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i].state === wanted &&
      points[i - 1].state !== wanted &&
      points[i].t >= from &&
      points[i].t < to
    ) {
      return points[i].t;
    }
  }
  return undefined;
};

const evalSun = (c: Rec, path: string, ctx: EvalContext): Node => {
  const type = "sun";
  const offset = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return value;
    }
    if (typeof value !== "string") {
      return undefined;
    }
    const negative = value.trim().startsWith("-");
    const s = holdSeconds(value.trim().replace(/^[-+]/, ""));
    return s === undefined ? undefined : negative ? -s : s;
  };
  const after = str(c.after);
  const before = str(c.before);
  const isEvent = (v: string | undefined): v is "sunrise" | "sunset" =>
    v === "sunrise" || v === "sunset";
  const afterOffset = offset(c.after_offset);
  const beforeOffset = offset(c.before_offset);
  if (
    (!after && !before) ||
    (after && !isEvent(after)) ||
    (before && !isEvent(before)) ||
    afterOffset === undefined ||
    beforeOffset === undefined
  ) {
    return cannot(path, type, "event");
  }
  let afterOk: boolean | undefined;
  let beforeOk: boolean | undefined;
  let seen: Seen | undefined;
  if (after && isEvent(after)) {
    const at = sunEventTime(ctx.timelines, after, ctx.t);
    if (at === undefined) {
      return cannot(path, type, "sun_time");
    }
    afterOk = ctx.t >= at + afterOffset * 1000;
    seen = { entityId: "sun.sun", value: `${after} ${clockText(at)}` };
  }
  if (before && isEvent(before)) {
    const at = sunEventTime(ctx.timelines, before, ctx.t);
    if (at === undefined) {
      return cannot(path, type, "sun_time");
    }
    beforeOk = ctx.t <= at + beforeOffset * 1000;
    seen ??= { entityId: "sun.sun", value: `${before} ${clockText(at)}` };
  }
  // After sunset and before sunrise describes the night, which spans midnight.
  const night = after === "sunset" && before === "sunrise";
  const ok = night
    ? Boolean(afterOk) || Boolean(beforeOk)
    : (afterOk ?? true) && (beforeOk ?? true);
  return leafResult(ok ? "pass" : "fail", path, type, seen);
};

const evalZone = (c: Rec, path: string, ctx: EvalContext): Node => {
  const type = "zone";
  const ids = stringList(c.entity_id);
  const zones = stringList(c.zone);
  if (!ids?.length || !zones?.length) {
    return cannot(path, type, "entity");
  }
  const names = zones.map((z) => zoneName(z, ctx.zoneNames));
  if (names.some((n) => n === undefined)) {
    return cannot(path, type, `zone:${zones[names.indexOf(undefined)]}`);
  }
  let firstSeen: Seen | undefined;
  for (const id of ids) {
    const current = stateAt(ctx.timelines, id, ctx.t);
    if (current === undefined) {
      return cannot(path, type, `history:${id}`);
    }
    const seen = { entityId: id, value: current };
    firstSeen ??= seen;
    if (!names.includes(current)) {
      return leafResult("fail", path, type, seen);
    }
  }
  return leafResult("pass", path, type, firstSeen);
};

const evalTrigger = (c: Rec, path: string, ctx: EvalContext): Node => {
  const ids = stringList(c.id);
  if (!ids) {
    return cannot(path, "trigger", "trigger_id");
  }
  return leafResult(
    ids.includes(ctx.triggerId) ? "pass" : "fail",
    path,
    "trigger",
    { value: ctx.triggerId }
  );
};

const evalCondition = (raw: unknown, path: string, ctx: EvalContext): Node => {
  const c = expandCondition(raw);
  if (c.enabled === false) {
    return { result: "pass" };
  }
  const type = str(c.condition) ?? "unknown";
  switch (type) {
    case "state":
      return evalState(c, path, ctx);
    case "numeric_state":
      return evalNumeric(c, path, ctx);
    case "time":
      return evalTime(c, path, ctx);
    case "sun":
      return evalSun(c, path, ctx);
    case "zone":
      return evalZone(c, path, ctx);
    case "trigger":
      return evalTrigger(c, path, ctx);
    case "and":
    case "or":
    case "not": {
      const children = asList(c.conditions).map((child, i) =>
        evalCondition(child, `${path}/${i}`, ctx)
      );
      return combine(type, children);
    }
    default:
      return cannot(path, type, `kind:${type}`);
  }
};

const combine = (type: "and" | "or" | "not", parts: Node[]): Node => {
  const firstFail = parts.find((p) => p.result === "fail");
  const firstUnknown = parts.find((p) => p.result === "unknown");
  const firstPass = parts.find((p) => p.result === "pass");
  const unknown = firstUnknown ? { unknown: firstUnknown.unknown } : {};
  if (type === "and") {
    if (firstFail) {
      return { result: "fail", failed: firstFail.failed };
    }
    return firstUnknown
      ? { result: "unknown", ...unknown }
      : { result: "pass", passed: firstPass?.passed };
  }
  if (type === "or") {
    if (firstPass) {
      return { result: "pass", passed: firstPass.passed };
    }
    if (firstUnknown) {
      return { result: "unknown", ...unknown };
    }
    return { result: "fail", failed: firstFail?.failed };
  }
  // not: stops when any listed condition holds
  if (firstPass) {
    return { result: "fail", failed: firstPass.passed };
  }
  return firstUnknown ? { result: "unknown", ...unknown } : { result: "pass" };
};

/** The condition a path points at, for describing it. */
export const conditionAtPath = (
  config: unknown,
  path: string
): Rec | undefined => {
  const [first, ...rest] = path.split("/").map(Number);
  let current: unknown = configParts(config).conditions[first];
  for (const index of rest) {
    const children = asList(expandCondition(current).conditions);
    current = children[index];
  }
  return current === undefined ? undefined : expandCondition(current);
};

// ---------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------

export type FiringOutcome = "would_run" | "stopped" | "cannot_tell";

export interface DryRunFiring {
  time: number;
  triggerPath: string;
  triggerType: string;
  /** The value of the entity the trigger watches at that moment, if any. */
  because?: Seen;
  outcome: FiringOutcome;
  /** The condition that stopped the run, with the value that was seen. */
  stoppedBy?: ConditionLeaf;
  /** The first condition that could not be told, when the outcome is that. */
  unknownAt?: ConditionLeaf;
}

export interface DryRunReplayResult {
  window: ReplayWindow;
  triggers: TriggerReplay[];
  /** At most MAX_FIRINGS firings in time order. */
  firings: DryRunFiring[];
  /** How many firings there were before the cap. */
  total: number;
  truncated: boolean;
  counts: Record<FiringOutcome, number>;
  /** Named entities with no recorded history in the stretch. */
  missingHistory: string[];
}

/** The entity a trigger watches, for the "why it fired" value. */
const watchedEntity = (trigger: Rec, type: string): string | undefined =>
  type === "sun" ? "sun.sun" : stringList(trigger.entity_id)?.[0];

/**
 * Works out every firing in a stretch of history and, for each, whether the
 * conditions would have passed. `zoneNames` maps a zone entity id to the state
 * a person has inside it (its name).
 */
export const replayDryRun = (
  config: unknown,
  timelines: Timelines,
  window: ReplayWindow,
  zoneNames: Record<string, string> = {},
  missingHistory: string[] = []
): DryRunReplayResult => {
  const parts = configParts(config);
  const triggers = replayTriggers(config, timelines, window).map((replay) => {
    if (replay.status !== "unsupported") {
      return replay;
    }
    const trigger = parts.triggers[Number(replay.path.split("/")[1])];
    let better: TriggerReplay | undefined;
    if (replay.type === "time_pattern") {
      better = replayTimePattern(replay.path, trigger, window);
    } else if (replay.type === "zone") {
      better = replayZone(replay.path, trigger, timelines, zoneNames);
    }
    if (!better) {
      return replay;
    }
    better.firings = better.firings
      .filter((t) => t >= window.start && t <= window.end)
      .sort((a, b) => a - b);
    return better;
  });
  const all = triggers
    .flatMap((trigger) =>
      trigger.firings.map((time) => ({ time, path: trigger.path }))
    )
    .sort((a, b) => a.time - b.time);
  const chosen = all.slice(0, MAX_FIRINGS);
  const counts: Record<FiringOutcome, number> = {
    would_run: 0,
    stopped: 0,
    cannot_tell: 0,
  };
  const firings = chosen.map(({ time, path }): DryRunFiring => {
    const index = Number(path.split("/")[1]);
    const trigger = parts.triggers[index];
    const type = triggerType(trigger);
    const ctx: EvalContext = {
      timelines,
      zoneNames,
      t: time,
      triggerId: str(trigger.id) ?? String(index),
    };
    const node = combine(
      "and",
      parts.conditions.map((condition, i) =>
        evalCondition(condition, String(i), ctx)
      )
    );
    const entityId = watchedEntity(trigger, type);
    const value = entityId ? stateAt(timelines, entityId, time) : undefined;
    const firing: DryRunFiring = {
      time,
      triggerPath: path,
      triggerType: type,
      outcome:
        node.result === "fail"
          ? "stopped"
          : node.result === "unknown"
            ? "cannot_tell"
            : "would_run",
    };
    if (entityId && value !== undefined) {
      firing.because = { entityId, value };
    }
    if (node.failed) {
      firing.stoppedBy = node.failed;
    }
    if (node.result === "unknown" && node.unknown) {
      firing.unknownAt = node.unknown;
    }
    counts[firing.outcome]++;
    return firing;
  });
  return {
    window,
    triggers,
    firings,
    total: all.length,
    truncated: all.length > chosen.length,
    counts,
    missingHistory,
  };
};
