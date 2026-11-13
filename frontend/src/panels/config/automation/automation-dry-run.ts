/* eslint-disable no-await-in-loop -- the steps are walked in order, each one depends on the steps before it */
import { hasTemplate } from "../../../common/string/has-template";
import type {
  Condition,
  ConditionWithShorthand,
  ManualAutomationConfig,
} from "../../../data/automation";
import {
  expandConditionWithShorthand,
  testCondition,
} from "../../../data/automation";
import type {
  Action,
  ChooseAction,
  DelayAction,
  EventAction,
  IfAction,
  Option,
  RepeatAction,
  ServiceAction,
  StopAction,
  WaitAction,
} from "../../../data/script";
import { getActionType } from "../../../data/script";
import type { HomeAssistant } from "../../../types";

/** What the automation would do with a step if it ran right now. */
export type DryRunVerdict = "would_run" | "would_skip" | "cannot_tell";

/** Why a step is skipped or cannot be told. Each code has its own text. */
export type DryRunReason =
  | "disabled"
  | "conditions_fail"
  | "conditions_unknown"
  | "branch_not_taken"
  | "stopped"
  | "condition_stops"
  | "earlier_unknown"
  | "needs_trigger"
  | "entity_not_found"
  | "not_numeric"
  | "template_value"
  | "template_error"
  | "server_error"
  | "unknown_action"
  | "no_iterations";

export type DryRunStepKind =
  | "condition"
  | "service"
  | "delay"
  | "wait_template"
  | "wait_trigger"
  | "event"
  | "device"
  | "variables"
  | "stop"
  | "response"
  | "choose"
  | "option"
  | "default"
  | "if"
  | "then"
  | "else"
  | "repeat"
  | "sequence"
  | "parallel"
  | "unknown";

export interface DryRunTarget {
  kind: "entity_id" | "device_id" | "area_id" | "floor_id" | "label_id";
  id: string;
  /** The friendly name for an entity that exists, otherwise the id. */
  name: string;
}

export interface DryRunStep {
  section: "condition" | "action";
  /** How deep the step sits inside choose, if, repeat and the like. */
  depth: number;
  kind: DryRunStepKind;
  verdict: DryRunVerdict;
  reason?: DryRunReason;
  /** The text behind a reason: a server error, a template, a stop message. */
  detail?: string;
  /** The condition or action this step describes, as it is in the config. */
  item?: Condition | Action | Option;
  service?: string;
  targets?: DryRunTarget[];
  /** A delay as HH:MM:SS, when its length is known. */
  delay?: string;
  event?: string;
  /** Position of an option inside a choose step, counting from zero. */
  index?: number;
  /** How many times a repeat step runs, when that can be told. */
  count?: number;
}

export type DryRunConditions = "none" | "pass" | "fail" | "unknown";

export interface DryRunResult {
  conditions: DryRunConditions;
  steps: DryRunStep[];
  counts: Record<DryRunVerdict, number>;
}

type CondResult = "pass" | "fail" | "unknown" | "disabled";

interface Evaluated {
  result: CondResult;
  reason?: DryRunReason;
  detail?: string;
}

interface Gate {
  verdict: DryRunVerdict;
  reason?: DryRunReason;
}

export type DryRunHass = Pick<HomeAssistant, "states" | "callWS"> & {
  /** Only simulation supplies a trigger ID; live dry runs leave it unset. */
  simulatedTriggerId?: string;
};

interface Ctx {
  hass: DryRunHass;
  steps: DryRunStep[];
}

const RUN: Gate = { verdict: "would_run" };

