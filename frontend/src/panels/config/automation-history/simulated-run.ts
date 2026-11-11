import type { TestCase } from "./test-cases";

/**
 * A simulated run of one version of an automation against a test case.
 *
 * It reads the conditions of the version and works out, from the fake states
 * of the case alone, whether they would pass, then lists the actions that
 * would follow. It calls no service, reads no real state and changes nothing.
 * Conditions it cannot work out from fake states (time, sun, zone, templates,
 * devices, attributes) are reported as undecided, never guessed.
 */

export type TraceResult = "pass" | "fail" | "unknown";

export type TraceReason =
  | "disabled"
  | "no_state"
  | "not_a_number"
  | "limit_not_number"
  | "attribute"
  | "for"
  | "template"
  | "trigger_mismatch"
  | "empty_group"
  | "unsupported";

export interface ConditionTrace {
  depth: number;
  /** `state`, `numeric_state`, `and`, `or`, `not`, `trigger` or another kind. */
  kind: string;
  /** The entities the condition looks at, when it looks at any. */
  entityIds: string[];
  result: TraceResult;
  reason?: TraceReason;
}

export interface SimulatedAction {
  /** The name given to the action, or what it does. */
  label: string;
  /** `action`, `choose`, `if`, `repeat`, `delay`, ... */
  kind: string;
}

export interface SimulatedRun {
  /** Always true. Every surface that shows a run says so. */
  simulated: true;
  /** The result of all the conditions together. */
  outcome: TraceResult;
  trace: ConditionTrace[];
  /** What would run, in order. Empty unless the conditions pass. */
  actions: SimulatedAction[];
}

type Obj = Record<string, unknown>;

const MAX_DEPTH = 20;

