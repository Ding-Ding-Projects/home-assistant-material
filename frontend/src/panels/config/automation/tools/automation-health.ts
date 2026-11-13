import type {
  AutomationMigrationReport,
  ManualAutomationConfig,
} from "../../../../data/automation";
import { migrateAutomationConfig } from "../../../../data/automation";
import type { AutomationCheckResult } from "../automation-check";

export type HealthSeverity = "error" | "warning" | "suggestion";

export interface HealthFinding {
  id: string;
  severity: HealthSeverity;
  /** Points taken off the score. */
  penalty: number;
  /** Values for the finding's translated text. */
  values: Record<string, string | number>;
  /** A replacement configuration that resolves the finding, when one exists. */
  fix?: ManualAutomationConfig;
}

export interface HealthReport {
  score: number;
  findings: HealthFinding[];
  /** Checks that passed, by id. */
  passed: string[];
}

/** Points removed from 100 for each kind of finding. Shown to the user. */
export const HEALTH_PENALTIES = {
  invalid: 40,
  unavailable_entity: 10,
  unavailable_entity_cap: 30,
  deprecated: 10,
  no_conditions: 5,
  no_mode: 0,
} as const;

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

const collectEntityIds = (node: unknown, found: Set<string>, depth = 0) => {
  if (depth > 40 || node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectEntityIds(child, found, depth + 1));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "entity_id") {
      (Array.isArray(value) ? value : [value]).forEach((id) => {
        if (typeof id === "string" && ENTITY_ID.test(id)) {
          found.add(id);
        }
      });
    } else {
      collectEntityIds(value, found, depth + 1);
    }
  }
};

export const computeHealth = (
  config: ManualAutomationConfig,
  states: Record<string, { state: string } | undefined>,
  check?: AutomationCheckResult
): HealthReport => {
  const findings: HealthFinding[] = [];
  const passed: string[] = [];

  if (check?.status === "invalid") {
    findings.push({
      id: "invalid",
      severity: "error",
      penalty: HEALTH_PENALTIES.invalid,
      values: { part: check.part, message: check.message },
    });
  } else if (check?.status === "ok") {
    passed.push("valid");
  }

  const entities = new Set<string>();
  collectEntityIds(config, entities);
  let entityPenalty = 0;
  for (const id of [...entities].sort()) {
    const state = states[id]?.state;
    if (state === undefined || state === "unavailable") {
      const penalty = Math.min(
        HEALTH_PENALTIES.unavailable_entity,
        HEALTH_PENALTIES.unavailable_entity_cap - entityPenalty
      );
      entityPenalty += penalty;
      findings.push({
        id: "unavailable_entity",
        severity: "error",
        penalty,
        values: { entity: id, missing: state === undefined ? 1 : 0 },
      });
    }
  }
  if (entities.size && !findings.some((f) => f.id === "unavailable_entity")) {
    passed.push("entities");
  }

  const report: AutomationMigrationReport = { deprecated: false };
  const migrated = migrateAutomationConfig(
    JSON.parse(JSON.stringify(config)),
    report
  ) as ManualAutomationConfig;
  const legacyKeys = ["trigger", "condition", "action"].some(
    (key) => key in config
  );
  if (report.deprecated || legacyKeys) {
    findings.push({
      id: "deprecated",
      severity: "warning",
      penalty: HEALTH_PENALTIES.deprecated,
      values: {},
      fix: migrated,
    });
  } else {
    passed.push("current_syntax");
  }

  const conditions = config.conditions ?? config.condition;
  const hasConditions = Array.isArray(conditions)
    ? conditions.length > 0
    : !!conditions;
  if (hasConditions) {
    passed.push("conditions");
  } else {
    findings.push({
      id: "no_conditions",
      severity: "suggestion",
      penalty: HEALTH_PENALTIES.no_conditions,
      values: {},
    });
  }
  if (config.mode) {
    passed.push("mode");
  }

  const penalty = findings.reduce((sum, f) => sum + f.penalty, 0);
  return { score: Math.max(0, 100 - penalty), findings, passed };
};
