import type { HassServiceTarget } from "home-assistant-js-websocket";
import { ensureArray } from "../common/array/ensure-array";
import { isValidEntityId } from "../common/entity/valid_entity_id";

/**
 * A quick action is a short sequence that runs once and is then thrown away.
 * The guided view edits it as a list of steps; the YAML view edits the same
 * sequence as text. This module holds the pure parts: the steps, the
 * conversion both ways, the default first step for an entity, validation and
 * the check for steps that need a confirmation before they run.
 */

/** "Do this" on the entity the dialog was opened for. */
export interface QuickEntityStep {
  kind: "action";
  action: string;
  target: HassServiceTarget;
  data: Record<string, unknown>;
}

/** "Do this" on another entity, chosen in the step. */
export interface QuickOtherStep {
  kind: "other";
  action: string;
  target: HassServiceTarget;
  data: Record<string, unknown>;
}

/** "Wait" for a fixed time. */
export interface QuickWaitStep {
  kind: "wait";
  seconds: number;
}

export type QuickServiceStep = QuickEntityStep | QuickOtherStep;

export type QuickStep = QuickServiceStep | QuickWaitStep;

/** One action of the sequence that is sent to the server. */
export interface QuickServiceAction {
  action: string;
  target?: HassServiceTarget;
  data?: Record<string, unknown>;
}

export interface QuickDelayAction {
  delay: { hours: number; minutes: number; seconds: number };
}

export type QuickSequenceAction = QuickServiceAction | QuickDelayAction;

/** The services the instance offers, by domain then service name. */
export type ServiceIndex = Record<string, Record<string, unknown>>;

/** Domains whose actions always ask first. */
export const RISKY_ACTION_DOMAINS = new Set([
  "lock",
  "alarm_control_panel",
  "valve",
  "siren",
]);

/**
 * Domains whose actions may reach a risky entity when the target is not a
 * list of entities (an area, a device, a label or a floor), so they ask
 * first too.
 */
const MAY_REACH_RISKY_DOMAINS = new Set(["cover", "homeassistant"]);

const domainOf = (id: string): string => id.split(".", 1)[0];

const has = (services: ServiceIndex, domain: string, service: string) =>
  !!services[domain] && service in services[domain];

/**
 * The service that most likely does what the person wants right now: the
 * opposite of the present state for things that switch, the press for a
 * button, and so on. Undefined when the domain offers no service at all.
 */
export const defaultActionFor = (
  entityId: string,
  state: string | undefined,
  services: ServiceIndex
): string | undefined => {
  const domain = domainOf(entityId);
  const available = services[domain];
  if (!available || Object.keys(available).length === 0) {
    return undefined;
  }
  const candidates: string[] = [];
  switch (domain) {
    case "button":
    case "input_button":
      candidates.push("press");
      break;
    case "scene":
    case "script":
      candidates.push("turn_on");
      break;
    case "automation":
      candidates.push("trigger");
      break;
    case "lock":
      candidates.push(state === "locked" ? "unlock" : "lock");
      break;
    case "cover":
      candidates.push(
        state === "open" || state === "opening" ? "close_cover" : "open_cover"
      );
      break;
    case "valve":
      candidates.push(
        state === "open" || state === "opening" ? "close_valve" : "open_valve"
      );
      break;
    case "media_player":
      candidates.push(
        state === "playing"
          ? "media_pause"
          : state === "off"
            ? "turn_on"
            : "media_play"
      );
      break;
    case "vacuum":
      candidates.push(state === "cleaning" ? "return_to_base" : "start");
      break;
    case "lawn_mower":
      candidates.push(state === "mowing" ? "dock" : "start_mowing");
      break;
    case "alarm_control_panel":
      candidates.push(state === "disarmed" ? "alarm_arm_home" : "alarm_disarm");
      break;
    default:
      if (state === "on") {
        candidates.push("turn_off");
      } else if (state === "off") {
        candidates.push("turn_on");
      }
  }
  candidates.push("toggle", "turn_on");
  const found = candidates.find((service) => has(services, domain, service));
  const service = found ?? Object.keys(available).sort()[0];
  return `${domain}.${service}`;
};

/** The first step when the dialog opens for an entity, or an empty one. */
export const firstStepFor = (
  entityId: string | undefined,
  state: string | undefined,
  services: ServiceIndex
): QuickServiceStep => {
  if (!entityId) {
    return { kind: "other", action: "", target: {}, data: {} };
  }
  return {
    kind: "action",
    action: defaultActionFor(entityId, state, services) ?? "",
    target: { entity_id: entityId },
    data: {},
  };
};

export const waitStep = (seconds = 60): QuickWaitStep => ({
  kind: "wait",
  seconds,
});

/** The entities a target names directly; areas, devices and labels are not resolved. */
export const targetEntityIds = (target?: HassServiceTarget): string[] =>
  (ensureArray(target?.entity_id) ?? []).filter(
    (id): id is string => typeof id === "string"
  );

