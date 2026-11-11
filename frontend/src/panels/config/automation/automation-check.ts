import { ensureArray } from "../../../common/array/ensure-array";
import type {
  Condition,
  ManualAutomationConfig,
} from "../../../data/automation";
import { testAllConditions } from "../../../data/automation";
import { validateConfig } from "../../../data/config";
import type { HomeAssistant } from "../../../types";

export type AutomationCheckResult =
  | {
      status: "invalid";
      part: "triggers" | "conditions" | "actions";
      message: string;
    }
  | { status: "ok"; conditions: "pass" | "fail" | "none" }
  | { status: "error"; message: string };

const PARTS = ["triggers", "conditions", "actions"] as const;

/**
 * Asks the server whether the automation as it is on screen is valid, and
 * whether its top-level conditions pass against the current state. This is the
 * only check the instance offers: nothing is run, no action is simulated and
 * nothing is saved.
 */
export const checkAutomation = async (
  hass: HomeAssistant,
  config: Pick<ManualAutomationConfig, "triggers" | "conditions" | "actions">
): Promise<AutomationCheckResult> => {
  const triggers = ensureArray(config.triggers ?? []);
  const conditions = ensureArray(config.conditions ?? []) as Condition[];
  const actions = ensureArray(config.actions ?? []);
  try {
    const validation = await validateConfig(hass, {
      triggers,
      conditions,
      actions,
    });
    for (const part of PARTS) {
      const entry = validation[part];
      if (!entry.valid) {
        return { status: "invalid", part, message: entry.error };
      }
    }
    if (!conditions.length) {
      return { status: "ok", conditions: "none" };
    }
    const { result } = await testAllConditions(hass, conditions);
    return { status: "ok", conditions: result ? "pass" : "fail" };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
};
