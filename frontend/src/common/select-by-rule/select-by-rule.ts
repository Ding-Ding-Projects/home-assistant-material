import { regexQuery } from "../regex/filter";
import {
  formatRegexQuery,
  isRegexQuery,
  parseSearchQuery,
} from "../regex/query";
import { stripDiacritics } from "../string/strip-diacritics";

/**
 * Selecting rows of a list by rule.
 *
 * A rule looks at one row: its text, its labels, a value such as the area or
 * the integration, or its state. Several rules combine with "all of these" or
 * "any of these", and each rule can be turned around with `negate`. The
 * result is a list of row identifiers that the caller applies to the current
 * selection. Nothing here touches the screen.
 */

export const ANY_FIELD = "*";

export type TextOperator =
  "contains" | "not_contains" | "starts_with" | "ends_with" | "matches";

export type RowState = "enabled" | "disabled" | "hidden" | "unavailable";

export const ROW_STATES: readonly RowState[] = [
  "enabled",
  "disabled",
  "hidden",
  "unavailable",
];

export type CombineMode = "all" | "any";

export type ApplyMode = "replace" | "add" | "remove" | "keep";

export const APPLY_MODES: readonly ApplyMode[] = [
  "replace",
  "add",
  "remove",
  "keep",
];

interface RuleBase {
  /** Stable key for rendering the rule in a list. */
  id: string;
  /** Turns the result of the rule around. */
  negate: boolean;
}

export interface TextRule extends RuleBase {
  kind: "text";
  operator: TextOperator;
  /** A column key, or `ANY_FIELD` for every visible column. */
  field: string;
  value: string;
  caseSensitive: boolean;
}

export interface LabelRule extends RuleBase {
  kind: "label";
  operator: "has" | "not_has";
  /** A label identifier, or a label name when the row has no identifier. */
  value: string;
}

export interface ValueRule extends RuleBase {
  kind: "value";
  operator: "is" | "is_not";
  field: string;
  value: string;
}

export interface StateRule extends RuleBase {
  kind: "state";
  operator: "is" | "is_not";
  value: RowState;
}

export type SelectRule = TextRule | LabelRule | ValueRule | StateRule;

export type RuleKind = SelectRule["kind"];

export type RuleRow = Record<string, any>;

export interface RuleContext {
  /** The column keys "any visible column" looks at. */
  anyFields: readonly string[];
}

const MAX_TEXT = 4000;

const normalize = (value: string, caseSensitive: boolean): string =>
  caseSensitive ? value : stripDiacritics(value.toLowerCase());

/** The pieces of text a row holds for a field, empty when it holds none. */
export const rowTexts = (row: RuleRow, key: string): string[] => {
  const raw = row[key];
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const text = String(raw);
    return text ? [text.slice(0, MAX_TEXT)] : [];
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === "string" || typeof item === "number") {
        out.push(String(item).slice(0, MAX_TEXT));
      } else if (item && typeof item === "object" && "name" in item) {
        const name = (item as { name?: unknown }).name;
        if (typeof name === "string") {
          out.push(name.slice(0, MAX_TEXT));
        }
      }
    }
    return out;
  }
  return [];
};

/** The labels a row carries, by identifier and by name. */
export const rowLabels = (row: RuleRow): { ids: string[]; names: string[] } => {
  const entries = row.label_entries;
  if (Array.isArray(entries)) {
    return {
      ids: entries
        .map((entry) => (entry as { label_id?: unknown })?.label_id)
        .filter((id): id is string => typeof id === "string"),
      names: entries
        .map((entry) => (entry as { name?: unknown })?.name)
        .filter((name): name is string => typeof name === "string"),
    };
  }
  if (Array.isArray(row.labels)) {
    return {
      ids: [],
      names: row.labels.filter(
        (name: unknown): name is string => typeof name === "string"
      ),
    };
  }
  return { ids: [], names: [] };
};

/** True when the row has the state. Unknown fields count as not set. */
export const rowHasState = (row: RuleRow, state: RowState): boolean => {
  const disabled = row.disabled === true || !!row.disabled_by;
  switch (state) {
    case "disabled":
      return disabled;
    case "enabled":
      return !disabled;
    case "hidden":
      return row.hidden === true || !!row.hidden_by;
    default:
      return row.unavailable === true;
  }
};

/** The query a pattern rule uses, with the case choice written in as a flag. */
export const patternQueryText = (
  value: string,
  caseSensitive: boolean
): string => {
  if (isRegexQuery(value)) {
    const { pattern, flags } = parseSearchQuery(value);
    const set = new Set(flags.split(""));
    if (!caseSensitive) {
      set.add("i");
    }
    return formatRegexQuery(pattern, [...set].join(""));
  }
  return formatRegexQuery(value, caseSensitive ? "" : "i");
};

