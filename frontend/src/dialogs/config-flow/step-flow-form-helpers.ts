import { isSecretFieldLike } from "../../common/secret-fields";
import type { HaFormSchema } from "../../components/ha-form/types";

/**
 * Pure helpers for the config flow form step: live validation of what the
 * schema states, a masked summary of the entered values and the step counter.
 * Nothing here changes what is sent to the server.
 */

export type FieldIssueCode =
  "required" | "not_a_number" | "below_min" | "above_max" | "invalid_option";

export interface FieldIssue {
  code: FieldIssueCode;
  min?: number;
  max?: number;
}

type LooseSelector = Record<string, Record<string, unknown> | null> | undefined;

const SKIPPED_TYPES = ["constant", "divider"];

const selectorOf = (field: HaFormSchema): LooseSelector =>
  "selector" in field ? (field.selector as LooseSelector) : undefined;

const selectorConfig = (
  field: HaFormSchema,
  key: string
): Record<string, unknown> | undefined => selectorOf(field)?.[key] ?? undefined;

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

/**
 * Leaf fields that live directly in the submitted data object: top level
 * fields plus the contents of grids, expandables and optional action groups
 * that are flattened into it. Nested sections keep their own data object and
 * are not validated here.
 */
export const flattenFields = (
  schema: readonly HaFormSchema[] | undefined
): HaFormSchema[] => {
  const result: HaFormSchema[] = [];
  (schema ?? []).forEach((field) => {
    if (SKIPPED_TYPES.includes(field.type as string)) {
      return;
    }
    if (
      (field.type === "grid" ||
        field.type === "expandable" ||
        field.type === "optional_actions") &&
      "schema" in field
    ) {
      if (field.flatten) {
        result.push(...flattenFields(field.schema));
      }
      return;
    }
    result.push(field);
  });
  return result;
};

const optionValues = (field: HaFormSchema): string[] | undefined => {
  if (field.type === "select") {
    return field.options.map((option) => option[0]);
  }
  const select = selectorConfig(field, "select");
  if (!select || select.custom_value || !Array.isArray(select.options)) {
    return undefined;
  }
  return (select.options as unknown[]).map((option) =>
    typeof option === "string"
      ? option
      : String((option as { value: unknown }).value)
  );
};

/** What the schema says is wrong with a value, or undefined when it is fine. */
export const validateField = (
  field: HaFormSchema,
  value: unknown
): FieldIssue | undefined => {
  if (isEmpty(value)) {
    return field.required ? { code: "required" } : undefined;
  }

  let min: number | undefined;
  let max: number | undefined;
  let numeric = false;

  if (field.type === "integer") {
    numeric = true;
    min = field.valueMin;
    max = field.valueMax;
  } else if (field.type === "float") {
    numeric = true;
  } else {
    const number = selectorConfig(field, "number");
    if (number) {
      numeric = true;
      min = typeof number.min === "number" ? number.min : undefined;
      max = typeof number.max === "number" ? number.max : undefined;
    }
  }

  if (numeric) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (typeof value === "boolean" || !Number.isFinite(parsed)) {
      return { code: "not_a_number" };
    }
    if (min !== undefined && parsed < min) {
      return { code: "below_min", min };
    }
    if (max !== undefined && parsed > max) {
      return { code: "above_max", max };
    }
    return undefined;
  }

  const options = optionValues(field);
  // A select without options has nothing to be invalid against.
  if (options && options.length > 0) {
    const values = Array.isArray(value) ? value : [value];
    if (values.some((item) => !options.includes(String(item)))) {
      return { code: "invalid_option" };
    }
  }
  return undefined;
};

/** Issues for every flattened field the user has touched. */
export const validateTouchedFields = (
  schema: readonly HaFormSchema[] | undefined,
  data: Record<string, unknown> | undefined,
  touched: ReadonlySet<string>,
  hidden: ReadonlySet<string>
): Record<string, FieldIssue> => {
  const issues: Record<string, FieldIssue> = {};
  flattenFields(schema).forEach((field) => {
    if (!touched.has(field.name) || hidden.has(field.name) || field.disabled) {
      return;
    }
    const issue = validateField(field, data?.[field.name]);
    if (issue) {
      issues[field.name] = issue;
    }
  });
  return issues;
};

/** Error ids that this dialog produces itself, as opposed to the server's. */
export const LIVE_ERROR_PREFIX = "frontend_field_";

