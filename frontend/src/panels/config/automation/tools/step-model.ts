/**
 * A small, loosely typed reading of an automation configuration, shared by the
 * automation tools. It never changes the configuration it reads. Paths follow
 * the convention of stored traces: `trigger/0`, `condition/1`, `action/2`,
 * `action/2/choose/0/sequence/1`, `action/2/default/0`, `action/3/then/0`.
 */

export type Rec = Record<string, unknown>;

export type StepKind =
  | "trigger"
  | "condition"
  | "service"
  | "choose"
  | "if"
  | "repeat"
  | "sequence"
  | "parallel"
  | "delay"
  | "wait_template"
  | "wait_for_trigger"
  | "event"
  | "variables"
  | "stop"
  | "device"
  | "scene"
  | "other";

export const isRec = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asList = (value: unknown): unknown[] => {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

export const str = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/** The config keys a configuration may use, old and new spelling. */
export const configParts = (config: unknown) => {
  const c: Rec = isRec(config) ? config : {};
  return {
    triggers: flattenTriggerList(c.triggers ?? c.trigger),
    conditions: asList(c.conditions ?? c.condition),
    actions: asList(c.actions ?? c.action),
  };
};

/** Triggers can be grouped in a list under a `triggers` key. */
export const flattenTriggerList = (value: unknown): Rec[] => {
  const out: Rec[] = [];
  for (const item of asList(value)) {
    if (!isRec(item)) {
      continue;
    }
    if ("triggers" in item) {
      out.push(...flattenTriggerList(item.triggers));
    } else {
      out.push(item);
    }
  }
  return out;
};

export const triggerType = (trigger: Rec): string =>
  str(trigger.trigger) ?? str(trigger.platform) ?? "unknown";

/** Turns a shorthand condition into the long form. */
export const expandCondition = (cond: unknown): Rec => {
  if (typeof cond === "string") {
    return { condition: "template", value_template: cond };
  }
  if (!isRec(cond)) {
    return { condition: "unknown" };
  }
  if (Array.isArray(cond.condition)) {
    return { condition: "and", conditions: cond.condition };
  }
  for (const key of ["and", "or", "not"]) {
    if (key in cond && !("condition" in cond)) {
      return { condition: key, conditions: cond[key] };
    }
  }
  return cond;
};

export const conditionType = (cond: Rec): string =>
  str(cond.condition) ?? "unknown";

const ACTION_KEYS: [string, StepKind][] = [
  ["delay", "delay"],
  ["wait_template", "wait_template"],
  ["event", "event"],
  ["repeat", "repeat"],
  ["choose", "choose"],
  ["if", "if"],
  ["wait_for_trigger", "wait_for_trigger"],
  ["variables", "variables"],
  ["stop", "stop"],
  ["sequence", "sequence"],
  ["parallel", "parallel"],
  ["scene", "scene"],
];

export const actionKind = (action: unknown): StepKind => {
  if (typeof action === "string") {
    return "condition";
  }
  if (!isRec(action)) {
    return "other";
  }
  if (["condition", "and", "or", "not"].some((key) => key in action)) {
    return "condition";
  }
  for (const [key, kind] of ACTION_KEYS) {
    if (key in action) {
      return kind;
    }
  }
  if ("device_id" in action && "domain" in action && "type" in action) {
    return "device";
  }
  if (
    "action" in action ||
    "service" in action ||
    "service_template" in action
  ) {
    return "service";
  }
  return "other";
};

export const isDisabled = (item: unknown): boolean =>
  isRec(item) && item.enabled === false;

/** Entity ids named by a configuration fragment, from `entity_id` and `target`. */
export const entityIdsOf = (fragment: unknown): string[] => {
  if (!isRec(fragment)) {
    return [];
  }
  const found: string[] = [];
  const take = (value: unknown) => {
    for (const v of asList(value)) {
      if (typeof v === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(v)) {
        found.push(v);
      }
    }
  };
  take(fragment.entity_id);
  if (isRec(fragment.target)) {
    take(fragment.target.entity_id);
  }
  if (isRec(fragment.data)) {
    take(fragment.data.entity_id);
  }
  return found;
};

export const serviceOf = (action: Rec): string | undefined =>
  str(action.action) ?? str(action.service);

/** Child action lists of a compound action, with the path segment of each. */
export const childLists = (
  action: Rec,
  kind: StepKind
): {
  key: string;
  label: string;
  items: unknown[];
  conditions?: unknown[];
}[] => {
  switch (kind) {
    case "choose": {
      const out = asList(action.choose).map((option, index) => ({
        key: `choose/${index}/sequence`,
        label: `option:${index}`,
        items: isRec(option) ? asList(option.sequence) : [],
        conditions: isRec(option) ? asList(option.conditions) : [],
      }));
      if (action.default !== undefined) {
        out.push({
          key: "default",
          label: "default",
          items: asList(action.default),
          conditions: [],
        });
      }
      return out;
    }
    case "if":
      return [
        {
          key: "then",
          label: "then",
          items: asList(action.then),
          conditions: asList(action.if),
        },
        ...(action.else !== undefined
          ? [{ key: "else", label: "else", items: asList(action.else) }]
          : []),
      ];
    case "repeat":
      return isRec(action.repeat)
        ? [
            {
              key: "repeat/sequence",
              label: "repeat",
              items: asList(action.repeat.sequence),
            },
          ]
        : [];
    case "sequence":
      return [
        { key: "sequence", label: "sequence", items: asList(action.sequence) },
      ];
    case "parallel":
      return [
        { key: "parallel", label: "parallel", items: asList(action.parallel) },
      ];
    default:
      return [];
  }
};

export interface StepRef {
  path: string;
  kind: StepKind;
  section: "trigger" | "condition" | "action";
  depth: number;
  raw: unknown;
}

/**
 * Every trigger, condition and action of a configuration in reading order,
 * with the path each one has in a stored trace.
 */
export const listSteps = (config: unknown): StepRef[] => {
  const { triggers, conditions, actions } = configParts(config);
  const out: StepRef[] = [];
  triggers.forEach((raw, i) =>
    out.push({
      path: `trigger/${i}`,
      kind: "trigger",
      section: "trigger",
      depth: 0,
      raw,
    })
  );
  conditions.forEach((raw, i) =>
    out.push({
      path: `condition/${i}`,
      kind: "condition",
      section: "condition",
      depth: 0,
      raw,
    })
  );
  const walk = (items: unknown[], prefix: string, depth: number) => {
    items.forEach((raw, i) => {
      const path = `${prefix}/${i}`;
      const kind = actionKind(raw);
      out.push({ path, kind, section: "action", depth, raw });
      if (isRec(raw)) {
        for (const list of childLists(raw, kind)) {
          walk(list.items, `${path}/${list.key}`, depth + 1);
        }
      }
    });
  };
  walk(actions, "action", 0);
  return out;
};

/** Short, untranslated description of a step built from its own configuration. */
export const stepTitle = (ref: StepRef): string => {
  const raw = ref.raw;
  if (!isRec(raw)) {
    return typeof raw === "string" ? raw : ref.kind;
  }
  const alias = str(raw.alias);
  if (alias) {
    return alias;
  }
  if (ref.section === "trigger") {
    return triggerType(raw);
  }
  if (ref.section === "condition" || ref.kind === "condition") {
    return conditionType(expandCondition(raw));
  }
  if (ref.kind === "service") {
    return serviceOf(raw) ?? "service";
  }
  return ref.kind;
};

export const stepDetail = (ref: StepRef): string | undefined => {
  const raw = ref.raw;
  if (!isRec(raw)) {
    return undefined;
  }
  const entities = entityIdsOf(raw);
  if (entities.length) {
    return (
      entities.slice(0, 3).join(", ") + (entities.length > 3 ? ", ..." : "")
    );
  }
  return undefined;
};