/** The entity a step is about, when it names one. */
export const stepEntityId = (step: QuickServiceStep): string | undefined =>
  targetEntityIds(step.target)[0];

/** The domain whose actions the step's action picker offers. */
export const stepDomain = (step: QuickServiceStep): string | undefined => {
  const entityId = stepEntityId(step);
  if (entityId) {
    return domainOf(entityId);
  }
  return step.action ? domainOf(step.action) : undefined;
};

export const secondsToParts = (total: number) => {
  const safe = Math.max(0, Math.round(total));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
};

const isEmptyTarget = (target: HassServiceTarget) =>
  Object.values(target).every(
    (value) =>
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0) ||
      value === ""
  );

/** The sequence the server runs, built from the guided steps. */
export const stepsToSequence = (steps: QuickStep[]): QuickSequenceAction[] =>
  steps.map((step) => {
    if (step.kind === "wait") {
      return { delay: secondsToParts(step.seconds) };
    }
    const action: QuickServiceAction = { action: step.action };
    if (!isEmptyTarget(step.target)) {
      action.target = step.target;
    }
    if (Object.keys(step.data).length > 0) {
      action.data = step.data;
    }
    return action;
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberOr = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

/** Seconds of a delay written in any of the forms scripts accept, if fixed. */
export const delaySeconds = (delay: unknown): number | undefined => {
  if (typeof delay === "number") {
    return numberOr(delay);
  }
  if (typeof delay === "string") {
    const match = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(delay.trim());
    if (!match) {
      return undefined;
    }
    const [, a, b, c] = match;
    return c === undefined
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
  }
  if (isPlainObject(delay)) {
    const allowed = ["days", "hours", "minutes", "seconds", "milliseconds"];
    if (Object.keys(delay).some((key) => !allowed.includes(key))) {
      return undefined;
    }
    const parts = allowed.map((key) =>
      delay[key] === undefined ? 0 : numberOr(delay[key])
    );
    if (parts.some((part) => part === undefined)) {
      return undefined;
    }
    const [days, hours, minutes, seconds, milliseconds] = parts as number[];
    return (
      days * 86400 + hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
    );
  }
  return undefined;
};

const isEntityTarget = (target: HassServiceTarget, entityId: string) => {
  const keys = Object.keys(target);
  const ids = targetEntityIds(target);
  return (
    keys.length === 1 &&
    keys[0] === "entity_id" &&
    ids.length === 1 &&
    ids[0] === entityId
  );
};

/**
 * The guided steps for a sequence, or undefined when the sequence uses
 * anything the guided view cannot show (conditions, templates, options such
 * as `continue_on_error`). The YAML view still edits such a sequence.
 */
export const sequenceToSteps = (
  sequence: unknown,
  mainEntityId?: string
): QuickStep[] | undefined => {
  if (!Array.isArray(sequence)) {
    return undefined;
  }
  const steps: QuickStep[] = [];
  for (const item of sequence) {
    if (!isPlainObject(item)) {
      return undefined;
    }
    const keys = Object.keys(item);
    if ("delay" in item) {
      const seconds = delaySeconds(item.delay);
      if (keys.length !== 1 || seconds === undefined) {
        return undefined;
      }
      steps.push(waitStep(seconds));
      continue;
    }
    const name =
      typeof item.action === "string"
        ? item.action
        : typeof item.service === "string"
          ? item.service
          : undefined;
    if (
      !name ||
      !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(name) ||
      keys.some(
        (key) =>
          !["action", "service", "target", "data", "entity_id"].includes(key)
      ) ||
      ("action" in item && "service" in item)
    ) {
      return undefined;
    }
    if (item.target !== undefined && !isPlainObject(item.target)) {
      return undefined;
    }
    if (item.data !== undefined && !isPlainObject(item.data)) {
      return undefined;
    }
    const data = { ...((item.data as Record<string, unknown>) ?? {}) };
    const target: HassServiceTarget = {
      ...((item.target as HassServiceTarget) ?? {}),
    };
    // A legacy entity_id beside the action or in its data is a target.
    const legacy = item.entity_id ?? data.entity_id;
    delete data.entity_id;
    if (legacy !== undefined) {
      if (target.entity_id !== undefined) {
        return undefined;
      }
      target.entity_id = legacy as string | string[];
    }
    const ids = ensureArray(target.entity_id) ?? [];
    if (ids.some((id) => typeof id !== "string" || !isValidEntityId(id))) {
      return undefined;
    }
    const kind: QuickServiceStep["kind"] =
      mainEntityId && isEntityTarget(target, mainEntityId) ? "action" : "other";
    steps.push({ kind, action: name, target, data });
  }
  return steps;
};

export type QuickActionProblem =
  "empty" | "not_list" | "bad_step" | "missing_action" | "unknown_action";

export type QuickActionValidation =
  | { ok: true; sequence: unknown[] }
  | { ok: false; problem: QuickActionProblem; step?: number };

/**
 * A first check before the sequence is sent: a non-empty list of steps whose
 * actions exist on this instance. The server checks the rest when it runs.
 */
export const validateSequence = (
  value: unknown,
  services: ServiceIndex
): QuickActionValidation => {
  const list =
    value === undefined || value === null
      ? []
      : Array.isArray(value)
        ? value
        : isPlainObject(value) && Object.keys(value).length > 0
          ? [value]
          : isPlainObject(value)
            ? []
            : undefined;
  if (list === undefined) {
    return { ok: false, problem: "not_list" };
  }
  if (list.length === 0) {
    return { ok: false, problem: "empty" };
  }
  for (let index = 0; index < list.length; index++) {
    const item = list[index];
    if (!isPlainObject(item) || Object.keys(item).length === 0) {
      return { ok: false, problem: "bad_step", step: index + 1 };
    }
    const name = item.action ?? item.service;
    if ("action" in item || "service" in item) {
      if (typeof name !== "string" || name === "") {
        return { ok: false, problem: "missing_action", step: index + 1 };
      }
      const [domain, service] = name.split(".", 2);
      if (
        !name.includes("{") &&
        (!service || !has(services, domain, service))
      ) {
        return { ok: false, problem: "unknown_action", step: index + 1 };
      }
    }
  }
  return { ok: true, sequence: list };
};

/** Every guided step is filled in enough to run. */
export const stepsAreComplete = (steps: QuickStep[]): boolean =>
  steps.length > 0 &&
  steps.every((step) =>
    step.kind === "wait"
      ? step.seconds >= 0
      : step.action !== "" && !isEmptyTarget(step.target)
  );

interface ServiceCallSummary {
  action: string;
  entityIds: string[];
  /** The target also names areas, devices, floors, labels or templates. */
  unresolved: boolean;
}

const NESTED_KEYS = ["sequence", "then", "else", "default", "parallel"];

const collectCalls = (value: unknown, calls: ServiceCallSummary[]) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCalls(item, calls));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  const name = value.action ?? value.service;
  if (typeof name === "string") {
    const target = isPlainObject(value.target)
      ? (value.target as Record<string, unknown>)
      : {};
    const data = isPlainObject(value.data)
      ? (value.data as Record<string, unknown>)
      : {};
    const raw = [
      ...(ensureArray(target.entity_id as unknown) ?? []),
      ...(ensureArray(value.entity_id as unknown) ?? []),
      ...(ensureArray(data.entity_id as unknown) ?? []),
    ];
    const entityIds = raw
      .filter((id): id is string => typeof id === "string")
      .flatMap((id) => id.split(","))
      .map((id) => id.trim().toLowerCase())
      .filter(isValidEntityId);
    const unresolved =
      raw.length !== entityIds.length ||
      raw.some((id) => typeof id === "string" && id.includes(",")) ||
      ["device_id", "area_id", "floor_id", "label_id"].some(
        (key) => target[key] !== undefined || data[key] !== undefined
      ) ||
      name.includes("{");
    calls.push({ action: name, entityIds, unresolved });
  }
  for (const key of NESTED_KEYS) {
    if (key in value) {
      collectCalls(value[key], calls);
    }
  }
  if (Array.isArray(value.choose)) {
    collectCalls(value.choose, calls);
  }
  if (isPlainObject(value.repeat)) {
    collectCalls(value.repeat.sequence, calls);
  }
};

