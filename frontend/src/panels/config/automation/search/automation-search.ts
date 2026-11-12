import { regexQuery, searchMatcher } from "../../../../common/regex/filter";
import { REGEX_LIMITS } from "../../../../common/regex/query";
import type { SearchQueryError } from "../../../../common/regex/query";

/**
 * Searching one automation or script that is being edited.
 *
 * Everything here is a pure function of the configuration and of a small
 * "resolver" that names things (friendly names, devices, areas, labels,
 * service names, the description shown on a row). The configuration is never
 * changed: this module only reads it.
 *
 * The configuration is flattened into addressed steps. A step is a trigger, a
 * condition, an action, a Choose option or the default actions of a Choose, at
 * any depth. Each step carries the text it can be found by, and the entities
 * it uses itself (not the entities its nested steps use; those belong to the
 * nested steps, so that "steps that use this entity" is exact).
 */

export type StepKind =
  "trigger" | "condition" | "action" | "option" | "default";

export interface SearchEntityRef {
  entityId: string;
  /** True when the entity was only found inside template text. */
  fromTemplate: boolean;
}

export interface SearchStep {
  /** Position in document order: triggers, conditions, then actions. */
  index: number;
  /** Where the step lives, for example `actions[2].choose[1].sequence[0]`. */
  path: string;
  /** The configuration object itself. Rows are matched to steps by identity. */
  item: object;
  kind: StepKind;
  parent?: SearchStep;
  children: SearchStep[];
  depth: number;
  /** What a person sees for this step: its description, else its type. */
  title: string;
  /** Each value the step can be found by. Patterns are tested against each. */
  fields: string[];
  /** Entities used by this step itself. */
  entities: SearchEntityRef[];
}

export interface SearchResolver {
  /** The description shown on the row, with the alias when there is one. */
  describe?: (
    kind: StepKind,
    item: Record<string, unknown>
  ) => string | undefined;
  /** The localized name of the step type. */
  typeLabel?: (
    kind: StepKind,
    item: Record<string, unknown>
  ) => string | undefined;
  /** Friendly name, device, area and label names of an entity. */
  entityTexts?: (entityId: string) => string[];
  deviceTexts?: (deviceId: string) => string[];
  areaTexts?: (areaId: string) => string[];
  floorTexts?: (floorId: string) => string[];
  labelTexts?: (labelId: string) => string[];
  /** Names of an action such as `light.turn_on`. */
  serviceTexts?: (service: string) => string[];
  /** Turns an entity registry id, as device triggers store it, into an entity id. */
  entityRegistryId?: (registryId: string) => string | undefined;
  /** Whether the entity exists in the state machine. */
  entityExists?: (entityId: string) => boolean;
}

