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

/** The conditions of an option as the server tests them (never `enabled`). */
export const getTestableConditions = (option: Option): (Condition | string)[] =>
  ensureArray<Condition | string>(option.conditions ?? []).map((condition) => {
    if (typeof condition === "string") {
      return condition;
    }
    const { enabled: _enabled, ...tested } = condition;
    return tested;
  });

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