/** Every action call in a sequence, nested ones included. */
export const sequenceServiceCalls = (
  sequence: unknown
): ServiceCallSummary[] => {
  const calls: ServiceCallSummary[] = [];
  collectCalls(sequence, calls);
  return calls;
};

/**
 * Whether running the sequence must ask first: any step targets a risky
 * entity, calls an action of a risky domain, or reaches entities the page
 * cannot list in a domain that can open a door or a lock.
 */
export const isRiskySequence = (
  sequence: unknown,
  isRiskyEntityId: (entityId: string) => boolean
): boolean =>
  sequenceServiceCalls(sequence).some((call) => {
    const domain = domainOf(call.action);
    return (
      RISKY_ACTION_DOMAINS.has(domain) ||
      call.entityIds.some(isRiskyEntityId) ||
      (call.unresolved && MAY_REACH_RISKY_DOMAINS.has(domain))
    );
  });

export const moveStep = <T>(steps: T[], index: number, offset: number): T[] => {
  const to = index + offset;
  if (index < 0 || index >= steps.length || to < 0 || to >= steps.length) {
    return steps;
  }
  const next = [...steps];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
};

export const duplicateStep = (
  steps: QuickStep[],
  index: number
): QuickStep[] => {
  if (index < 0 || index >= steps.length) {
    return steps;
  }
  const next = [...steps];
  next.splice(index + 1, 0, structuredClone(steps[index]));
  return next;
};

export const removeStep = <T>(steps: T[], index: number): T[] =>
  steps.filter((_step, position) => position !== index);
