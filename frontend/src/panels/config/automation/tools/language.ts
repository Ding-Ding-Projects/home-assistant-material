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
 * Sentence to draft for a small set of patterns:
 *   "when <entity> turns on|off, turn on|off <entity>"
 *   "at HH:MM turn on|off <entity>"
 * The entities are matched by their entity id or their exact friendly name.
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

export const draftFromSentence = (
  sentence: string,
  entities: { id: string; name: string }[]
): DraftResult => {
  const text = sentence.trim().replace(/[.!]+$/, "");
  const find = (raw: string): string | undefined => {
    const wanted = raw.trim().toLowerCase();
    return entities.find(
      (e) => e.id.toLowerCase() === wanted || e.name.toLowerCase() === wanted
    )?.id;
  };
  const action = (verb: string, entity: string): Rec => ({
    action: `homeassistant.turn_${verb}`,
    target: { entity_id: entity },
  });
  const state = (word: string) => (word === "on" ? "on" : "off");
  let m = /^when (.+?) turns (on|off),? turn (on|off) (.+)$/i.exec(text);
  if (m) {
    const source = find(m[1]);
    const target = find(m[4]);
    if (!source || !target) {
      return { problem: "unknown_entity", unknown: !source ? m[1] : m[4] };
    }
    return {
      config: {
        alias: text,
        description: "",
        triggers: [
          {
            trigger: "state",
            entity_id: source,
            to: state(m[2].toLowerCase()),
          },
        ],
        conditions: [],
        actions: [action(m[3].toLowerCase(), target)],
      },
    };
  }
  m = /^at (\d{1,2}):(\d{2}),? turn (on|off) (.+)$/i.exec(text);
  if (m) {
    const target = find(m[4]);
    if (!target) {
      return { problem: "unknown_entity", unknown: m[4] };
    }
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) {
      return { problem: "no_pattern" };
    }
    return {
      config: {
        alias: text,
        description: "",
        triggers: [
          {
            trigger: "time",
            at: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
          },
        ],
        conditions: [],
        actions: [action(m[3].toLowerCase(), target)],
      },
    };
  }
  return { problem: "no_pattern" };
};
