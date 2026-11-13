import type { AutomationTraceExtended } from "../../../../data/trace";
import { getDataFromPath } from "../../../../data/trace";
import type { StepKind } from "./step-model";
import { actionKind, isRec, stepTitle, triggerType } from "./step-model";

/**
 * Turns one stored trace into rows for a timeline. Everything comes from the
 * trace the instance stored: the steps that ran, their timestamps and what each
 * one recorded. Nothing is estimated. A step that did not run has no row.
 */

export interface TraceFact {
  /** A translation key below `tools.trace.fact`, with its values. */
  key: string;
  values?: Record<string, string | number>;
}

export interface TraceRow {
  path: string;
  kind: StepKind;
  title: string;
  /** Milliseconds from this step to the next one, when both are known. */
  durationMs?: number;
  facts: TraceFact[];
  error?: string;
  /** Variables this step changed, as stored in the trace. */
  variables?: Record<string, unknown>;
  /** How many steps of the path were recorded; more than one inside a loop. */
  visit: number;
}

const rawAt = (config: unknown, path: string): unknown => {
  try {
    return getDataFromPath(config as AutomationTraceExtended["config"], path);
  } catch (_err) {
    return undefined;
  }
};

const kindOf = (path: string, raw: unknown): StepKind => {
  if (path === "trigger" || path.startsWith("trigger/")) {
    return "trigger";
  }
  if (path === "condition" || path.startsWith("condition/")) {
    return "condition";
  }
  return actionKind(raw);
};

const factsOf = (step: Record<string, unknown>): TraceFact[] => {
  const facts: TraceFact[] = [];
  const result = isRec(step.result) ? step.result : undefined;
  if (result) {
    if ("choice" in result) {
      facts.push({ key: "choice", values: { choice: String(result.choice) } });
    }
    if (typeof result.result === "boolean") {
      facts.push({ key: result.result ? "condition_true" : "condition_false" });
    } else if ("result" in result && result.result === null) {
      facts.push({ key: "disabled" });
    }
    if (isRec(result.params)) {
      facts.push({
        key: "params",
        values: { count: Object.keys(result.params).length },
      });
    }
    if (isRec(result) && "delay" in result) {
      facts.push({ key: "delay", values: { seconds: String(result.delay) } });
    }
    if (typeof result.stop === "string") {
      facts.push({ key: "stop", values: { reason: result.stop } });
    }
    if (result.timeout === true) {
      facts.push({ key: "timeout" });
    }
    if (typeof result.reason === "string") {
      facts.push({ key: "not_triggered", values: { reason: result.reason } });
    }
  }
  const vars = isRec(step.changed_variables)
    ? step.changed_variables
    : undefined;
  if (
    vars &&
    isRec(vars.trigger) &&
    typeof vars.trigger.description === "string"
  ) {
    facts.push({
      key: "trigger_description",
      values: { description: vars.trigger.description },
    });
  }
  if (Array.isArray(step.template_errors) && step.template_errors.length) {
    facts.push({
      key: "template_error",
      values: { error: String(step.template_errors[0]) },
    });
  }
  return facts;
};

export const buildTraceRows = (
  trace: Pick<AutomationTraceExtended, "trace" | "config" | "timestamp">
): TraceRow[] => {
  const flat: {
    path: string;
    step: Record<string, unknown>;
    time: number;
    visit: number;
  }[] = [];
  for (const [path, steps] of Object.entries(trace.trace)) {
    steps.forEach((step, visit) => {
      const time = Date.parse(step.timestamp);
      if (!Number.isNaN(time)) {
        flat.push({
          path,
          step: step as unknown as Record<string, unknown>,
          time,
          visit,
        });
      }
    });
  }
  flat.sort((a, b) => a.time - b.time);
  const finish = trace.timestamp?.finish
    ? Date.parse(trace.timestamp.finish)
    : NaN;
  return flat.map((entry, index) => {
    const raw = rawAt(trace.config, entry.path);
    const kind = kindOf(entry.path, raw);
    const next =
      flat[index + 1]?.time ?? (Number.isNaN(finish) ? undefined : finish);
    let title = entry.path;
    if (raw !== undefined) {
      title =
        kind === "trigger" && isRec(raw)
          ? (str2(raw.alias) ?? triggerType(raw))
          : stepTitle({
              path: entry.path,
              kind,
              section:
                kind === "trigger"
                  ? "trigger"
                  : kind === "condition"
                    ? "condition"
                    : "action",
              depth: 0,
              raw,
            });
    }
    const variables = isRec(entry.step.changed_variables)
      ? entry.step.changed_variables
      : undefined;
    return {
      path: entry.path,
      kind,
      title,
      durationMs:
        next === undefined ? undefined : Math.max(0, next - entry.time),
      facts: factsOf(entry.step),
      error:
        typeof entry.step.error === "string" ? entry.step.error : undefined,
      variables,
      visit: entry.visit,
    };
  });
};

const str2 = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  }
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
};
