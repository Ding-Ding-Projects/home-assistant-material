import {
  actionKind,
  asList,
  childLists,
  configParts,
  expandCondition,
  isRec,
  stepTitle,
  str,
} from "./step-model";

/**
 * Which triggers feed which branch, and which steps each trigger can reach,
 * read from the configuration alone. A step is gated by a trigger id when a
 * condition on the way to it tests `trigger.id`: a trigger condition, or a
 * template that only compares `trigger.id`. Anything the reading cannot be
 * sure about (a `not`, a mixed template) leaves the step open to every
 * trigger, so the result is always the set of steps a trigger can reach.
 */

/** A set of trigger ids a gate accepts, or undefined when it accepts any. */
type Restriction = ReadonlySet<string> | undefined;

const and = (a: Restriction, b: Restriction): Restriction => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return new Set([...a].filter((id) => b.has(id)));
};

const or = (parts: Restriction[]): Restriction => {
  if (!parts.length || parts.some((part) => !part)) {
    return undefined;
  }
  const union = new Set<string>();
  for (const part of parts) {
    part!.forEach((id) => union.add(id));
  }
  return union;
};

const QUOTED = `(?:'([^']*)'|"([^"]*)")`;
const EQUALS = new RegExp(`^trigger\\.id\\s*==\\s*${QUOTED}$`);
const IN_LIST = /^trigger\.id\s+in\s+\[([^\]]*)\]$/;

const idsOfList = (inner: string): string[] =>
  [...inner.matchAll(new RegExp(QUOTED, "g"))].map((m) => m[1] ?? m[2]);

/** The ids a template accepts, when it only compares `trigger.id`. */
export const templateTriggerIds = (template: string): Restriction => {
  const text = template
    .trim()
    .replace(/^\{\{-?/, "")
    .replace(/-?\}\}$/, "")
    .trim();
  if (!text || text.includes("{{") || text.includes("{%")) {
    return undefined;
  }
  const parts: Restriction[] = text.split(/\s+or\s+/).map((part) => {
    const trimmed = part.trim();
    const eq = EQUALS.exec(trimmed);
    if (eq) {
      return new Set([eq[1] ?? eq[2]]);
    }
    const list = IN_LIST.exec(trimmed);
    return list ? new Set(idsOfList(list[1])) : undefined;
  });
  return or(parts);
};

/** The ids one condition accepts, or undefined when it accepts any trigger. */
export const conditionTriggerIds = (raw: unknown): Restriction => {
  if (typeof raw === "string") {
    return templateTriggerIds(raw);
  }
  if (!isRec(raw)) {
    return undefined;
  }
  const cond = expandCondition(raw);
  switch (str(cond.condition)) {
    case "trigger": {
      const ids = asList(cond.id).filter(
        (id): id is string => typeof id === "string"
      );
      return ids.length ? new Set(ids) : undefined;
    }
    case "template":
      return typeof cond.value_template === "string"
        ? templateTriggerIds(cond.value_template)
        : undefined;
    case "and":
      return listTriggerIds(asList(cond.conditions));
    case "or":
      return or(asList(cond.conditions).map(conditionTriggerIds));
    default:
      return undefined;
  }
};

/** Conditions in a list must all pass, so their restrictions are combined. */
export const listTriggerIds = (conditions: unknown[]): Restriction =>
  conditions.reduce<Restriction>(
    (acc, cond) => and(acc, conditionTriggerIds(cond)),
    undefined
  );

export interface RelationTrigger {
  index: number;
  id?: string;
  title: string;
  disabled: boolean;
}

export interface RelationStep {
  /** The path of the step, as in a stored trace. */
  path: string;
  kind: string;
  title: string;
  depth: number;
  /** Indexes of the triggers that can reach the step. */
  triggers: number[];
  /** True when a trigger id condition limits who can reach the step. */
  gated: boolean;
  /** The step as configured. */
  raw: unknown;
}

