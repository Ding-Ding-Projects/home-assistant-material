import type { Rec } from "./step-model";
import {
  actionKind,
  asList,
  configParts,
  conditionType,
  entityIdsOf,
  expandCondition,
  isRec,
  serviceOf,
  str,
  triggerType,
} from "./step-model";

/**
 * Reads an automation configuration as plain sentences, with rule-based text
 * built on this device. Every sentence comes from a translation key, so it
 * follows the interface language. Kinds it does not know get a neutral
 * sentence that names the kind rather than a guess.
 */

export type Translate = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface LanguageContext {
  t: Translate;
  /** The friendly name for an entity id, or the id itself. */
  name: (entityId: string) => string;
}

export interface Line {
  role: "when" | "if" | "then" | "otherwise";
  text: string;
  depth: number;
}

const K = "s.";

const list = (ctx: LanguageContext, items: string[]): string => {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return ctx.t(`${K}and_list`, {
    head: items.slice(0, -1).join(", "),
    last: items[items.length - 1],
  });
};

const names = (ctx: LanguageContext, fragment: unknown): string =>
  list(ctx, entityIdsOf(fragment).map(ctx.name)) || ctx.t(`${K}something`);

const toText = (value: unknown): string =>
  typeof value === "number" || typeof value === "string" ? String(value) : "";

const duration = (value: unknown): string => {
  if (isRec(value)) {
    const part = (k: string, unit: string) =>
      value[k] ? `${value[k]} ${unit}` : "";
    return [part("hours", "h"), part("minutes", "min"), part("seconds", "s")]
      .filter(Boolean)
      .join(" ");
  }
  return toText(value);
};

export const describeTrigger = (trigger: Rec, ctx: LanguageContext): string => {
  const type = triggerType(trigger);
  const who = names(ctx, trigger);
  switch (type) {
    case "state": {
      const to =
        trigger.to === undefined || trigger.to === null
          ? undefined
          : asList(trigger.to).map(String);
      const base = to
        ? ctx.t(`${K}trigger_state_to`, {
            entity: who,
            state: to.join(` ${ctx.t(`${K}or`)} `),
          })
        : ctx.t(`${K}trigger_state_any`, { entity: who });
      return trigger.for
        ? ctx.t(`${K}for_suffix`, {
            text: base,
            duration: duration(trigger.for),
          })
        : base;
    }
    case "numeric_state": {
      const limits = [
        trigger.above !== undefined
          ? ctx.t(`${K}above`, { value: toText(trigger.above) })
          : "",
        trigger.below !== undefined
          ? ctx.t(`${K}below`, { value: toText(trigger.below) })
          : "",
      ].filter(Boolean);
      return ctx.t(`${K}trigger_numeric`, {
        entity: who,
        limits: limits.join(", "),
      });
    }
    case "time":
      return ctx.t(`${K}trigger_time`, {
        time: toText(trigger.at) || ctx.t(`${K}a_set_time`),
      });
    case "time_pattern":
      return ctx.t(`${K}trigger_time_pattern`);
    case "sun":
      return ctx.t(
        `${K}trigger_sun_${trigger.event === "sunrise" ? "sunrise" : "sunset"}`
      );
    case "zone":
      return ctx.t(
        `${K}trigger_zone_${trigger.event === "leave" ? "leave" : "enter"}`,
        {
          entity: who,
          zone: ctx.name(str(trigger.zone) ?? ""),
        }
      );
    case "homeassistant":
      return ctx.t(
        `${K}trigger_homeassistant_${trigger.event === "shutdown" ? "shutdown" : "start"}`
      );
    case "event":
      return ctx.t(`${K}trigger_event`, { event: toText(trigger.event_type) });
    case "template":
      return ctx.t(`${K}trigger_template`);
    default:
      return ctx.t(`${K}trigger_other`, { type });
  }
};

