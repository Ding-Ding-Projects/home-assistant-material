import type { ManualAutomationConfig } from "../../../../data/automation";
import type { HomeAssistant } from "../../../../types";
import type {
  DryRunReason,
  DryRunResult,
  DryRunVerdict,
} from "../automation-dry-run";
import { dryRunAutomation } from "../automation-dry-run";
import { buildFlowGraph } from "./flow-graph";
import { resolveStepPath } from "./find-step-row";
import type { Situation } from "./simulate";
import { buildSimulationHass } from "./simulate";
import { isRec } from "./step-model";

/**
 * Saved test cases for one automation: a named situation and the steps that
 * should or should not run in it. A case is evaluated with the simulator's
 * dry run, so nothing is executed. Steps the simulation cannot judge make a
 * case "cannot tell" and never count as covered.
 */

export interface TestCase {
  id: string;
  name: string;
  situation: Situation;
  /** Paths of steps (or branches) that should run in the situation. */
  expectRun: string[];
  /** Paths of steps (or branches) that should not run in the situation. */
  expectSkip: string[];
}

export type CaseStatus = "passed" | "failed" | "cannot_tell";

export interface PathOutcome {
  verdict: DryRunVerdict;
  reason?: DryRunReason;
}

export interface CaseMismatch {
  path: string;
  expected: "run" | "skip";
  actual: DryRunVerdict | "missing";
}

export interface CaseResult {
  status: CaseStatus;
  outcomes: Record<string, PathOutcome>;
  mismatches: CaseMismatch[];
}

export const STORAGE_PREFIX = "automation-test-cases-";

export const storageKeyFor = (automationId: string) =>
  `${STORAGE_PREFIX}${automationId}`;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/** Reads stored cases defensively; anything that does not fit is dropped. */