export type RulePatternError =
  "too_long" | "invalid" | "unsupported_flag" | "risky";

/** The reason a pattern rule cannot be used, or undefined when it can. */
export const patternError = (rule: TextRule): RulePatternError | undefined => {
  if (rule.operator !== "matches" || !rule.value.trim()) {
    return undefined;
  }
  return regexQuery(patternQueryText(rule.value.trim(), rule.caseSensitive))
    ?.error;
};

/** True when the rule has everything it needs to be tried. */
export const isRuleComplete = (rule: SelectRule): boolean =>
  rule.kind === "state" ? true : rule.value.trim() !== "";

const textTest = (rule: TextRule): ((values: readonly string[]) => boolean) => {
  if (rule.operator === "matches") {
    const query = regexQuery(
      patternQueryText(rule.value.trim(), rule.caseSensitive)
    );
    if (!query || query.error) {
      return () => false;
    }
    return (values) => values.some((value) => query.test(value));
  }
  const needle = normalize(rule.value.trim(), rule.caseSensitive);
  switch (rule.operator) {
    case "starts_with":
      return (values) =>
        values.some((value) =>
          normalize(value, rule.caseSensitive).startsWith(needle)
        );
    case "ends_with":
      return (values) =>
        values.some((value) =>
          normalize(value, rule.caseSensitive).endsWith(needle)
        );
    case "not_contains":
      return (values) =>
        !values.some((value) =>
          normalize(value, rule.caseSensitive).includes(needle)
        );
    default:
      return (values) =>
        values.some((value) =>
          normalize(value, rule.caseSensitive).includes(needle)
        );
  }
};

/** Compiles one rule into a test for a row. Incomplete rules are not tried. */
export const compileRule = (
  rule: SelectRule,
  context: RuleContext
): ((row: RuleRow) => boolean) => {
  let test: (row: RuleRow) => boolean;
  switch (rule.kind) {
    case "text": {
      const matches = textTest(rule);
      const fields =
        rule.field === ANY_FIELD ? context.anyFields : [rule.field];
      test = (row) => matches(fields.flatMap((key) => rowTexts(row, key)));
      break;
    }
    case "label": {
      const wanted = rule.value.trim();
      const wantedName = wanted.toLowerCase();
      const has = (row: RuleRow) => {
        const { ids, names } = rowLabels(row);
        return (
          ids.includes(wanted) ||
          names.some((name) => name.toLowerCase() === wantedName)
        );
      };
      test = rule.operator === "has" ? has : (row) => !has(row);
      break;
    }
    case "value": {
      const wanted = rule.value.trim().toLowerCase();
      const is = (row: RuleRow) =>
        rowTexts(row, rule.field).some(
          (value) => value.trim().toLowerCase() === wanted
        );
      test = rule.operator === "is" ? is : (row) => !is(row);
      break;
    }
    case "state": {
      const is = (row: RuleRow) => rowHasState(row, rule.value);
      test = rule.operator === "is" ? is : (row) => !is(row);
      break;
    }
  }
  return rule.negate ? (row) => !test(row) : test;
};

export type RuleBlock = "empty" | "invalid";

export interface RuleResult {
  /** Identifiers of the rows that match, in the order of the rows. */
  ids: string[];
  /** Why nothing was tried: no complete rule, or a pattern that cannot run. */
  blocked?: RuleBlock;
  /** The ids of the rules whose pattern cannot run. */
  invalidRules: string[];
}

/**
 * The rows that match the rules. With no complete rule nothing matches, so an
 * unfinished form never selects everything.
 */
export const matchRows = (
  rows: readonly RuleRow[],
  rules: readonly SelectRule[],
  combine: CombineMode,
  context: RuleContext,
  idKey: string
): RuleResult => {
  const complete = rules.filter(isRuleComplete);
  const invalidRules = complete
    .filter((rule) => rule.kind === "text" && patternError(rule))
    .map((rule) => rule.id);
  if (!complete.length) {
    return { ids: [], blocked: "empty", invalidRules };
  }
  if (invalidRules.length) {
    return { ids: [], blocked: "invalid", invalidRules };
  }
  const tests = complete.map((rule) => compileRule(rule, context));
  const ids: string[] = [];
  for (const row of rows) {
    if (row.selectable === false) {
      continue;
    }
    const hit =
      combine === "all"
        ? tests.every((test) => test(row))
        : tests.some((test) => test(row));
    if (hit) {
      ids.push(String(row[idKey]));
    }
  }
  return { ids, invalidRules };
};

/** The selection after applying the matched rows in the chosen way. */
export const applySelection = (
  current: readonly string[],
  matched: readonly string[],
  mode: ApplyMode
): string[] => {
  const hit = new Set(matched);
  switch (mode) {
    case "replace":
      return [...matched];
    case "add":
      return [...new Set([...current, ...matched])];
    case "remove":
      return current.filter((id) => !hit.has(id));
    default:
      return current.filter((id) => hit.has(id));
  }
};