export const toLiveErrorId = (issue: FieldIssue): string =>
  `${LIVE_ERROR_PREFIX}${issue.code}${
    issue.min !== undefined ? `:min=${issue.min}` : ""
  }${issue.max !== undefined ? `:max=${issue.max}` : ""}`;

export const parseLiveErrorId = (id: string): FieldIssue | undefined => {
  if (!id.startsWith(LIVE_ERROR_PREFIX)) {
    return undefined;
  }
  const [code, ...params] = id.slice(LIVE_ERROR_PREFIX.length).split(":");
  const issue: FieldIssue = { code: code as FieldIssueCode };
  params.forEach((param) => {
    const [key, raw] = param.split("=");
    if (key === "min") {
      issue.min = Number(raw);
    } else if (key === "max") {
      issue.max = Number(raw);
    }
  });
  return issue;
};

/**
 * Password-like fields: the selector says so, or the name does. A value of
 * such a field must never reach a label, a summary, a log or a live region.
 */
export const isSecretField = (field: HaFormSchema): boolean =>
  isSecretFieldLike({
    name: field.name,
    selector: selectorOf(field) as Record<string, unknown> | undefined,
    format:
      "format" in field ? (field.format as string | undefined) : undefined,
    autocomplete:
      "autocomplete" in field
        ? (field.autocomplete as string | undefined)
        : undefined,
  });

export interface SummaryEntry {
  name: string;
  kind: "secret" | "boolean" | "text" | "entries";
  text?: string;
  bool?: boolean;
  /** For a structured value: how many entries, never the content. */
  count?: number;
}

const summaryText = (field: HaFormSchema, value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => summaryText(field, item)).join(", ");
  }
  if (field.type === "select") {
    const match = field.options.find((option) => option[0] === value);
    if (match) {
      return match[1];
    }
  }
  return String(value);
};

const isStructured = (value: unknown): boolean =>
  value !== null &&
  typeof value === "object" &&
  (!Array.isArray(value) ||
    value.some((item) => item !== null && typeof item === "object"));

/** One entry per field that has a value; secret values are never included. */
export const buildSummary = (
  schema: readonly HaFormSchema[] | undefined,
  data: Record<string, unknown> | undefined,
  hidden: ReadonlySet<string>
): SummaryEntry[] => {
  const entries: SummaryEntry[] = [];
  flattenFields(schema).forEach((field) => {
    const value = data?.[field.name];
    if (hidden.has(field.name) || isEmpty(value) || value === null) {
      return;
    }
    if (isSecretField(field)) {
      entries.push({ name: field.name, kind: "secret" });
    } else if (isStructured(value)) {
      // Objects and lists of objects can hold a nested secret; only say how
      // many entries there are.
      entries.push({
        name: field.name,
        kind: "entries",
        count: Array.isArray(value)
          ? value.length
          : Object.keys(value as object).length,
      });
    } else if (typeof value === "boolean") {
      entries.push({ name: field.name, kind: "boolean", bool: value });
    } else {
      entries.push({
        name: field.name,
        kind: "text",
        text: summaryText(field, value),
      });
    }
  });
  return entries;
};

/** Number of fields a summary is worth showing for. */
export const MULTI_FIELD_THRESHOLD = 2;

export const countSummaryFields = (
  schema: readonly HaFormSchema[] | undefined,
  hidden: ReadonlySet<string>
): number =>
  flattenFields(schema).filter((field) => !hidden.has(field.name)).length;

export interface StepProgress {
  number: number;
  /** True: the flow says this is the last step. False: it says more follow. */
  final?: boolean;
}

/**
 * The step counter. The flow never reports a total, so only the number of
 * steps seen so far and the flow's own `last_step` hint are used.
 */
export const describeStepProgress = (
  stepNumber: number | undefined,
  lastStep: boolean | null | undefined
): StepProgress | undefined => {
  if (!stepNumber || stepNumber < 1) {
    return undefined;
  }
  return {
    number: stepNumber,
    final: typeof lastStep === "boolean" ? lastStep : undefined,
  };
};

/** Fields whose names changed between two data objects. */
export const changedFieldNames = (
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): string[] => {
  const names = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next ?? {}),
  ]);
  return [...names].filter((name) => previous?.[name] !== next?.[name]);
};