export const describeCondition = (
  raw: unknown,
  ctx: LanguageContext
): string => {
  const cond = expandCondition(raw);
  const type = conditionType(cond);
  const who = names(ctx, cond);
  switch (type) {
    case "state":
      return ctx.t(`${K}condition_state`, {
        entity: who,
        state: asList(cond.state)
          .map(String)
          .join(` ${ctx.t(`${K}or`)} `),
      });
    case "numeric_state": {
      const limits = [
        cond.above !== undefined
          ? ctx.t(`${K}above`, { value: toText(cond.above) })
          : "",
        cond.below !== undefined
          ? ctx.t(`${K}below`, { value: toText(cond.below) })
          : "",
      ].filter(Boolean);
      return ctx.t(`${K}condition_numeric`, {
        entity: who,
        limits: limits.join(", "),
      });
    }
    case "time": {
      const after = toText(cond.after);
      const before = toText(cond.before);
      return ctx.t(`${K}condition_time`, {
        range: [
          after && ctx.t(`${K}after`, { time: after }),
          before && ctx.t(`${K}before`, { time: before }),
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    case "sun":
      return ctx.t(`${K}condition_sun`);
    case "zone":
      return ctx.t(`${K}condition_zone`, {
        entity: who,
        zone: names(ctx, { entity_id: cond.zone }),
      });
    case "template":
      return ctx.t(`${K}condition_template`);
    case "and":
    case "or": {
      const parts = asList(cond.conditions).map((c) =>
        describeCondition(c, ctx)
      );
      return parts.join(` ${ctx.t(type === "and" ? `${K}and` : `${K}or`)} `);
    }
    case "not":
      return ctx.t(`${K}condition_not`, {
        text: asList(cond.conditions)
          .map((c) => describeCondition(c, ctx))
          .join(", "),
      });
    case "trigger":
      return ctx.t(`${K}condition_trigger`);
    default:
      return ctx.t(`${K}condition_other`, { type });
  }
};

const VERBS: Record<string, string> = {
  turn_on: "turn_on",
  turn_off: "turn_off",
  toggle: "toggle",
};

export const describeAction = (raw: unknown, ctx: LanguageContext): string => {
  const kind = actionKind(raw);
  if (!isRec(raw)) {
    return kind === "condition"
      ? ctx.t(`${K}action_check`, { text: describeCondition(raw, ctx) })
      : ctx.t(`${K}action_other`);
  }
  switch (kind) {
    case "service": {
      const service = serviceOf(raw) ?? "";
      const verb = VERBS[service.split(".")[1] ?? ""];
      return verb
        ? ctx.t(`${K}action_${verb}`, { entity: names(ctx, raw) })
        : ctx.t(`${K}action_service`, { service, entity: names(ctx, raw) });
    }
    case "delay":
      return ctx.t(`${K}action_delay`, {
        duration: duration(raw.delay) || ctx.t(`${K}a_while`),
      });
    case "wait_template":
      return ctx.t(`${K}action_wait_template`);
    case "wait_for_trigger":
      return ctx.t(`${K}action_wait_trigger`, {
        text: configParts({ triggers: raw.wait_for_trigger })
          .triggers.map((t) => describeTrigger(t, ctx))
          .join(` ${ctx.t(`${K}or`)} `),
      });
    case "event":
      return ctx.t(`${K}action_event`, { event: toText(raw.event) });
    case "variables":
      return ctx.t(`${K}action_variables`);
    case "stop":
      return ctx.t(`${K}action_stop`, { reason: toText(raw.stop) });
    case "scene":
      return ctx.t(`${K}action_scene`, {
        scene: names(ctx, { entity_id: raw.scene }),
      });
    case "device":
      return ctx.t(`${K}action_device`, { type: toText(raw.type) });
    case "condition":
      return ctx.t(`${K}action_check`, { text: describeCondition(raw, ctx) });
    case "repeat": {
      const r = isRec(raw.repeat) ? raw.repeat : {};
      if (r.count !== undefined) {
        return ctx.t(`${K}action_repeat_count`, { count: toText(r.count) });
      }
      if (r.while !== undefined) {
        return ctx.t(`${K}action_repeat_while`);
      }
      if (r.until !== undefined) {
        return ctx.t(`${K}action_repeat_until`);
      }
      return ctx.t(`${K}action_repeat_each`);
    }
    default:
      return ctx.t(`${K}action_other`);
  }
};

const walkActions = (
  items: unknown[],
  ctx: LanguageContext,
  depth: number,
  out: Line[]
) => {
  for (const raw of items) {
    if (isRec(raw) && raw.enabled === false) {
      continue;
    }
    const kind = actionKind(raw);
    if (!isRec(raw)) {
      out.push({ role: "then", text: describeAction(raw, ctx), depth });
      continue;
    }
    if (kind === "choose") {
      asList(raw.choose).forEach((option) => {
        const o = isRec(option) ? option : {};
        out.push({
          role: "if",
          text:
            asList(o.conditions)
              .map((c) => describeCondition(c, ctx))
              .join(` ${ctx.t(`${K}and`)} `) || ctx.t(`${K}always`),
          depth,
        });
        walkActions(asList(o.sequence), ctx, depth + 1, out);
      });
      if (raw.default !== undefined) {
        out.push({ role: "otherwise", text: ctx.t(`${K}otherwise`), depth });
        walkActions(asList(raw.default), ctx, depth + 1, out);
      }
    } else if (kind === "if") {
      out.push({
        role: "if",
        text: asList(raw.if)
          .map((c) => describeCondition(c, ctx))
          .join(` ${ctx.t(`${K}and`)} `),
        depth,
      });
      walkActions(asList(raw.then), ctx, depth + 1, out);
      if (raw.else !== undefined) {
        out.push({ role: "otherwise", text: ctx.t(`${K}otherwise`), depth });
        walkActions(asList(raw.else), ctx, depth + 1, out);
      }
    } else if (kind === "repeat") {
      out.push({ role: "then", text: describeAction(raw, ctx), depth });
      if (isRec(raw.repeat)) {
        walkActions(asList(raw.repeat.sequence), ctx, depth + 1, out);
      }
    } else if (kind === "sequence" || kind === "parallel") {
      walkActions(asList(raw[kind]), ctx, depth, out);
    } else {
      out.push({ role: "then", text: describeAction(raw, ctx), depth });
    }
  }
};

/** The whole automation as lines: when, if, then, otherwise. */
export const describeAutomation = (
  config: unknown,
  ctx: LanguageContext
): Line[] => {
  const { triggers, conditions, actions } = configParts(config);
  const out: Line[] = [];
  const when = triggers
    .filter((t) => t.enabled !== false)
    .map((t) => describeTrigger(t, ctx));
  if (when.length) {
    out.push({
      role: "when",
      text: when.join(` ${ctx.t(`${K}or`)} `),
      depth: 0,
    });
  }
  const live = conditions.filter((c) => !(isRec(c) && c.enabled === false));
  if (live.length) {
    out.push({
      role: "if",
      text: live
        .map((c) => describeCondition(c, ctx))
        .join(` ${ctx.t(`${K}and`)} `),
      depth: 0,
    });
  }
  walkActions(actions, ctx, 0, out);
  return out;
};

/** One paragraph for the whole automation. */
export const toSentence = (lines: Line[], ctx: LanguageContext): string =>
  lines
    .map((line) => ctx.t(`${K}line_${line.role}`, { text: line.text }))
    .join(" ");

/**
 * Sentence to draft. A sentence is a trigger phrase followed by one or more
 * actions, joined by a comma, "then" or nothing:
 *
 *   when <entity> turns on|off [for N minutes]
 *   when <entity> goes above|below <number> [for N minutes]
 *   at HH:MM  |  at 7:30 pm  |  at sunset|sunrise [plus|minus N minutes]
 *   N minutes before|after sunset|sunrise  |  when the sun sets|rises
 *
 *   turn on|off <entity>  |  toggle <entity>
 *   several actions joined by "and", for example
 *   "turn on <entity> and <entity> and turn off <entity>"
 *
 * Entities are matched by their entity id or their exact friendly name. Nothing
 * outside these patterns is guessed.
 */
export interface DraftResult {
  config?: {
    alias: string;
    description: string;
    triggers: Rec[];
    conditions: Rec[];
    actions: Rec[];
  };
  /** Why no draft could be made. */
  problem?: "no_pattern" | "unknown_entity";
  unknown?: string;
}

interface EntityRef {
  id: string;
  name: string;
}

const NUMBER = "(-?\\d+(?:\\.\\d+)?)";
const UNIT = "(?:\\s*(?:%|°[cf]?|degrees|percent|watts?|w|kw|lux|ppm))?";
const DURATION =
  "(\\d+(?:\\.\\d+)?)\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)";
const FOR_SUFFIX = `(?:\\s+for\\s+${DURATION})?`;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** A length of time as HH:MM:SS, or undefined when it is more than a day. */
const clockOf = (amount: string, unit: string): string | undefined => {
  const factor = /^h/i.test(unit) ? 3600 : /^m/i.test(unit) ? 60 : 1;
  const seconds = Math.round(Number(amount) * factor);
  if (!(seconds >= 0) || seconds >= 24 * 3600) {
    return undefined;
  }
  return `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor((seconds % 3600) / 60))}:${pad2(seconds % 60)}`;
};

const NO_PATTERN: DraftResult = { problem: "no_pattern" };

type TriggerParse = { trigger: Rec } | DraftResult;

const parseTrigger = (
  raw: string,
  find: (name: string) => string | undefined
): TriggerParse => {
  const text = raw
    .trim()
    .replace(/^(?:every day|each day|daily)[,\s]+/i, "")
    .trim();
  const entityOrUnknown = (name: string): string | DraftResult => {
    const id = find(name);
    return id ?? { problem: "unknown_entity", unknown: name };
  };
  const withFor = (
    trigger: Rec,
    amount: string | undefined,
    unit: string | undefined
  ): TriggerParse => {
    if (amount === undefined || unit === undefined) {
      return { trigger };
    }
    const clock = clockOf(amount, unit);
    return clock ? { trigger: { ...trigger, for: clock } } : NO_PATTERN;
  };

  let m = new RegExp(`^when (.+?) turns (on|off)${FOR_SUFFIX}$`, "i").exec(
    text
  );
  if (m) {
    const id = entityOrUnknown(m[1]);
    if (typeof id !== "string") {
      return id;
    }
    return withFor(
      { trigger: "state", entity_id: id, to: m[2].toLowerCase() },
      m[3],
      m[4]
    );
  }

  m = new RegExp(
    `^when (.+?) (?:goes|rises|climbs|gets|drops|falls|is|becomes) (above|over|higher than|greater than|below|under|lower than|less than) ${NUMBER}${UNIT}${FOR_SUFFIX}$`,
    "i"
  ).exec(text);
  const exceeds = m
    ? undefined
    : new RegExp(
        `^when (.+?) exceeds ${NUMBER}${UNIT}${FOR_SUFFIX}$`,
        "i"
      ).exec(text);
  if (m || exceeds) {
    const name = (m ?? exceeds)![1];
    const id = entityOrUnknown(name);
    if (typeof id !== "string") {
      return id;
    }
    const upper = exceeds ? true : /^(above|over|higher|greater)/i.test(m![2]);
    const value = Number(exceeds ? exceeds[2] : m![3]);
    return withFor(
      {
        trigger: "numeric_state",
        entity_id: id,
        [upper ? "above" : "below"]: value,
      },
      exceeds ? exceeds[3] : m![4],
      exceeds ? exceeds[4] : m![5]
    );
  }

  const sunEvent = (word: string) =>
    /^(sunset|sets|goes down)$/i.test(word) ? "sunset" : "sunrise";
  m = /^when the sun (sets|rises|goes down|comes up)$/i.exec(text);
  if (m) {
    return { trigger: { trigger: "sun", event: sunEvent(m[1]) } };
  }
  m = new RegExp(
    `^at (sunrise|sunset)(?:\\s*(plus|minus|\\+|-)\\s*${DURATION})?$`,
    "i"
  ).exec(text);
  if (m) {
    const trigger: Rec = { trigger: "sun", event: sunEvent(m[1]) };
    if (m[2]) {
      const clock = clockOf(m[3], m[4]);
      if (!clock) {
        return NO_PATTERN;
      }
      trigger.offset = /^(minus|-)$/i.test(m[2]) ? `-${clock}` : clock;
    }
    return { trigger };
  }
  m = new RegExp(`^${DURATION} (before|after) (sunrise|sunset)$`, "i").exec(
    text
  );
  if (m) {
    const clock = clockOf(m[1], m[2]);
    if (!clock) {
      return NO_PATTERN;
    }
    return {
      trigger: {
        trigger: "sun",
        event: sunEvent(m[4]),
        offset: /^before$/i.test(m[3]) ? `-${clock}` : clock,
      },
    };
  }

  m = /^at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);
  if (m && (m[2] !== undefined || m[3] !== undefined)) {
    let hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    if (m[3]) {
      if (hour < 1 || hour > 12) {
        return NO_PATTERN;
      }
      hour = (hour % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
    }
    if (hour > 23 || minute > 59) {
      return NO_PATTERN;
    }
    return {
      trigger: { trigger: "time", at: `${pad2(hour)}:${pad2(minute)}:00` },
    };
  }
  return NO_PATTERN;
};

const ACTION_START = /^(?:turn (on|off)|switch (on|off)|toggle)\b\s*/i;

const parseActions = (
  raw: string,
  find: (name: string) => string | undefined
): { actions: Rec[] } | DraftResult => {
  const actions: Rec[] = [];
  let rest = raw.trim();
  let lastVerb: string | undefined;
  while (rest) {
    const start = ACTION_START.exec(rest);
    let verb = lastVerb;
    if (start) {
      verb = (start[1] ?? start[2] ?? "toggle").toLowerCase();
      rest = rest.slice(start[0].length);
    }
    if (!verb) {
      return NO_PATTERN;
    }
    // The longest stretch before an "and" (or the end) that names an entity, so
    // that a name containing "and" still matches.
    const ends = [...rest.matchAll(/\s+and\s+/gi)].map((hit) => hit.index!);
    ends.push(rest.length);
    let end: number | undefined;
    let id: string | undefined;
    for (const candidate of [...ends].reverse()) {
      const found = find(rest.slice(0, candidate));
      if (found) {
        end = candidate;
        id = found;
        break;
      }
    }
    if (end === undefined || id === undefined) {
      return {
        problem: "unknown_entity",
        unknown: rest.slice(0, ends[0]).trim(),
      };
    }
    actions.push({
      action: `homeassistant.${verb === "toggle" ? "toggle" : `turn_${verb}`}`,
      target: { entity_id: id },
    });
    rest = rest
      .slice(end)
      .replace(/^\s+and\s+/i, "")
      .trim();
    lastVerb = verb;
  }
  return actions.length ? { actions } : NO_PATTERN;
};

const ACTION_WORD = /\b(?:turn (?:on|off)|switch (?:on|off)|toggle)\b/i;

export const draftFromSentence = (
  sentence: string,
  entities: EntityRef[]
): DraftResult => {
  const text = sentence.trim().replace(/[.!]+$/, "");
  const find = (raw: string): string | undefined => {
    const wanted = raw.trim().toLowerCase();
    return entities.find(
      (e) => e.id.toLowerCase() === wanted || e.name.toLowerCase() === wanted
    )?.id;
  };
  const split = ACTION_WORD.exec(text);
  if (!split || split.index === 0) {
    return NO_PATTERN;
  }
  const triggerText = text
    .slice(0, split.index)
    .replace(/(?:[,\s]|\bthen\b)+$/i, "");
  const trigger = parseTrigger(triggerText, find);
  if (!("trigger" in trigger)) {
    return trigger;
  }
  const parsed = parseActions(text.slice(split.index), find);
  if (!("actions" in parsed)) {
    return parsed;
  }
  return {
    config: {
      alias: text,
      description: "",
      triggers: [trigger.trigger],
      conditions: [],
      actions: parsed.actions,
    },
  };
};