export interface RuleColumnLike {
  title?: unknown;
  hidden?: boolean;
  type?: string;
  valueColumn?: string;
}

export interface RuleFieldChoice {
  key: string;
  title: string;
}

export interface RuleValueField extends RuleFieldChoice {
  values: string[];
}

export interface RuleLabelChoice {
  value: string;
  label: string;
}

/** A page's own description of an extra field that rules can use. */
export interface SelectRuleField {
  key: string;
  title: string;
  /** "text" can be searched; "value" offers "is" and "is not" a value. */
  kind: "text" | "value";
}

export interface RuleFields {
  textFields: RuleFieldChoice[];
  valueFields: RuleValueField[];
  labels: RuleLabelChoice[];
  states: RowState[];
}

const NON_TEXT_TYPES = new Set([
  "icon",
  "icon-button",
  "overflow",
  "overflow-menu",
]);

/** Fields that offer "is" and "is not" when the rows carry them. */
export const AUTO_VALUE_FIELDS = ["area", "integration", "domain"] as const;

const MAX_ROWS = 2000;
const MAX_VALUES = 200;

/**
 * Works out which rules a list can offer from what its rows really hold:
 * text columns that have text, labels on the rows, values of the area,
 * integration and domain fields, and the states the rows can tell.
 */
export const detectRuleFields = (
  columns: Record<string, RuleColumnLike> | undefined,
  rows: readonly RuleRow[],
  options: {
    hiddenColumns?: readonly string[];
    extra?: readonly SelectRuleField[];
    fallbackTitles?: Partial<Record<string, string>>;
  } = {}
): RuleFields => {
  const sample = rows.slice(0, MAX_ROWS);
  const hiddenByPerson = new Set(options.hiddenColumns ?? []);
  const textFields: RuleFieldChoice[] = [];
  const seen = new Set<string>();
  const addText = (key: string, title: string) => {
    if (seen.has(key) || !sample.some((row) => rowTexts(row, key).length)) {
      return;
    }
    seen.add(key);
    textFields.push({ key, title });
  };
  for (const [columnKey, column] of Object.entries(columns ?? {})) {
    if (
      column.hidden ||
      hiddenByPerson.has(columnKey) ||
      (column.type && NON_TEXT_TYPES.has(column.type)) ||
      typeof column.title !== "string" ||
      !column.title
    ) {
      continue;
    }
    addText(column.valueColumn || columnKey, column.title);
  }
  for (const field of options.extra ?? []) {
    if (field.kind === "text") {
      addText(field.key, field.title);
    }
  }

  const valueFields: RuleValueField[] = [];
  const addValue = (key: string, title: string) => {
    if (valueFields.some((field) => field.key === key)) {
      return;
    }
    const values = new Set<string>();
    for (const row of sample) {
      for (const value of rowTexts(row, key)) {
        const text = value.trim();
        if (text) {
          values.add(text);
        }
      }
      if (values.size > MAX_VALUES) {
        break;
      }
    }
    if (values.size && values.size <= MAX_VALUES) {
      valueFields.push({
        key,
        title,
        values: [...values].sort((a, b) => a.localeCompare(b)),
      });
    }
  };
  const extraValue = new Map(
    (options.extra ?? [])
      .filter((field) => field.kind === "value")
      .map((field) => [field.key, field.title])
  );
  for (const key of AUTO_VALUE_FIELDS) {
    const column = columns?.[key];
    const title =
      extraValue.get(key) ??
      (typeof column?.title === "string" && column.title
        ? column.title
        : options.fallbackTitles?.[key]);
    if (title) {
      addValue(key, title);
    }
  }
  for (const [key, title] of extraValue) {
    addValue(key, title);
  }

  const labels = new Map<string, string>();
  for (const row of sample) {
    const entries = row.label_entries;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const id = (entry as { label_id?: unknown })?.label_id;
        const name = (entry as { name?: unknown })?.name;
        if (typeof name === "string") {
          labels.set(typeof id === "string" ? id : name, name);
        }
      }
    } else if (Array.isArray(row.labels)) {
      for (const name of row.labels) {
        if (typeof name === "string") {
          labels.set(name, name);
        }
      }
    }
  }

  const has = (...keys: string[]) =>
    sample.some((row) => keys.some((key) => key in row));
  const states: RowState[] = [];
  if (has("disabled_by", "disabled")) {
    states.push("enabled", "disabled");
  }
  if (has("hidden_by", "hidden")) {
    states.push("hidden");
  }
  if (sample.some((row) => typeof row.unavailable === "boolean")) {
    states.push("unavailable");
  }

  return {
    textFields,
    valueFields,
    labels: [...labels]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    states,
  };
};

