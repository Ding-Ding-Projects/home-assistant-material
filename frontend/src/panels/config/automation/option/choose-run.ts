import { ensureArray } from "../../../../common/array/ensure-array";
import type { Condition } from "../../../../data/automation";
import { testAllConditions } from "../../../../data/automation";
import { validateConfig } from "../../../../data/config";
import type { Action, Option } from "../../../../data/script";
import { callExecuteScript } from "../../../../data/service";
import type { HomeAssistant } from "../../../../types";

export type OptionTestResult =
  | { status: "pass" }
  | { status: "fail" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export type ChooseOutcome =
  | { kind: "option"; index: number }
  | { kind: "default" }
  | { kind: "none" }
  | { kind: "unknown"; index: number };

export type RunResult =
  | { status: "success" }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Decides which part of a Choose step runs, given the test result of every
 * option in order. The first option that passes wins; when none passes the
 * default actions run, if there are any. An option that cannot be tested
 * (invalid or failing to evaluate) makes the outcome unknown from that point,
 * because the automation would stop with an error there too.
 */
export const getChooseOutcome = (
  results: readonly OptionTestResult[],
  hasDefault: boolean
): ChooseOutcome => {
  for (let index = 0; index < results.length; index++) {
    const { status } = results[index];
    if (status === "pass") {
      return { kind: "option", index };
    }
    if (status !== "fail") {
      return { kind: "unknown", index };
    }
  }
  return hasDefault ? { kind: "default" } : { kind: "none" };
};

const isDisabled = (condition: unknown): boolean =>
  typeof condition === "object" &&
  condition !== null &&
  (condition as { enabled?: unknown }).enabled === false;

/**
 * Leaves out disabled children at every depth, as the automation engine skips
 * them. Children of and / or / not sit in `conditions` (or, in older configs,
 * a non-string `condition`). The `enabled` flag itself is never sent.
 */
const withoutDisabled = (condition: Condition | string): Condition | string => {
  if (typeof condition === "string") {
    return condition;
  }
  const { enabled: _enabled, ...rest } = condition as Condition &
    Record<string, unknown>;
  for (const key of ["conditions", "condition"]) {
    const children = rest[key];
    if (children && typeof children === "object") {
      rest[key] = ensureArray<Condition | string>(
        children as Condition | Condition[]
      )
        .filter((child) => !isDisabled(child))
        .map(withoutDisabled);
    }
  }
  return rest as Condition;
};

/**
 * The conditions of an option as the server should test them: a disabled
 * condition is left out, as the real automation skips it.
 */
export const getTestableConditions = (option: Option): (Condition | string)[] =>
  ensureArray<Condition | string>(option.conditions ?? [])
    .filter((condition) => !isDisabled(condition))
    .map(withoutDisabled);

/** A stable text form of a value, used to tell whether it was edited. */
export const getConfigKey = (value: unknown): string =>
  JSON.stringify(value ?? null);

/**
 * The part of an option a test result depends on. Editing the actions of an
 * option never changes whether it passes, so only conditions count here.
 */
export const getConditionsKey = (option: Option): string =>
  getConfigKey(getTestableConditions(option));

/**
 * True while the options on screen still carry exactly the conditions that
 * were tested, in the same order. A stored result must never describe a
 * config that is no longer shown.
 */
export const areTestResultsCurrent = (
  testedKeys: readonly string[],
  options: readonly Option[]
): boolean =>
  testedKeys.length === options.length &&
  options.every(
    (option, index) => getConditionsKey(option) === testedKeys[index]
  );

export type UnreachableReason =
  | { kind: "after_unconditional"; by: number }
  | { kind: "same_conditions"; by: number };

/** True when the server always treats the option's conditions as passing. */
const alwaysPasses = (option: Option): boolean =>
  getTestableConditions(option).length === 0;

/**
 * Finds options that can never be chosen, using the config alone:
 * - an option after one that always passes (no conditions, or every condition
 *   disabled), because the first passing option wins;
 * - an option whose conditions are identical to those of an earlier option,
 *   because both are evaluated against the same state.
 * Nothing is guessed: anything that depends on live state is left alone.
 */
export const getUnreachableOptions = (
  options: readonly Option[]
): Map<number, UnreachableReason> => {
  const result = new Map<number, UnreachableReason>();
  let firstAlwaysPasses: number | undefined;
  const seen = new Map<string, number>();
  options.forEach((option, index) => {
    if (firstAlwaysPasses !== undefined) {
      result.set(index, { kind: "after_unconditional", by: firstAlwaysPasses });
      return;
    }
    if (alwaysPasses(option)) {
      firstAlwaysPasses = index;
      return;
    }
    const key = getConditionsKey(option);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      result.set(index, { kind: "same_conditions", by: earlier });
      return;
    }
    seen.set(key, index);
  });
  return result;
};

/**
 * Checks right now whether every condition of an option passes. An option
 * without conditions always passes. Nothing is run and nothing is saved.
 */
export const testOption = async (
  hass: HomeAssistant,
  option: Option
): Promise<OptionTestResult> => {
  const conditions = getTestableConditions(option);
  if (!conditions.length) {
    return { status: "pass" };
  }
  try {
    const validation = await validateConfig(hass, {
      conditions: conditions as Condition[],
    });
    if (!validation.conditions.valid) {
      return { status: "invalid", message: validation.conditions.error };
    }
    const { result } = await testAllConditions(hass, conditions);
    return { status: result ? "pass" : "fail" };
  } catch (err: unknown) {
    return { status: "error", message: errorMessage(err) };
  }
};

/** Runs actions for real after the server has validated them. */
export const runActions = async (
  hass: HomeAssistant,
  actions: Action | Action[]
): Promise<RunResult> => {
  try {
    const validation = await validateConfig(hass, { actions });
    if (!validation.actions.valid) {
      return { status: "invalid", message: validation.actions.error };
    }
    await callExecuteScript(hass, actions);
    return { status: "success" };
  } catch (err: unknown) {
    return { status: "error", message: errorMessage(err) };
  }
};