export const parseStoredCases = (value: unknown): TestCase[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const cases: TestCase[] = [];
  for (const raw of value) {
    if (
      !isRec(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.name !== "string" ||
      !isRec(raw.situation) ||
      typeof raw.situation.time !== "string" ||
      !Array.isArray(raw.situation.overrides) ||
      !isStringList(raw.expectRun) ||
      !isStringList(raw.expectSkip)
    ) {
      continue;
    }
    const overrides = raw.situation.overrides.filter(
      (o): o is { entityId: string; state: string } =>
        isRec(o) &&
        typeof o.entityId === "string" &&
        typeof o.state === "string"
    );
    const weekday = raw.situation.weekday;
    cases.push({
      id: raw.id,
      name: raw.name,
      situation: {
        time: raw.situation.time,
        overrides,
        ...(typeof raw.situation.triggerId === "string"
          ? { triggerId: raw.situation.triggerId }
          : {}),
        ...(typeof weekday === "number" && weekday >= 0 && weekday <= 6
          ? { weekday }
          : {}),
      },
      expectRun: raw.expectRun,
      expectSkip: raw.expectSkip,
    });
  }
  return cases;
};

/** The cases as JSON to carry with the automation. */
export const exportCases = (alias: string | undefined, cases: TestCase[]) =>
  JSON.stringify({ version: 1, automation: alias ?? "", cases }, null, 2);

export type CoverageKind =
  "condition_pass" | "condition_fail" | "branch" | "step";

export interface CoverageItem {
  /** The flow graph path; condition outcomes share the path of the condition. */
  path: string;
  kind: CoverageKind;
  /** The path of the step that owns a branch, when it has one. */
  parent?: string;
}

/** Where each step of the configuration sits, so dry run steps can be matched. */
export interface PathIndex {
  items: CoverageItem[];
  /** Every path a case may expect something of. */
  paths: Set<string>;
  byObject: Map<object, string>;
  byBranch: Map<object, Partial<Record<"then" | "else" | "default", string>>>;
  /** How many conditions the automation lists at its top level. */
  topConditions: number;
}

export const buildPathIndex = (config: unknown): PathIndex => {
  const graph = buildFlowGraph(config);
  const index: PathIndex = {
    items: [],
    paths: new Set(),
    byObject: new Map(),
    byBranch: new Map(),
    topConditions: 0,
  };
  for (const node of graph.nodes) {
    if (node.role === "trigger") {
      continue;
    }
    index.paths.add(node.path);
    const object = resolveStepPath(config, node.path);
    const last = node.path.split("/").pop()!;
    if (node.role === "branch") {
      const segments = node.path.split("/");
      const parent = segments.slice(0, /^\d+$/.test(last) ? -2 : -1).join("/");
      index.items.push({ path: node.path, kind: "branch", parent });
      if (/^\d+$/.test(last)) {
        if (isRec(object)) {
          index.byObject.set(object, node.path);
        }
      } else if (isRec(object)) {
        const known = index.byBranch.get(object) ?? {};
        known[last as "then" | "else" | "default"] = node.path;
        index.byBranch.set(object, known);
      }
    } else if (node.role === "condition") {
      index.topConditions++;
      index.items.push({ path: node.path, kind: "condition_pass" });
      index.items.push({ path: node.path, kind: "condition_fail" });
      if (isRec(object)) {
        index.byObject.set(object, node.path);
      }
    } else {
      index.items.push({ path: node.path, kind: "step" });
      if (isRec(object)) {
        index.byObject.set(object, node.path);
      }
    }
  }
  return index;
};

/** Turns the steps of a dry run into a verdict for each path of the index. */
export const outcomesOf = (
  index: PathIndex,
  result: DryRunResult
): Record<string, PathOutcome> => {
  const outcomes: Record<string, PathOutcome> = {};
  let topCondition = 0;
  for (const step of result.steps) {
    const item = step.item as unknown;
    let path: string | undefined;
    if (isRec(item)) {
      path =
        step.kind === "then" || step.kind === "else" || step.kind === "default"
          ? index.byBranch.get(item)?.[step.kind]
          : index.byObject.get(item);
    }
    // The dry run lists the top level conditions first, one step each.
    if (
      step.section === "condition" &&
      step.depth === 0 &&
      topCondition < index.topConditions
    ) {
      path ??= `condition/${topCondition}`;
      topCondition++;
    }
    if (path !== undefined && index.paths.has(path)) {
      outcomes[path] = { verdict: step.verdict, reason: step.reason };
    }
  }
  // A step the run never lists lies inside a branch that was not taken.
  for (const path of index.paths) {
    if (!(path in outcomes)) {
      outcomes[path] = { verdict: "would_skip", reason: "branch_not_taken" };
    }
  }
  return outcomes;
};

/** Compares what a case expects with what the dry run decided. */
export const judgeCase = (
  testCase: Pick<TestCase, "expectRun" | "expectSkip">,
  paths: Set<string>,
  outcomes: Record<string, PathOutcome>
): CaseResult => {
  const mismatches: CaseMismatch[] = [];
  let unknown = false;
  const check = (path: string, expected: "run" | "skip") => {
    if (!paths.has(path)) {
      mismatches.push({ path, expected, actual: "missing" });
      return;
    }
    const verdict = outcomes[path]?.verdict ?? "would_skip";
    if (verdict === "cannot_tell") {
      unknown = true;
    } else if ((verdict === "would_run") !== (expected === "run")) {
      mismatches.push({ path, expected, actual: verdict });
    }
  };
  testCase.expectRun.forEach((path) => check(path, "run"));
  testCase.expectSkip.forEach((path) => check(path, "skip"));
  const none = !testCase.expectRun.length && !testCase.expectSkip.length;
  return {
    status: mismatches.length
      ? "failed"
      : unknown || none
        ? "cannot_tell"
        : "passed",
    outcomes,
    mismatches,
  };
};

/** Evaluates one case against the automation as it is on screen. */
export const evaluateTestCase = async (
  hass: Pick<HomeAssistant, "states" | "callWS">,
  config: ManualAutomationConfig,
  index: PathIndex,
  testCase: TestCase
): Promise<CaseResult> => {
  const simulated = buildSimulationHass(hass.states, testCase.situation);
  const result = await dryRunAutomation(simulated, {
    conditions: config.conditions ?? config.condition ?? [],
    actions: config.actions ?? config.action ?? [],
  });
  return judgeCase(testCase, index.paths, outcomesOf(index, result));
};

export type CoverageState = "covered" | "cannot_tell" | "untested";

export interface CoverageRow extends CoverageItem {
  state: CoverageState;
  /** How many passing cases reach it. */
  tests: number;
}

const reaches = (item: CoverageItem, outcome?: PathOutcome): boolean => {
  if (!outcome) {
    return false;
  }
  if (item.kind === "condition_fail") {
    return (
      outcome.verdict === "would_skip" && outcome.reason === "conditions_fail"
    );
  }
  return outcome.verdict === "would_run";
};

/**
 * Marks each branch and step as covered by at least one passing case, as
 * undecidable when only undecidable evidence exists, or as untested.
 */
export const computeCoverage = (
  items: CoverageItem[],
  results: CaseResult[]
): CoverageRow[] =>
  items.map((item) => {
    const tests = results.filter(
      (r) => r.status === "passed" && reaches(item, r.outcomes[item.path])
    ).length;
    if (tests > 0) {
      return { ...item, state: "covered", tests };
    }
    const unknown = results.some(
      (r) => r.outcomes[item.path]?.verdict === "cannot_tell"
    );
    return { ...item, state: unknown ? "cannot_tell" : "untested", tests: 0 };
  });

export interface CoverageSummary {
  branches: number;
  branchesCovered: number;
  steps: number;
  stepsCovered: number;
}

export const summarizeCoverage = (rows: CoverageRow[]): CoverageSummary => {
  const summary: CoverageSummary = {
    branches: 0,
    branchesCovered: 0,
    steps: 0,
    stepsCovered: 0,
  };
  for (const row of rows) {
    if (row.kind === "step") {
      summary.steps++;
      summary.stepsCovered += row.state === "covered" ? 1 : 0;
    } else {
      summary.branches++;
      summary.branchesCovered += row.state === "covered" ? 1 : 0;
    }
  }
  return summary;
};