const toList = <T>(value: T | readonly T[] | null | undefined): T[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? ([...value] as T[])
      : [value as T];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The verdict a step really gets, once the steps before it are taken in. */
const gated = (own: Gate, gate: Gate): Gate => {
  if (gate.verdict === "would_skip") {
    return gate;
  }
  if (gate.verdict === "cannot_tell" && own.verdict === "would_run") {
    return gate;
  }
  return own;
};

const push = (
  ctx: Ctx,
  section: DryRunStep["section"],
  depth: number,
  kind: DryRunStepKind,
  own: Gate,
  gate: Gate,
  extra: Partial<DryRunStep> = {}
): DryRunStep => {
  const { verdict, reason } = gated(own, gate);
  const step: DryRunStep = { section, depth, kind, verdict, ...extra };
  if (reason) {
    step.reason = reason;
  }
  ctx.steps.push(step);
  return step;
};

const resultGate = (evaluated: Evaluated): Gate => {
  switch (evaluated.result) {
    case "pass":
      return RUN;
    case "fail":
      return { verdict: "would_skip", reason: "conditions_fail" };
    case "disabled":
      return { verdict: "would_skip", reason: "disabled" };
    default:
      return { verdict: "cannot_tell", reason: evaluated.reason };
  }
};

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const TRIGGER_WORD = /\btrigger\b/;

/** True when a template reads the trigger, which a dry run does not have. */
const readsTrigger = (value: unknown): boolean => {
  if (typeof value === "string") {
    return hasTemplate(value) && TRIGGER_WORD.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(readsTrigger);
  }
  if (isRecord(value)) {
    return Object.values(value).some(readsTrigger);
  }
  return false;
};

const viaServer = async (
  ctx: Ctx,
  condition: Condition
): Promise<Evaluated> => {
  if (condition.condition === "trigger" && ctx.hass.simulatedTriggerId) {
    const ids = (condition as { id?: unknown }).id;
    if (
      typeof ids === "string" ||
      (Array.isArray(ids) && ids.every((id) => typeof id === "string"))
    ) {
      return {
        result: toList(ids).includes(ctx.hass.simulatedTriggerId)
          ? "pass"
          : "fail",
      };
    }
  }
  if (condition.condition === "trigger" || readsTrigger(condition)) {
    return { result: "unknown", reason: "needs_trigger" };
  }
  try {
    const { result, template_errors } = await testCondition(
      ctx.hass as HomeAssistant,
      condition
    );
    if (template_errors?.length) {
      return {
        result: "unknown",
        reason: "template_error",
        detail: template_errors[0],
      };
    }
    return { result: result ? "pass" : "fail" };
  } catch (err: unknown) {
    return {
      result: "unknown",
      reason: "server_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
};

const entityIds = (value: unknown): string[] =>
  toList(value as string | string[] | undefined).filter(
    (id): id is string => typeof id === "string"
  );

const readValue = (
  ctx: Ctx,
  entityId: string,
  attribute?: string
): unknown | undefined => {
  const stateObj = ctx.hass.states[entityId];
  if (!stateObj) {
    return undefined;
  }
  return attribute ? stateObj.attributes[attribute] : stateObj.state;
};

const evaluateState = (
  ctx: Ctx,
  cond: Condition & Record<string, unknown>
): Evaluated | undefined => {
  const ids = entityIds(cond.entity_id);
  if (!ids.length) {
    return undefined;
  }
  // How long a state has held cannot be told from the states alone, so the
  // server is asked instead of passing a condition that may not hold.
  if (cond.for !== undefined && cond.for !== null) {
    return undefined;
  }
  const wanted = toList(cond.state as string | number | string[]);
  if (wanted.some((item) => hasTemplate(item))) {
    return undefined;
  }
  // A wanted state may be the id of another entity, whose state is compared.
  const wantedStates = wanted.map((item) => {
    const text = String(item);
    const other = ctx.hass.states[text];
    return other && /^[a-z_]+\.\w+$/.test(text) ? other.state : text;
  });
  const results: boolean[] = [];
  for (const id of ids) {
    if (!ctx.hass.states[id]) {
      return { result: "unknown", reason: "entity_not_found", detail: id };
    }
    const value = readValue(ctx, id, cond.attribute as string | undefined);
    if (isRecord(value) || Array.isArray(value)) {
      return undefined;
    }
    results.push(wantedStates.includes(String(value)));
  }
  const matched =
    cond.match === "any" ? results.some(Boolean) : results.every(Boolean);
  return { result: matched ? "pass" : "fail" };
};

const numberOf = (
  ctx: Ctx,
  bound: unknown
): number | undefined | "template" => {
  if (bound === undefined || bound === null || bound === "") {
    return undefined;
  }
  if (typeof bound === "number") {
    return bound;
  }
  if (typeof bound === "string") {
    if (hasTemplate(bound)) {
      return "template";
    }
    const asNumber = Number(bound);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }
    const other = ctx.hass.states[bound];
    if (other) {
      const fromEntity = Number(other.state);
      return Number.isNaN(fromEntity) ? Number.NaN : fromEntity;
    }
    return Number.NaN;
  }
  return Number.NaN;
};

const evaluateNumeric = (
  ctx: Ctx,
  cond: Condition & Record<string, unknown>
): Evaluated | undefined => {
  if (cond.value_template) {
    return undefined;
  }
  const ids = entityIds(cond.entity_id);
  if (!ids.length) {
    return undefined;
  }
  const above = numberOf(ctx, cond.above);
  const below = numberOf(ctx, cond.below);
  if (above === "template" || below === "template") {
    return undefined;
  }
  if (
    (above !== undefined && Number.isNaN(above)) ||
    (below !== undefined && Number.isNaN(below))
  ) {
    return { result: "unknown", reason: "not_numeric" };
  }
  for (const id of ids) {
    if (!ctx.hass.states[id]) {
      return { result: "unknown", reason: "entity_not_found", detail: id };
    }
    const value = Number(
      readValue(ctx, id, cond.attribute as string | undefined)
    );
    if (Number.isNaN(value)) {
      return { result: "unknown", reason: "not_numeric", detail: id };
    }
    if (above !== undefined && !(value > above)) {
      return { result: "fail" };
    }
    if (below !== undefined && !(value < below)) {
      return { result: "fail" };
    }
  }
  return { result: "pass" };
};

const combine = (type: "and" | "or" | "not", parts: Evaluated[]): Evaluated => {
  const active = parts.filter((part) => part.result !== "disabled");
  const unknown = active.find((part) => part.result === "unknown");
  const hasPass = active.some((part) => part.result === "pass");
  const hasFail = active.some((part) => part.result === "fail");
  const unknownOut: Evaluated = {
    result: "unknown",
    reason: unknown?.reason,
    detail: unknown?.detail,
  };
  if (type === "and") {
    if (hasFail) return { result: "fail" };
    return unknown ? unknownOut : { result: "pass" };
  }
  if (type === "or") {
    if (hasPass) return { result: "pass" };
    return unknown ? unknownOut : { result: "fail" };
  }
  // not: passes when none of the conditions pass
  if (hasPass) return { result: "fail" };
  return unknown ? unknownOut : { result: "pass" };
};

const conditionOwnGate = (evaluated: Evaluated): Gate => resultGate(evaluated);

/**
 * Evaluates one condition against the live states and adds a step for it,
 * with a step for each child of and, or and not. Plain state and numeric
 * state conditions are decided here; everything else the server can test is
 * asked through the test_condition call, which never runs an action.
 */
const evaluateCondition = async (
  ctx: Ctx,
  raw: ConditionWithShorthand,
  depth: number,
  gate: Gate
): Promise<Evaluated> => {
  const cond = expandConditionWithShorthand(raw);
  const section: DryRunStep["section"] = "condition";
  const base = { item: cond as Condition };
  if (cond.enabled === false) {
    push(
      ctx,
      section,
      depth,
      "condition",
      { verdict: "would_skip", reason: "disabled" },
      gate,
      base
    );
    return { result: "disabled" };
  }
  const logical = cond.condition;
  if (logical === "and" || logical === "or" || logical === "not") {
    const step = push(ctx, section, depth, "condition", RUN, gate, base);
    const children = toList(
      (
        cond as {
          conditions?: ConditionWithShorthand | ConditionWithShorthand[];
        }
      ).conditions ?? []
    );
    const parts: Evaluated[] = [];
    for (const child of children) {
      parts.push(await evaluateCondition(ctx, child, depth + 1, gate));
    }
    const evaluated = combine(logical, parts);
    Object.assign(step, gated(conditionOwnGate(evaluated), gate));
    if (evaluated.detail) {
      step.detail = evaluated.detail;
    }
    return evaluated;
  }
  let evaluated: Evaluated | undefined;
  if (logical === "state") {
    evaluated = evaluateState(ctx, cond as Condition & Record<string, unknown>);
  } else if (logical === "numeric_state") {
    evaluated = evaluateNumeric(
      ctx,
      cond as Condition & Record<string, unknown>
    );
  }
  evaluated ??= await viaServer(ctx, cond as Condition);
  push(ctx, section, depth, "condition", conditionOwnGate(evaluated), gate, {
    ...base,
    ...(evaluated.detail ? { detail: evaluated.detail } : {}),
  });
  return evaluated;
};

/** A list of conditions that must all pass, as in if, while and options. */
const evaluateConditionList = async (
  ctx: Ctx,
  list: unknown,
  depth: number,
  gate: Gate
): Promise<Evaluated> => {
  const parts: Evaluated[] = [];
  for (const item of toList(list as ConditionWithShorthand[] | undefined)) {
    parts.push(await evaluateCondition(ctx, item, depth, gate));
  }
  return combine("and", parts);
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/** Formats a number of seconds as HH:MM:SS, with milliseconds when needed. */
export const formatSeconds = (seconds: number): string => {
  const total = Math.round(seconds * 1000);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${
    millis ? `.${pad(millis, 3)}` : ""
  }`;
};

/**
 * The length of a delay as HH:MM:SS, or undefined when it is a template and
 * so only known when the automation runs.
 */
export const formatDelay = (
  delay: DelayAction["delay"]
): string | undefined => {
  if (typeof delay === "number") {
    return formatSeconds(delay);
  }
  if (typeof delay === "string") {
    if (hasTemplate(delay)) {
      return undefined;
    }
    if (/^\d+(\.\d+)?$/.test(delay.trim())) {
      return formatSeconds(Number(delay));
    }
    const parts = delay.trim().split(":");
    if (
      parts.length >= 2 &&
      parts.every((part) => /^\d+(\.\d+)?$/.test(part))
    ) {
      const [hours, minutes, secs = "0"] = parts;
      return formatSeconds(
        Number(hours) * 3600 + Number(minutes) * 60 + Number(secs)
      );
    }
    return undefined;
  }
  if (isRecord(delay)) {
    const parts = delay as Record<string, unknown>;
    let seconds = 0;
    const units: [string, number][] = [
      ["days", 86400],
      ["hours", 3600],
      ["minutes", 60],
      ["seconds", 1],
      ["milliseconds", 0.001],
    ];
    for (const [unit, factor] of units) {
      const value = parts[unit];
      if (value === undefined || value === null || value === "") {
        continue;
      }
      if (typeof value === "string" && hasTemplate(value)) {
        return undefined;
      }
      const asNumber = Number(value);
      if (Number.isNaN(asNumber)) {
        return undefined;
      }
      seconds += asNumber * factor;
    }
    return formatSeconds(seconds);
  }
  return undefined;
};

const TARGET_KINDS = [
  "entity_id",
  "device_id",
  "area_id",
  "floor_id",
  "label_id",
] as const;

const collectTargets = (ctx: Ctx, action: ServiceAction): DryRunTarget[] => {
  const sources: Record<string, unknown>[] = [
    isRecord(action.target) ? action.target : {},
    { entity_id: action.entity_id },
    isRecord(action.data) ? action.data : {},
  ];
  const seen = new Set<string>();
  const targets: DryRunTarget[] = [];
  for (const kind of TARGET_KINDS) {
    for (const source of sources) {
      const value = source[kind];
      const ids = (
        typeof value === "string" ? value.split(",") : toList(value as string[])
      )
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean);
      for (const id of ids) {
        const key = `${kind}:${id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const friendly =
          kind === "entity_id"
            ? ctx.hass.states[id]?.attributes.friendly_name
            : undefined;
        targets.push({
          kind,
          id,
          name: typeof friendly === "string" && friendly ? friendly : id,
        });
      }
    }
  }
  return targets;
};

const KIND_BY_TYPE: Record<string, DryRunStepKind> = {
  delay: "delay",
  wait_template: "wait_template",
  wait_for_trigger: "wait_trigger",
  check_condition: "condition",
  fire_event: "event",
  device_action: "device",
  repeat: "repeat",
  choose: "choose",
  if: "if",
  variables: "variables",
  service: "service",
  stop: "stop",
  sequence: "sequence",
  parallel: "parallel",
  set_conversation_response: "response",
  unknown: "unknown",
};

const actionKind = (action: Action): DryRunStepKind =>
  KIND_BY_TYPE[getActionType(action)] ?? "unknown";

const isDisabled = (action: unknown): boolean =>
  isRecord(action) && action.enabled === false;

/** Steps of an action the run never reaches, listed without going inside. */
const pushSkipped = (
  ctx: Ctx,
  actions: readonly Action[],
  depth: number,
  gate: Gate
) => {
  for (const action of actions) {
    push(ctx, "action", depth, actionKind(action), gate, gate, {
      item: action,
    });
  }
};

const mergeEnds = (incoming: Gate, ends: Gate[]): Gate =>
  ends.some((end) => end.verdict !== "would_run")
    ? { verdict: "cannot_tell", reason: "earlier_unknown" }
    : incoming;

const walkActions = async (
  ctx: Ctx,
  actions: readonly Action[],
  depth: number,
  incoming: Gate
): Promise<Gate> => {
  let gate = incoming;
  for (const action of actions) {
    gate = await walkAction(ctx, action, depth, gate);
  }
  return gate;
};

/** Walks the actions under a branch, which is not expanded when it is skipped. */
const walkBranch = async (
  ctx: Ctx,
  actions: Action | Action[] | undefined,
  depth: number,
  branch: Gate
): Promise<Gate> => {
  const list = toList<Action>(actions);
  if (branch.verdict === "would_skip") {
    return branch;
  }
  return walkActions(ctx, list, depth, branch);
};

const walkAction = async (
  ctx: Ctx,
  action: Action,
  depth: number,
  gate: Gate
): Promise<Gate> => {
  if (isDisabled(action)) {
    push(
      ctx,
      "action",
      depth,
      actionKind(action),
      { verdict: "would_skip", reason: "disabled" },
      gate,
      { item: action }
    );
    return gate;
  }
  if (gate.verdict === "would_skip") {
    pushSkipped(ctx, [action], depth, gate);
    return gate;
  }
  const item = { item: action };
  const type = getActionType(action);
  switch (type) {
    case "check_condition": {
      const evaluated = await evaluateCondition(
        ctx,
        action as ConditionWithShorthand,
        depth,
        gate
      );
      if (evaluated.result === "fail") {
        return { verdict: "would_skip", reason: "condition_stops" };
      }
      if (evaluated.result === "unknown") {
        return { verdict: "cannot_tell", reason: "earlier_unknown" };
      }
      return gate;
    }
    case "service": {
      const service = action as ServiceAction & { service?: string };
      const name =
        service.action ?? service.service ?? service.service_template;
      push(
        ctx,
        "action",
        depth,
        "service",
        name && !hasTemplate(name)
          ? RUN
          : { verdict: "cannot_tell", reason: "template_value" },
        gate,
        { ...item, service: name, targets: collectTargets(ctx, service) }
      );
      return gate;
    }
    case "delay": {
      const delay = (action as DelayAction).delay;
      const text = formatDelay(delay);
      push(ctx, "action", depth, "delay", RUN, gate, {
        ...item,
        ...(text !== undefined
          ? { delay: text }
          : { detail: typeof delay === "string" ? delay : undefined }),
      });
      return gate;
    }
    case "wait_template":
      push(ctx, "action", depth, "wait_template", RUN, gate, {
        ...item,
        detail: (action as WaitAction).wait_template,
      });
      return gate;
    case "wait_for_trigger":
      push(ctx, "action", depth, "wait_trigger", RUN, gate, item);
      return gate;
    case "fire_event":
      push(ctx, "action", depth, "event", RUN, gate, {
        ...item,
        event: (action as EventAction).event,
      });
      return gate;
    case "stop": {
      push(ctx, "action", depth, "stop", RUN, gate, {
        ...item,
        detail: (action as StopAction).stop,
      });
      return { verdict: "would_skip", reason: "stopped" };
    }
    case "choose":
      return walkChoose(ctx, action as ChooseAction, depth, gate);
    case "if":
      return walkIf(ctx, action as IfAction, depth, gate);
    case "repeat":
      return walkRepeat(ctx, action as RepeatAction, depth, gate);
    case "sequence": {
      push(ctx, "action", depth, "sequence", RUN, gate, item);
      const inner = toList(
        (action as { sequence?: Action | Action[] | null }).sequence ?? []
      );
      return walkActions(ctx, inner as Action[], depth + 1, gate);
    }
    case "parallel": {
      push(ctx, "action", depth, "parallel", RUN, gate, item);
      const inner = toList(
        (action as { parallel?: Action | Action[] }).parallel
      ) as Action[];
      const ends: Gate[] = [];
      for (const branch of inner) {
        ends.push(await walkAction(ctx, branch, depth + 1, gate));
      }
      return mergeEnds(gate, ends);
    }
    case "device_action":
    case "variables":
    case "set_conversation_response":
      push(ctx, "action", depth, actionKind(action), RUN, gate, item);
      return gate;
    default:
      push(
        ctx,
        "action",
        depth,
        "unknown",
        { verdict: "cannot_tell", reason: "unknown_action" },
        gate,
        item
      );
      return gate;
  }
};

const walkChoose = async (
  ctx: Ctx,
  action: ChooseAction,
  depth: number,
  gate: Gate
): Promise<Gate> => {
  push(ctx, "action", depth, "choose", RUN, gate, { item: action });
  const options = toList(action.choose ?? []);
  let outcome: "searching" | "taken" | "unknown" = "searching";
  const ends: Gate[] = [];
  for (const [index, option] of options.entries()) {
    const extra = { item: option, index };
    if (outcome === "taken") {
      push(
        ctx,
        "action",
        depth + 1,
        "option",
        { verdict: "would_skip", reason: "branch_not_taken" },
        gate,
        extra
      );
      continue;
    }
    if (outcome === "unknown") {
      push(
        ctx,
        "action",
        depth + 1,
        "option",
        { verdict: "cannot_tell", reason: "earlier_unknown" },
        gate,
        extra
      );
      ends.push(
        await walkBranch(ctx, option.sequence, depth + 2, {
          verdict: "cannot_tell",
          reason: "earlier_unknown",
        })
      );
      continue;
    }
    const step = push(ctx, "action", depth + 1, "option", RUN, gate, extra);
    const evaluated = await evaluateConditionList(
      ctx,
      option.conditions,
      depth + 2,
      gate
    );
    if (evaluated.result === "pass") {
      outcome = "taken";
      ends.push(
        await walkBranch(ctx, option.sequence, depth + 2, gated(RUN, gate))
      );
    } else if (evaluated.result === "fail") {
      Object.assign(step, {
        verdict: "would_skip",
        reason: "branch_not_taken",
      });
    } else {
      outcome = "unknown";
      Object.assign(step, gated(resultGate(evaluated), gate));
      ends.push(
        await walkBranch(
          ctx,
          option.sequence,
          depth + 2,
          gated(resultGate(evaluated), gate)
        )
      );
    }
  }
  if (action.default) {
    const own: Gate =
      outcome === "taken"
        ? { verdict: "would_skip", reason: "branch_not_taken" }
        : outcome === "unknown"
          ? { verdict: "cannot_tell", reason: "earlier_unknown" }
          : RUN;
    const branch = gated(own, gate);
    push(ctx, "action", depth + 1, "default", own, gate, { item: action });
    ends.push(await walkBranch(ctx, action.default, depth + 2, branch));
  }
  return mergeEnds(
    gate,
    outcome === "unknown"
      ? ends
      : ends.filter(
          (end) => end.verdict === "would_skip" && end.reason === "stopped"
        )
  );
};

const walkIf = async (
  ctx: Ctx,
  action: IfAction,
  depth: number,
  gate: Gate
): Promise<Gate> => {
  push(ctx, "action", depth, "if", RUN, gate, { item: action });
  const evaluated = await evaluateConditionList(
    ctx,
    action.if,
    depth + 1,
    gate
  );
  const thenOwn: Gate =
    evaluated.result === "fail"
      ? { verdict: "would_skip", reason: "branch_not_taken" }
      : evaluated.result === "unknown"
        ? { verdict: "cannot_tell", reason: evaluated.reason }
        : RUN;
  const elseOwn: Gate =
    evaluated.result === "pass"
      ? { verdict: "would_skip", reason: "branch_not_taken" }
      : evaluated.result === "unknown"
        ? { verdict: "cannot_tell", reason: evaluated.reason }
        : RUN;
  push(ctx, "action", depth + 1, "then", thenOwn, gate, { item: action });
  const thenEnd = await walkBranch(
    ctx,
    action.then,
    depth + 2,
    gated(thenOwn, gate)
  );
  let elseEnd: Gate = { verdict: "would_skip", reason: "branch_not_taken" };
  if (action.else) {
    push(ctx, "action", depth + 1, "else", elseOwn, gate, { item: action });
    elseEnd = await walkBranch(
      ctx,
      action.else,
      depth + 2,
      gated(elseOwn, gate)
    );
  }
  if (evaluated.result === "pass") {
    return thenEnd.verdict === "would_run" ? gate : thenEnd;
  }
  if (evaluated.result === "fail") {
    if (!action.else) {
      return gate;
    }
    return elseEnd.verdict === "would_run" ? gate : elseEnd;
  }
  return mergeEnds(
    gate,
    [thenEnd, elseEnd].filter((end) => end.reason !== "branch_not_taken")
  );
};

const walkRepeat = async (
  ctx: Ctx,
  action: RepeatAction,
  depth: number,
  gate: Gate
): Promise<Gate> => {
  const repeat = action.repeat as unknown as Record<string, unknown>;
  const step = push(ctx, "action", depth, "repeat", RUN, gate, {
    item: action,
  });
  let body: Gate = gated(RUN, gate);
  if ("count" in repeat) {
    const count = Number(repeat.count);
    if (typeof repeat.count === "string" && hasTemplate(repeat.count)) {
      Object.assign(
        step,
        gated({ verdict: "cannot_tell", reason: "template_value" }, gate)
      );
      body = { verdict: "cannot_tell", reason: "template_value" };
    } else if (!Number.isNaN(count)) {
      step.count = count;
      if (count <= 0) {
        body = { verdict: "would_skip", reason: "no_iterations" };
      }
    }
  } else if ("for_each" in repeat) {
    const items = repeat.for_each;
    if (Array.isArray(items)) {
      step.count = items.length;
      if (!items.length) {
        body = { verdict: "would_skip", reason: "no_iterations" };
      }
    } else {
      Object.assign(
        step,
        gated({ verdict: "cannot_tell", reason: "template_value" }, gate)
      );
      body = { verdict: "cannot_tell", reason: "template_value" };
    }
  } else if ("while" in repeat) {
    const evaluated = await evaluateConditionList(
      ctx,
      repeat.while,
      depth + 1,
      gate
    );
    if (evaluated.result === "fail") {
      body = { verdict: "would_skip", reason: "no_iterations" };
    } else if (evaluated.result === "unknown") {
      body = { verdict: "cannot_tell", reason: evaluated.reason };
    }
  }
  // An until loop always runs its sequence once; its condition is read after.
  const end = await walkBranch(
    ctx,
    repeat.sequence as Action | Action[] | undefined,
    depth + 1,
    gated(body, gate)
  );
  if ("until" in repeat) {
    await evaluateConditionList(ctx, repeat.until, depth + 1, gate);
  }
  return end.verdict === "would_run" || end.reason === "no_iterations"
    ? gate
    : mergeEnds(gate, [end]);
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Plays the automation as it is on screen against the live states and lists,
 * step by step, what it would do. Nothing is run: no service is called, no
 * event is fired and nothing is saved. The only call to the instance is the
 * test_condition request, which reads state and runs no action. The trigger is
 * taken as given, so a template that reads it cannot be told.
 */
export const dryRunAutomation = async (
  hass: DryRunHass,
  config: Pick<ManualAutomationConfig, "conditions" | "actions">
): Promise<DryRunResult> => {
  const ctx: Ctx = { hass, steps: [] };
  const conditions = toList(config.conditions ?? []);
  let verdict: DryRunConditions = "none";
  let gate: Gate = RUN;
  if (conditions.some((condition) => !isDisabled(condition))) {
    const evaluated = await evaluateConditionList(ctx, conditions, 0, RUN);
    verdict = evaluated.result === "disabled" ? "none" : evaluated.result;
    if (evaluated.result === "fail") {
      gate = { verdict: "would_skip", reason: "conditions_fail" };
    } else if (evaluated.result === "unknown") {
      gate = { verdict: "cannot_tell", reason: "conditions_unknown" };
    }
  } else {
    await evaluateConditionList(ctx, conditions, 0, RUN);
  }
  await walkActions(ctx, toList<Action>(config.actions ?? []), 0, gate);
  const counts: Record<DryRunVerdict, number> = {
    would_run: 0,
    would_skip: 0,
    cannot_tell: 0,
  };
  for (const step of ctx.steps) {
    if (step.section === "action") {
      counts[step.verdict]++;
    }
  }
  return { conditions: verdict, steps: ctx.steps, counts };
};