export interface RelationBranch {
  /** The path of the branch: an option of a choose, or then of an if. */
  path: string;
  /** The path of the step that owns the branch. */
  owner: string;
  label: string;
  /** Trigger ids its conditions test, when they test any. */
  ids?: string[];
  /** Indexes of the triggers that feed the branch. */
  triggers: number[];
  steps: number;
}

export interface TriggerRelations {
  triggers: RelationTrigger[];
  steps: RelationStep[];
  branches: RelationBranch[];
  /** Ids that conditions test but no trigger defines. */
  missingIds: string[];
}

const allowed = (
  triggers: RelationTrigger[],
  restriction: Restriction
): number[] =>
  triggers
    .filter(
      (t) => !restriction || (t.id !== undefined && restriction.has(t.id))
    )
    .map((t) => t.index);

const countSteps = (items: unknown[]): number => {
  let total = 0;
  for (const raw of items) {
    total += 1;
    if (isRec(raw)) {
      for (const list of childLists(raw, actionKind(raw))) {
        total += countSteps(list.items);
      }
    }
  }
  return total;
};

export const analyseRelations = (config: unknown): TriggerRelations => {
  const parts = configParts(config);
  const triggers: RelationTrigger[] = parts.triggers.map((raw, index) => ({
    index,
    id: str(raw.id),
    title: stepTitle({
      path: `trigger/${index}`,
      kind: "trigger",
      section: "trigger",
      depth: 0,
      raw,
    }),
    disabled: raw.enabled === false,
  }));

  const steps: RelationStep[] = [];
  const branches: RelationBranch[] = [];
  const tested = new Set<string>();
  const note = (restriction: Restriction) =>
    restriction?.forEach((id) => tested.add(id));

  const gate = listTriggerIds(parts.conditions);
  note(gate);

  const walk = (
    items: unknown[],
    prefix: string,
    depth: number,
    outer: Restriction
  ) => {
    let current = outer;
    items.forEach((raw, index) => {
      const path = `${prefix}/${index}`;
      const kind = actionKind(raw);
      steps.push({
        path,
        kind,
        title: stepTitle({ path, kind, section: "action", depth, raw }),
        depth,
        triggers: allowed(triggers, current),
        gated: current !== undefined,
        raw,
      });
      if (kind === "condition") {
        const own = conditionTriggerIds(raw);
        note(own);
        current = and(current, own);
      }
      if (!isRec(raw)) {
        return;
      }
      for (const list of childLists(raw, kind)) {
        const own = list.conditions
          ? listTriggerIds(list.conditions)
          : undefined;
        note(own);
        const inner = and(current, own);
        const branchPath = `${path}/${list.key.replace(/\/sequence$/, "")}`;
        if (list.conditions && (own || kind === "choose")) {
          branches.push({
            path: branchPath,
            owner: path,
            label: list.label,
            ids: own ? [...own] : undefined,
            triggers: allowed(triggers, inner),
            steps: countSteps(list.items),
          });
        }
        walk(list.items, `${path}/${list.key}`, depth + 1, inner);
      }
    });
  };
  walk(parts.actions, "action", 0, gate);

  const defined = new Set(
    triggers.map((t) => t.id).filter((id): id is string => !!id)
  );
  return {
    triggers,
    steps,
    branches,
    missingIds: [...tested].filter((id) => !defined.has(id)).sort(),
  };
};

/** Steps a trigger can reach, in reading order. */
export const stepsReachedBy = (
  relations: TriggerRelations,
  triggerIndex: number
): RelationStep[] =>
  relations.steps.filter((step) => step.triggers.includes(triggerIndex));

/** Triggers that can reach a step, for the chips on its row. */
export const triggersReaching = (
  relations: TriggerRelations,
  path: string
): RelationTrigger[] => {
  const step = relations.steps.find((s) => s.path === path);
  if (!step) {
    return [];
  }
  return step.triggers.map((i) => relations.triggers[i]);
};
