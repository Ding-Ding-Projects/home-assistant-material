import type { Condition, Trigger } from "../../data/automation";
import { migrateAutomationTrigger } from "../../data/automation";
import { describeCondition, describeTrigger } from "../../data/automation_i18n";
import type { EntityRegistryEntry } from "../../data/entity/entity_registry";
import type { DomainManifestLookup } from "../../data/integration";
import type { Action } from "../../data/script";
import { describeAction } from "../../data/script_i18n";
import type { TraceExtended } from "../../data/trace";
import type { HomeAssistant } from "../../types";
import type { NodeInfo } from "./hat-script-graph";

/** How a step of a run turned out. */
export type TraceStepState =
  "succeeded" | "failed" | "error" | "not_triggered" | "skipped" | "not_run";

/** What a person reads for a step, in the words of the editor. */
export const describeTraceStep = (
  hass: HomeAssistant,
  entityRegistry: EntityRegistryEntry[] | undefined,
  manifests: DomainManifestLookup | undefined,
  node: NodeInfo
): string => {
  const config = (node.config ?? {}) as Record<string, any>;
  if (typeof config.alias === "string" && config.alias) {
    return config.alias;
  }
  const registry = entityRegistry ?? [];
  try {
    switch (node.type) {
      case "trigger":
        return describeTrigger(
          migrateAutomationTrigger({
            ...config,
          } as unknown as Trigger) as Trigger,
          hass,
          registry
        );
      case "condition":
        return describeCondition(config as Condition, hass, registry);
      case "action":
        return describeAction(
          hass,
          registry,
          config as Action,
          undefined,
          undefined,
          manifests
        );
      case "chooseOption":
        return hass.localize(
          "ui.panel.config.automation.editor.actions.type.choose.option",
          { number: node.path.split("/").pop() ?? "" }
        );
    }
  } catch (_err) {
    // A step the editor cannot describe is named by its position below.
  }
  return node.path;
};

/** The outcome of one step, read from the records the run left. */
export const getTraceStepState = (
  trace: TraceExtended,
  node: NodeInfo
): TraceStepState => {
  const records = trace.trace[node.path];
  if (!records?.length) {
    return "not_run";
  }
  if (records.some((record) => (record as any).result?.enabled === false)) {
    return "skipped";
  }
  if (records.some((record) => record.error)) {
    return "error";
  }
  if (node.type === "trigger" && trace.not_triggered) {
    return "not_triggered";
  }
  const isCondition =
    node.type === "condition" ||
    (!!node.config &&
      typeof node.config === "object" &&
      "condition" in node.config);
  if (
    isCondition &&
    records.some((record) => (record as any).result?.result === false)
  ) {
    return "failed";
  }
  return "succeeded";
};

/** Whether a condition step passed: `undefined` for a step that is not one. */
export const conditionResult = (
  trace: TraceExtended,
  node: NodeInfo
): boolean | undefined => {
  if (node.type !== "condition") {
    return undefined;
  }
  const records = trace.trace[node.path];
  if (!records?.length) {
    return undefined;
  }
  return !records.some((record) => (record as any).result?.result === false);
};

/** Seconds a step took: until the next step began, or the run ended. */
export const stepDurationSeconds = (
  trace: TraceExtended,
  trackedPaths: string[],
  path: string
): number | undefined => {
  const start = trace.trace[path]?.[0]?.timestamp;
  if (!start) {
    return undefined;
  }
  const next = trackedPaths[trackedPaths.indexOf(path) + 1];
  const end =
    (next && trace.trace[next]?.[0]?.timestamp) || trace.timestamp.finish;
  if (!end) {
    return undefined;
  }
  const seconds = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return seconds >= 0 ? seconds : undefined;
};