/** True when the list has anything to select by. */
export const hasRuleFields = (fields: RuleFields): boolean =>
  fields.textFields.length > 0 ||
  fields.valueFields.length > 0 ||
  fields.labels.length > 0 ||
  fields.states.length > 0;

/** The kinds of rule the list can offer. */
export const availableRuleKinds = (fields: RuleFields): RuleKind[] => {
  const kinds: RuleKind[] = [];
  if (fields.textFields.length) {
    kinds.push("text");
  }
  if (fields.labels.length) {
    kinds.push("label");
  }
  if (fields.valueFields.length) {
    kinds.push("value");
  }
  if (fields.states.length) {
    kinds.push("state");
  }
  return kinds;
};

let counter = 0;

/** A new, empty rule of a kind with sensible first choices. */
export const newRule = (kind: RuleKind, fields: RuleFields): SelectRule => {
  counter += 1;
  const id = `rule-${counter}`;
  switch (kind) {
    case "label":
      return {
        id,
        kind,
        operator: "has",
        value: fields.labels[0]?.value ?? "",
        negate: false,
      };
    case "value":
      return {
        id,
        kind,
        operator: "is",
        field: fields.valueFields[0]?.key ?? "",
        value: "",
        negate: false,
      };
    case "state":
      return {
        id,
        kind,
        operator: "is",
        value: fields.states[0] ?? "disabled",
        negate: false,
      };
    default:
      return {
        id,
        kind: "text",
        operator: "contains",
        field: ANY_FIELD,
        value: "",
        negate: false,
        caseSensitive: false,
      };
  }
};

export interface StoredRuleSet {
  rules: SelectRule[];
  combine: CombineMode;
  apply: ApplyMode;
}

const TEXT_OPERATORS: readonly TextOperator[] = [
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "matches",
];

const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value.slice(0, MAX_TEXT) : undefined;

/**
 * Reads a rule set remembered by an earlier visit. Anything that is not
 * shaped like a rule is dropped, so a damaged value gives an empty set.
 */
export const sanitizeStoredRuleSet = (raw: unknown): StoredRuleSet => {
  const empty: StoredRuleSet = { rules: [], combine: "all", apply: "replace" };
  if (!raw || typeof raw !== "object") {
    return empty;
  }
  const input = raw as Record<string, unknown>;
  const rules: SelectRule[] = [];
  if (Array.isArray(input.rules)) {
    for (const item of input.rules.slice(0, 20)) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const rule = item as Record<string, unknown>;
      counter += 1;
      const base = { id: `rule-${counter}`, negate: rule.negate === true };
      const value = str(rule.value);
      if (value === undefined) {
        continue;
      }
      if (rule.kind === "text") {
        const field = str(rule.field);
        if (
          field === undefined ||
          !TEXT_OPERATORS.includes(rule.operator as TextOperator)
        ) {
          continue;
        }
        rules.push({
          ...base,
          kind: "text",
          operator: rule.operator as TextOperator,
          field,
          value,
          caseSensitive: rule.caseSensitive === true,
        });
      } else if (rule.kind === "label") {
        rules.push({
          ...base,
          kind: "label",
          operator: rule.operator === "not_has" ? "not_has" : "has",
          value,
        });
      } else if (rule.kind === "value") {
        const field = str(rule.field);
        if (field === undefined) {
          continue;
        }
        rules.push({
          ...base,
          kind: "value",
          operator: rule.operator === "is_not" ? "is_not" : "is",
          field,
          value,
        });
      } else if (
        rule.kind === "state" &&
        ROW_STATES.includes(value as RowState)
      ) {
        rules.push({
          ...base,
          kind: "state",
          operator: rule.operator === "is_not" ? "is_not" : "is",
          value: value as RowState,
        });
      }
    }
  }
  return {
    rules,
    combine: input.combine === "any" ? "any" : "all",
    apply: APPLY_MODES.includes(input.apply as ApplyMode)
      ? (input.apply as ApplyMode)
      : "replace",
  };
};

/**
 * Drops rules that point at a column, label or value this list no longer
 * has, so a remembered set from an older list shape cannot select by a field
 * that is gone.
 */
export const pruneRules = (
  rules: readonly SelectRule[],
  fields: RuleFields
): SelectRule[] =>
  rules.filter((rule) => {
    switch (rule.kind) {
      case "text":
        return (
          rule.field === ANY_FIELD ||
          fields.textFields.some((field) => field.key === rule.field)
        );
      case "label":
        return fields.labels.length > 0;
      case "value":
        return fields.valueFields.some((field) => field.key === rule.field);
      default:
        return fields.states.includes(rule.value);
    }
  });

/** A short name for a row in the preview. */
export const rowPreviewName = (row: RuleRow, idKey: string): string => {
  for (const key of ["name", "title", "name_by_user"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return String(row[idKey]);
};
