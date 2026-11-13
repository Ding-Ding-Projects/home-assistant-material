import { hasTemplate } from "../../../common/string/has-template";

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const addIds = (value: unknown, into: Set<string>) => {
  if (typeof value === "string") {
    if (ENTITY_ID.test(value)) {
      into.add(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => addIds(item, into));
  }
};

/**
 * Entity IDs a trigger or condition watches, read from its `entity_id` and
 * `target.entity_id` fields. Templates are not evaluated here, so an entity
 * that only appears inside a template is not listed.
 */
export const watchedEntityIds = (config: unknown): string[] => {
  const ids = new Set<string>();
  if (isRecord(config)) {
    addIds(config.entity_id, ids);
    if (isRecord(config.target)) {
      addIds(config.target.entity_id, ids);
    }
  }
  return [...ids];
};

const TRIGGER_WORD = /\btrigger\b/;

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

export type ConditionVerdict = "pass" | "fail" | "unknown";

export type UnknownReason =
  "disabled" | "needs_trigger" | "template_error" | "server_error";

/**
 * Whether a condition can be tested on its own right now. A condition that
 * reads the trigger needs a real run, and a disabled one is not evaluated by
 * the automation either.
 */
export const conditionCannotBeJudged = (
  condition: unknown
): UnknownReason | undefined => {
  if (isRecord(condition)) {
    if (condition.enabled === false) {
      return "disabled";
    }
    if (condition.condition === "trigger") {
      return "needs_trigger";
    }
  }
  return readsTrigger(condition) ? "needs_trigger" : undefined;
};

export const MIN_REEVALUATE_MS = 5000;

/**
 * How long to wait before a condition may be tested again. Returns 0 when
 * the minimum gap since the last test has already passed.
 */
export const throttleDelay = (
  lastRun: number | undefined,
  now: number,
  minGap = MIN_REEVALUATE_MS
): number => {
  if (lastRun === undefined) {
    return 0;
  }
  return Math.max(0, lastRun + minGap - now);
};