const toArray = (value: unknown): unknown[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

const isObj = (value: unknown): value is Obj =>
  !!value && typeof value === "object" && !Array.isArray(value);

const entityList = (value: unknown): string[] =>
  toArray(value).filter((item): item is string => typeof item === "string");

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const allOf = (results: TraceResult[]): TraceResult =>
  results.includes("fail")
    ? "fail"
    : results.includes("unknown")
      ? "unknown"
      : "pass";

const anyOf = (results: TraceResult[]): TraceResult =>
  results.includes("pass")
    ? "pass"
    : results.includes("unknown")
      ? "unknown"
      : "fail";

/** The sub-conditions of a logical condition, in any of its written forms. */
const children = (node: Obj, kind: string): unknown[] | undefined => {
  if (node.condition === kind && "conditions" in node) {
    return toArray(node.conditions);
  }
  if (kind in node && node.condition === undefined) {
    return toArray(node[kind]);
  }
  return undefined;
};

class Evaluator {
  public trace: ConditionTrace[] = [];

  constructor(private _case: TestCase) {}

  public evaluate(node: unknown, depth: number): TraceResult {
    const result = this._evaluate(node, depth);
    // A disabled condition is skipped; on its own it counts as passing.
    return result === "disabled" ? "pass" : result;
  }

  /** Like `evaluate`, but tells a skipped (disabled) condition apart. */
  private _evaluate(node: unknown, depth: number): TraceResult | "disabled" {
    if (!isObj(node)) {
      return this._push(depth, "unknown", [], "unknown", "unsupported");
    }
    if (depth > MAX_DEPTH) {
      return this._push(depth, "unknown", [], "unknown", "unsupported");
    }
    const kind = typeof node.condition === "string" ? node.condition : "";
    if (node.enabled === false) {
      this._push(
        depth,
        kind || "group",
        entityList(node.entity_id),
        "pass",
        "disabled"
      );
      return "disabled";
    }
    // A bare list under `condition` is the shorthand for `and`.
    if (Array.isArray(node.condition)) {
      return this._group(depth, "and", node.condition);
    }
    for (const logical of ["and", "or", "not"] as const) {
      const list = children(node, logical);
      if (list) {
        return this._group(depth, logical, list);
      }
    }
    switch (kind) {
      case "state":
        return this._state(node, depth);
      case "numeric_state":
        return this._numeric(node, depth);
      case "trigger":
        return this._trigger(node, depth);
      case "template":
        return this._push(depth, kind, [], "unknown", "template");
      default:
        return this._push(
          depth,
          kind || "unknown",
          entityList(node.entity_id),
          "unknown",
          "unsupported"
        );
    }
  }

  private _push(
    depth: number,
    kind: string,
    entityIds: string[],
    result: TraceResult,
    reason?: TraceReason
  ): TraceResult {
    this.trace.push({ depth, kind, entityIds, result, reason });
    return result;
  }

  private _group(depth: number, kind: string, items: unknown[]): TraceResult {
    // Reserve the line for the group so it reads before its members.
    const slot = this.trace.length;
    this.trace.push({
      depth,
      kind,
      entityIds: [],
      result: "unknown",
    });
    // Home Assistant ignores a disabled condition inside and, or and not.
    const results = items
      .map((item) => this._evaluate(item, depth + 1))
      .filter((item): item is TraceResult => item !== "disabled");
    let result: TraceResult;
    let reason: TraceReason | undefined;
    if (!results.length) {
      reason = "empty_group";
      result = kind === "or" ? "fail" : "pass";
    } else if (kind === "and") {
      result = allOf(results);
    } else if (kind === "or") {
      result = anyOf(results);
    } else {
      // `not` passes when none of its conditions pass.
      const inner = anyOf(results);
      result =
        inner === "pass" ? "fail" : inner === "fail" ? "pass" : "unknown";
    }
    this.trace[slot] = { depth, kind, entityIds: [], result, reason };
    return result;
  }

  private _state(node: Obj, depth: number): TraceResult {
    const ids = entityList(node.entity_id);
    if (node.attribute !== undefined) {
      return this._push(depth, "state", ids, "unknown", "attribute");
    }
    if (node.for !== undefined) {
      return this._push(depth, "state", ids, "unknown", "for");
    }
    const wanted = toArray(node.state).map((item) => String(item));
    const per = ids.map((id) => {
      const have = this._case.states[id];
      if (have === undefined) {
        return "missing" as const;
      }
      return wanted.includes(have) ? ("pass" as const) : ("fail" as const);
    });
    const missing = per.includes("missing");
    const flags = per.map((item) => item === "pass");
    const passed =
      ids.length > 0 &&
      (node.match === "any" ? flags.some(Boolean) : flags.every(Boolean));
    return this._push(
      depth,
      "state",
      ids,
      passed ? "pass" : "fail",
      !passed && missing ? "no_state" : undefined
    );
  }

  private _numeric(node: Obj, depth: number): TraceResult {
    const ids = entityList(node.entity_id);
    if (node.attribute !== undefined) {
      return this._push(depth, "numeric_state", ids, "unknown", "attribute");
    }
    if (node.value_template !== undefined) {
      return this._push(depth, "numeric_state", ids, "unknown", "template");
    }
    const above = node.above === undefined ? undefined : toNumber(node.above);
    const below = node.below === undefined ? undefined : toNumber(node.below);
    if (
      (node.above !== undefined && above === undefined) ||
      (node.below !== undefined && below === undefined)
    ) {
      // A limit that names another entity is not known from fake states.
      return this._push(
        depth,
        "numeric_state",
        ids,
        "unknown",
        "limit_not_number"
      );
    }
    let reason: TraceReason | undefined;
    const passed =
      ids.length > 0 &&
      ids.every((id) => {
        const have = this._case.states[id];
        if (have === undefined) {
          reason = "no_state";
          return false;
        }
        const value = toNumber(have);
        if (value === undefined) {
          reason = "not_a_number";
          return false;
        }
        return (
          (above === undefined || value > above) &&
          (below === undefined || value < below)
        );
      });
    return this._push(
      depth,
      "numeric_state",
      ids,
      passed ? "pass" : "fail",
      passed ? undefined : reason
    );
  }

  private _trigger(node: Obj, depth: number): TraceResult {
    const wanted = toArray(node.id).map((item) => String(item));
    const fired = this._case.trigger.id;
    const passed = fired !== "" && wanted.includes(fired);
    return this._push(
      depth,
      "trigger",
      [],
      passed ? "pass" : "fail",
      passed ? undefined : "trigger_mismatch"
    );
  }
}

const ACTION_KINDS = [
  "choose",
  "if",
  "repeat",
  "parallel",
  "sequence",
  "delay",
  "wait_template",
  "wait_for_trigger",
  "event",
  "variables",
  "stop",
  "set_conversation_response",
] as const;

const describeAction = (action: unknown): SimulatedAction | undefined => {
  if (!isObj(action) || action.enabled === false) {
    return undefined;
  }
  const alias = typeof action.alias === "string" ? action.alias : "";
  const named =
    typeof action.action === "string"
      ? action.action
      : typeof action.service === "string"
        ? action.service
        : "";
  if (named) {
    return { kind: "action", label: alias || named };
  }
  const kind = ACTION_KINDS.find((key) => key in action) ?? "other";
  return { kind, label: alias };
};

/**
 * Runs the conditions of `config` against the fake states of `testCase`.
 * `config` is the saved shape of an automation, with `conditions` and
 * `actions`, or the older `condition` and `action`.
 */
export const simulateRun = (
  config: Record<string, unknown>,
  testCase: TestCase
): SimulatedRun => {
  const conditions = toArray(config.conditions ?? config.condition).filter(
    Boolean
  );
  const evaluator = new Evaluator(testCase);
  const outcome = allOf(conditions.map((item) => evaluator.evaluate(item, 0)));
  const actions =
    outcome === "pass"
      ? toArray(config.actions ?? config.action)
          .map(describeAction)
          .filter((item): item is SimulatedAction => !!item)
      : [];
  return { simulated: true, outcome, trace: evaluator.trace, actions };
};

export type ComparisonVerdict = "match" | "mismatch" | "undecided";

/** Whether a simulated run did what the case expected of the conditions. */
export const compareToExpected = (
  run: Pick<SimulatedRun, "outcome">,
  expected: "pass" | "fail"
): ComparisonVerdict =>
  run.outcome === "unknown"
    ? "undecided"
    : run.outcome === expected
      ? "match"
      : "mismatch";