export interface FlatConfig {
  steps: SearchStep[];
  byItem: Map<object, SearchStep>;
}

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asList = (value: unknown): unknown[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

/** Keys that hold nested steps. Their text belongs to the nested steps. */
const CHILD_KEYS = new Set([
  "choose",
  "default",
  "if",
  "then",
  "else",
  "parallel",
  "sequence",
  "conditions",
  "triggers",
  "wait_for_trigger",
]);

const REPEAT_CHILD_KEYS = new Set(["while", "until", "sequence"]);

const MAX_LEAVES = 400;
const MAX_DEPTH = 10;
/** Longest template text scanned for entities. */
const TEMPLATE_SCAN_LIMIT = 20000;
const MAX_TEMPLATE_ENTITIES = 100;

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

// Keys whose value has the shape of an entity id but names something else, for
// example the action `light.turn_on`.
const NOT_ENTITY_KEYS = new Set([
  "action",
  "service",
  "trigger",
  "platform",
  "condition",
  "event",
  "event_type",
  "domain",
  "alias",
  "note",
]);

const TEMPLATE_MARKER = /\{\{|\{%|\{#/;

// Each expression is linear in the text it reads and the text is cut to
// TEMPLATE_SCAN_LIMIT, so none of them can run long.
const TEMPLATE_CALL =
  /\b(?:states|is_state|state_attr|is_state_attr|has_value|state_translated|expand)\s*\(\s*(['"])([a-z0-9_]+\.[a-z0-9_]+)\1/g;
const TEMPLATE_DOTTED = /\bstates\s*\.\s*([a-z0-9_]+)\s*\.\s*([a-z0-9_]+)/g;
const TEMPLATE_BRACKET =
  /\bstates\s*\[\s*(['"])([a-z0-9_]+\.[a-z0-9_]+)\1\s*\]/g;

/** The entity ids a template names, found by bounded regular expressions. */
export const entitiesInTemplate = (template: string): string[] => {
  if (!TEMPLATE_MARKER.test(template)) {
    return [];
  }
  const text =
    template.length > TEMPLATE_SCAN_LIMIT
      ? template.slice(0, TEMPLATE_SCAN_LIMIT)
      : template;
  const found = new Set<string>();
  const add = (id: string) => {
    if (found.size < MAX_TEMPLATE_ENTITIES) {
      found.add(id);
    }
  };
  for (const match of text.matchAll(TEMPLATE_CALL)) {
    add(match[2]);
  }
  for (const match of text.matchAll(TEMPLATE_BRACKET)) {
    add(match[2]);
  }
  for (const match of text.matchAll(TEMPLATE_DOTTED)) {
    add(`${match[1]}.${match[2]}`);
  }
  return [...found];
};

/** Every string and number the value holds, as text. */
const collectLeaves = (value: unknown, out: string[], depth = 0) => {
  if (out.length >= MAX_LEAVES || depth > MAX_DEPTH) {
    return;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text) {
      out.push(
        text.length > REGEX_LIMITS.value
          ? text.slice(0, REGEX_LIMITS.value)
          : text
      );
    }
  } else if (typeof value === "number") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      collectLeaves(entry, out, depth + 1);
    }
  } else if (isDict(value)) {
    for (const entry of Object.values(value)) {
      collectLeaves(entry, out, depth + 1);
    }
  }
};

/**
 * The value of the step without the keys that hold nested steps. A nested key
 * keeps the strings it holds: a condition written as a template has no object
 * to be a step, so its text belongs to the step that owns it.
 */
const ownValue = (item: Dict): Dict => {
  const own: Dict = {};
  for (const [key, value] of Object.entries(item)) {
    if (CHILD_KEYS.has(key)) {
      if (Array.isArray(value)) {
        const strings = value.filter((entry) => typeof entry === "string");
        if (strings.length) {
          own[key] = strings;
        }
      } else if (!isDict(value)) {
        own[key] = value;
      }
      continue;
    }
    if (key === "repeat" && isDict(value)) {
      const repeat: Dict = {};
      for (const [name, entry] of Object.entries(value)) {
        if (!REPEAT_CHILD_KEYS.has(name)) {
          repeat[name] = entry;
        } else if (typeof entry === "string") {
          repeat[name] = entry;
        }
      }
      own[key] = repeat;
      continue;
    }
    own[key] = value;
  }
  return own;
};

const splitEntityIds = (value: unknown): string[] =>
  asList(value).flatMap((entry) =>
    typeof entry === "string"
      ? entry
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : []
  );

interface Collected {
  entities: Map<string, boolean>;
  deviceIds: Set<string>;
  areaIds: Set<string>;
  floorIds: Set<string>;
  labelIds: Set<string>;
  services: Set<string>;
}

const collectReferences = (
  value: unknown,
  resolver: SearchResolver,
  into: Collected,
  key = "",
  depth = 0
) => {
  if (depth > MAX_DEPTH) {
    return;
  }
  if (typeof value === "string") {
    if (TEMPLATE_MARKER.test(value)) {
      for (const id of entitiesInTemplate(value)) {
        if (!into.entities.has(id)) {
          into.entities.set(id, true);
        }
      }
      return;
    }
    if (key === "entity_id") {
      for (const id of splitEntityIds(value)) {
        if (id === "all" || id === "none") {
          continue;
        }
        const resolved = ENTITY_ID.test(id)
          ? id
          : resolver.entityRegistryId?.(id);
        if (resolved) {
          into.entities.set(resolved, false);
        }
      }
      return;
    }
    // A value that names an entity that exists, wherever it is written.
    if (
      !NOT_ENTITY_KEYS.has(key) &&
      ENTITY_ID.test(value) &&
      resolver.entityExists?.(value)
    ) {
      into.entities.set(value, false);
    }
    if (key === "device_id") {
      into.deviceIds.add(value);
    } else if (key === "area_id") {
      into.areaIds.add(value);
    } else if (key === "floor_id") {
      into.floorIds.add(value);
    } else if (key === "label_id") {
      into.labelIds.add(value);
    } else if (key === "action" || key === "service") {
      if (ENTITY_ID.test(value)) {
        into.services.add(value);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferences(entry, resolver, into, key, depth + 1);
    }
    return;
  }
  if (isDict(value)) {
    for (const [name, entry] of Object.entries(value)) {
      collectReferences(entry, resolver, into, name, depth + 1);
    }
  }
};

const stepKindOfItem = (kind: StepKind, item: Dict): string => {
  if (kind === "trigger") {
    return String(item.trigger ?? item.platform ?? "");
  }
  if (kind === "condition") {
    return String(item.condition ?? "");
  }
  return "";
};

interface ChildList {
  /** The path segment, for example `choose` or `repeat.sequence`. */
  segment: string;
  kind: StepKind;
  items: unknown[];
}

const childLists = (kind: StepKind, item: Dict): ChildList[] => {
  const lists: ChildList[] = [];
  const add = (segment: string, childKind: StepKind, value: unknown) => {
    const items = asList(value);
    if (items.length) {
      lists.push({ segment, kind: childKind, items });
    }
  };
  if (kind === "trigger") {
    add("triggers", "trigger", item.triggers);
  } else if (kind === "condition") {
    add("conditions", "condition", item.conditions);
  } else if (kind === "option") {
    add("conditions", "condition", item.conditions);
    add("sequence", "action", item.sequence);
  } else if (kind === "action") {
    add("choose", "option", item.choose);
    add("if", "condition", item.if);
    add("then", "action", item.then);
    add("else", "action", item.else);
    add("parallel", "action", item.parallel);
    add("sequence", "action", item.sequence);
    add("wait_for_trigger", "trigger", item.wait_for_trigger);
    add("conditions", "condition", item.conditions);
    if (isDict(item.repeat)) {
      add("repeat.while", "condition", item.repeat.while);
      add("repeat.until", "condition", item.repeat.until);
      add("repeat.sequence", "action", item.repeat.sequence);
    }
  }
  return lists;
};

const safe = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch (_err) {
    return undefined;
  }
};

const texts = (
  read: ((id: string) => string[]) | undefined,
  id: string
): string[] => (read ? (safe(() => read(id)) ?? []) : []);

const uniqueNonEmpty = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
};

/**
 * Turns an automation or a script into addressed steps. Accepts the plural
 * keys the editor uses and the singular keys older files use; a script keeps
 * its steps under `sequence`. Never changes the configuration.
 */
export const flattenAutomation = (
  config: unknown,
  resolver: SearchResolver = {}
): FlatConfig => {
  const steps: SearchStep[] = [];
  const byItem = new Map<object, SearchStep>();
  if (!isDict(config)) {
    return { steps, byItem };
  }

  const visit = (
    kind: StepKind,
    item: unknown,
    path: string,
    parent: SearchStep | undefined
  ) => {
    // A condition written as a template string has no object to match a row by.
    if (!item || typeof item !== "object" || byItem.has(item)) {
      return;
    }
    const isDefault = kind === "default";
    const dict: Dict = isDict(item) ? item : {};

    const own = isDefault ? {} : ownValue(dict);
    const references: Collected = {
      entities: new Map(),
      deviceIds: new Set(),
      areaIds: new Set(),
      floorIds: new Set(),
      labelIds: new Set(),
      services: new Set(),
    };
    collectReferences(own, resolver, references);

    const fields: string[] = [];
    const description = isDefault
      ? undefined
      : safe(() => resolver.describe?.(kind, dict));
    const typeLabel = isDefault
      ? undefined
      : safe(() => resolver.typeLabel?.(kind, dict));
    const type = stepKindOfItem(kind, dict);
    const alias = typeof dict.alias === "string" ? dict.alias : undefined;
    const note = typeof dict.note === "string" ? dict.note : undefined;
    fields.push(
      description ?? "",
      alias ?? "",
      typeLabel ?? "",
      type,
      note ?? ""
    );
    const leaves: string[] = [];
    collectLeaves(own, leaves);
    fields.push(...leaves);
    for (const [entityId] of references.entities) {
      fields.push(entityId, ...texts(resolver.entityTexts, entityId));
    }
    for (const id of references.deviceIds) {
      fields.push(...texts(resolver.deviceTexts, id));
    }
    for (const id of references.areaIds) {
      fields.push(...texts(resolver.areaTexts, id));
    }
    for (const id of references.floorIds) {
      fields.push(...texts(resolver.floorTexts, id));
    }
    for (const id of references.labelIds) {
      fields.push(...texts(resolver.labelTexts, id));
    }
    for (const service of references.services) {
      fields.push(...texts(resolver.serviceTexts, service));
    }

    const title =
      (description || alias || typeLabel || type || "").trim() ||
      (isDefault ? "default" : kind);

    const step: SearchStep = {
      index: steps.length,
      path,
      item,
      kind,
      parent,
      children: [],
      depth: parent ? parent.depth + 1 : 0,
      title,
      fields: uniqueNonEmpty(fields),
      entities: [...references.entities].map(([entityId, fromTemplate]) => ({
        entityId,
        fromTemplate,
      })),
    };
    steps.push(step);
    byItem.set(item, step);
    parent?.children.push(step);

    if (isDefault) {
      (item as unknown[]).forEach((entry, index) =>
        visit("action", entry, `${path}[${index}]`, step)
      );
      return;
    }
    for (const list of childLists(kind, dict)) {
      list.items.forEach((entry, index) =>
        visit(list.kind, entry, `${path}.${list.segment}[${index}]`, step)
      );
    }
    // The default actions of a Choose are a step of their own, so the row that
    // shows them can be found and opened.
    if (kind === "action" && Array.isArray(dict.default)) {
      visit("default", dict.default, `${path}.default`, step);
    } else if (kind === "action" && isDict(dict.default)) {
      visit("action", dict.default, `${path}.default`, step);
    }
  };

  const root = (key: string, singular: string, kind: StepKind) => {
    const value = config[key] !== undefined ? config[key] : config[singular];
    asList(value).forEach((entry, index) =>
      visit(kind, entry, `${key}[${index}]`, undefined)
    );
  };
  root("triggers", "trigger", "trigger");
  root("conditions", "condition", "condition");
  root("actions", "action", "action");
  // A script keeps its steps under `sequence`.
  asList(config.sequence).forEach((entry, index) =>
    visit("action", entry, `sequence[${index}]`, undefined)
  );

  return { steps, byItem };
};

export interface SearchInput {
  /** Plain text, or `/pattern/flags`. */
  query: string;
  /** Entity ids; a step matches when it uses any of them. */
  entityIds: readonly string[];
}

export interface SearchResult {
  /** True when there is a query or an entity filter. */
  active: boolean;
  /** The matching steps in document order. */
  matches: SearchStep[];
  matchSet: Set<object>;
  /** Matching steps and every ancestor of a matching step. */
  visibleSet: Set<object>;
  /** Why a pattern was not run. A pattern like that matches nothing. */
  error?: SearchQueryError;
}

/** The step's ancestors, nearest first. */
export const ancestorsOf = (step: SearchStep): SearchStep[] => {
  const result: SearchStep[] = [];
  for (let parent = step.parent; parent; parent = parent.parent) {
    result.push(parent);
  }
  return result;
};

export const searchSteps = (
  flat: FlatConfig,
  input: SearchInput
): SearchResult => {
  const query = input.query ?? "";
  const hasText = query.trim() !== "";
  const entityIds = new Set(input.entityIds);
  const active = hasText || entityIds.size > 0;
  const result: SearchResult = {
    active,
    matches: [],
    matchSet: new Set(),
    visibleSet: new Set(),
  };
  if (!active) {
    return result;
  }
  const compiled = hasText ? regexQuery(query) : undefined;
  if (compiled?.error) {
    result.error = compiled.error;
    return result;
  }
  const textMatches = hasText ? searchMatcher(query) : undefined;
  for (const step of flat.steps) {
    if (textMatches && !textMatches(...step.fields)) {
      continue;
    }
    if (
      entityIds.size &&
      !step.entities.some((entity) => entityIds.has(entity.entityId))
    ) {
      continue;
    }
    result.matches.push(step);
    result.matchSet.add(step.item);
    result.visibleSet.add(step.item);
    for (const ancestor of ancestorsOf(step)) {
      result.visibleSet.add(ancestor.item);
    }
  }
  return result;
};

/**
 * Whether a step, or anything nested in it, matches a text. A step that is not
 * known (just added, not yet flattened) counts as matching so it never
 * vanishes while being edited.
 */
export const subtreeMatches = (
  flat: FlatConfig,
  item: object,
  query: string
): boolean => {
  const step = flat.byItem.get(item);
  if (!step) {
    return true;
  }
  if (query.trim() === "") {
    return true;
  }
  const compiled = regexQuery(query);
  if (compiled?.error) {
    return false;
  }
  const matcher = searchMatcher(query);
  const stack = [step];
  while (stack.length) {
    const current = stack.pop()!;
    if (matcher(...current.fields)) {
      return true;
    }
    stack.push(...current.children);
  }
  return false;
};

export interface EntitySummary {
  entityId: string;
  /** How many steps use the entity. */
  count: number;
  /** True when no step names the entity directly, only in a template. */
  fromTemplateOnly: boolean;
  /** True when the entity does not exist. */
  missing: boolean;
}

/** Every entity the steps use, most used first. */
export const summarizeEntities = (
  flat: FlatConfig,
  exists?: (entityId: string) => boolean
): EntitySummary[] => {
  const byId = new Map<string, EntitySummary>();
  for (const step of flat.steps) {
    for (const entity of step.entities) {
      const existing = byId.get(entity.entityId);
      if (existing) {
        existing.count += 1;
        existing.fromTemplateOnly &&= entity.fromTemplate;
      } else {
        byId.set(entity.entityId, {
          entityId: entity.entityId,
          count: 1,
          fromTemplateOnly: entity.fromTemplate,
          missing: exists ? !exists(entity.entityId) : false,
        });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => b.count - a.count || a.entityId.localeCompare(b.entityId)
  );
};

/** Which items of a list stay visible for a list's own search text. */
export const filterListItems = (
  flat: FlatConfig,
  items: readonly object[],
  query: string
): Set<object> =>
  new Set(items.filter((item) => subtreeMatches(flat, item, query)));
