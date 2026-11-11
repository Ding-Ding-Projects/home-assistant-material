import {
  isSecretFieldLike,
  isSecretName,
  maskYamlSecrets,
  stripSecretValues,
} from "../../../common/secret-fields";
import type { GuidedSetupField } from "../../../data/guided_setup";

/** The wizard steps, in order. */
export type GuidedStep = "about" | "options" | "review" | "done";

export const GUIDED_STEPS: GuidedStep[] = [
  "about",
  "options",
  "review",
  "done",
];

type Loose = Record<string, any>;

/** One editable value of the form, with where it lives in the data. */
export interface LeafField {
  path: string[];
  name: string;
  label?: string;
  required: boolean;
  default?: unknown;
  selector?: Loose;
  freeForm: boolean;
  secret: boolean;
}

/** A message key under `ui.panel.config.guided_setup` with its values. */
export interface FieldMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface SummaryLine {
  key: string;
  label: string;
  /** Null for a secret or a structured value: it is never printed. */
  value: string | null;
  secret: boolean;
  /** For a structured value: how many entries it holds, never its content. */
  entries?: number;
}

export const pathKey = (path: string[]): string => path.join(".");

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

export const humanize = (name: string): string => {
  const text = name.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export { isSecretSelector } from "../../../common/secret-fields";

/** A value that is a secret by selector, by its own name or by a group it sits in. */
const isSecretLeaf = (field: Loose, path: string[]): boolean =>
  isSecretFieldLike({
    name: field.name,
    format: field.format,
    autocomplete: field.autocomplete,
    selector: field.selector,
  }) || path.some(isSecretName);

/** Flattens grids and expandable groups into the values they hold. */
export const leafFields = (
  fields: readonly GuidedSetupField[],
  parent: string[] = []
): LeafField[] => {
  const result: LeafField[] = [];
  for (const raw of fields) {
    const field = raw as Loose;
    if (field.type === "grid") {
      result.push(
        ...leafFields(
          field.schema ?? [],
          field.flatten ? parent : [...parent, field.name]
        )
      );
    } else if (field.type === "expandable") {
      result.push(
        ...leafFields(
          field.schema ?? [],
          field.flatten ? parent : [...parent, field.name]
        )
      );
    } else if (typeof field.name === "string" && field.name !== "") {
      result.push({
        path: [...parent, field.name],
        name: field.name,
        label: field.label,
        required: field.required === true,
        default: field.default,
        selector: field.selector,
        freeForm: field.free_form === true,
        secret: isSecretLeaf(field, [...parent, field.name]),
      });
    }
  }
  return result;
};

/**
 * Picks the control that fits the field: a slider with a number box for a
 * bounded number, and a visible list for a short single choice.
 */
export const decorateField = (field: GuidedSetupField): GuidedSetupField => {
  const loose = field as Loose;
  if (Array.isArray(loose.schema)) {
    return { ...loose, schema: loose.schema.map(decorateField) } as any;
  }
  const selector = loose.selector as Loose | undefined;
  const number = selector?.number;
  if (
    number &&
    Number.isFinite(number.min) &&
    Number.isFinite(number.max) &&
    number.max - number.min <= 1000
  ) {
    return {
      ...loose,
      selector: { number: { ...number, mode: "slider" } },
    } as any;
  }
  const select = selector?.select;
  if (
    select &&
    !select.multiple &&
    Array.isArray(select.options) &&
    select.options.length >= 2 &&
    select.options.length <= 4
  ) {
    return {
      ...loose,
      selector: { select: { ...select, mode: "list" } },
    } as any;
  }
  return field;
};

/** A plain description of what a field accepts, taken from its selector. */
export const fieldHint = (leaf: LeafField): FieldMessage => {
  const selector = leaf.selector ?? {};
  if (leaf.freeForm) {
    return { key: "hint_yaml" };
  }
  if (leaf.secret) {
    return { key: "hint_secret" };
  }
  if (selector.number !== undefined) {
    const { min, max } = selector.number ?? {};
    if (typeof min === "number" && typeof max === "number") {
      return { key: "hint_number_range", params: { min, max } };
    }
    return { key: "hint_number" };
  }
  if (selector.select !== undefined) {
    return {
      key: "hint_select",
      params: { options: (selectOptionValues(selector) ?? []).join(", ") },
    };
  }
  for (const name of ["boolean", "entity", "duration", "time", "template"]) {
    if (selector[name] !== undefined) {
      return { key: `hint_${name}` };
    }
  }
  return { key: "hint_text" };
};

export const getAt = (data: Loose, path: string[]): unknown => {
  let current: unknown = data;
  for (const part of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Loose)[part];
  }
  return current;
};

const selectOptionValues = (selector?: Loose): string[] | undefined => {
  const options = selector?.select?.options;
  if (!Array.isArray(options)) {
    return undefined;
  }
  return options.map((option: unknown) =>
    String(
      option !== null && typeof option === "object"
        ? (option as Loose).value
        : option
    )
  );
};

const validateNumber = (
  leaf: LeafField,
  value: unknown
): FieldMessage | undefined => {
  const config = leaf.selector?.number;
  const parsed = typeof value === "number" ? value : Number(value);
  if (typeof value === "boolean" || value === "" || Number.isNaN(parsed)) {
    return { key: "field_not_number" };
  }
  if (config?.step === 1 && !Number.isInteger(parsed)) {
    return { key: "field_not_integer" };
  }
  if (typeof config?.min === "number" && parsed < config.min) {
    return { key: "field_too_small", params: { min: config.min } };
  }
  if (typeof config?.max === "number" && parsed > config.max) {
    return { key: "field_too_large", params: { max: config.max } };
  }
  return undefined;
};

/** Checks one value the way the form can, before the server is asked. */
export const validateLeaf = (
  leaf: LeafField,
  value: unknown
): FieldMessage | undefined => {
  if (isEmptyValue(value)) {
    return leaf.required ? { key: "field_required" } : undefined;
  }
  if (leaf.freeForm || !leaf.selector) {
    return undefined;
  }
  if (leaf.selector.number !== undefined) {
    return validateNumber(leaf, value);
  }
  if (leaf.selector.select !== undefined) {
    const allowed = selectOptionValues(leaf.selector);
    const values = Array.isArray(value) ? value : [value];
    if (
      allowed &&
      !leaf.selector.select?.custom_value &&
      values.some((item) => !allowed.includes(String(item)))
    ) {
      return { key: "field_not_allowed" };
    }
  }
  return undefined;
};

/** Messages by path key for every value that fails its own rules. */
export const validateAll = (
  leaves: readonly LeafField[],
  data: Loose
): Record<string, FieldMessage> => {
  const result: Record<string, FieldMessage> = {};
  for (const leaf of leaves) {
    const message = validateLeaf(leaf, getAt(data, leaf.path));
    if (message) {
      result[pathKey(leaf.path)] = message;
    }
  }
  return result;
};

const isStructured = (value: unknown): boolean =>
  value !== null &&
  typeof value === "object" &&
  (!Array.isArray(value) ||
    value.some((item) => item !== null && typeof item === "object"));

const structuredSize = (value: unknown): number =>
  Array.isArray(value) ? value.length : Object.keys(value as Loose).length;

const display = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map(display).join(", ");
  }
  return String(value);
};

/**
 * A default worth printing in a helper text, or undefined. Structured
 * defaults are never printed: they can hold a nested secret.
 */
export const defaultText = (
  value: unknown,
  secret: boolean
): string | undefined => {
  if (secret || value === undefined || value === null || isStructured(value)) {
    return undefined;
  }
  return display(value);
};

/**
 * The values that will be written. A secret only says that it is set, and a
 * structured value only says how many entries it holds.
 */
export const buildSummary = (
  leaves: readonly LeafField[],
  data: Loose,
  labelOf: (leaf: LeafField) => string
): SummaryLine[] =>
  leaves
    .filter((leaf) => !isEmptyValue(getAt(data, leaf.path)))
    .map((leaf) => {
      const value = getAt(data, leaf.path);
      const structured = !leaf.secret && isStructured(value);
      return {
        key: pathKey(leaf.path),
        label: labelOf(leaf),
        value: leaf.secret || structured ? null : display(value),
        secret: leaf.secret,
        ...(structured ? { entries: structuredSize(value) } : {}),
      };
    });

/**
 * Hides the value of every secret key of a YAML preview: the keys of the
 * secret fields and every key whose name looks like a secret, with the whole
 * block under it.
 */
export const maskYaml = (
  yaml: string,
  leaves: readonly LeafField[],
  mask: string
): string =>
  maskYamlSecrets(
    yaml,
    mask,
    leaves.filter((leaf) => leaf.secret).map((leaf) => leaf.name)
  );

/** The names of the secrets that hold a value, for the resume notice. */
export const filledSecrets = (
  leaves: readonly LeafField[],
  data: Loose
): string[] =>
  leaves
    .filter((leaf) => leaf.secret && !isEmptyValue(getAt(data, leaf.path)))
    .map((leaf) => pathKey(leaf.path));

const cloneWithout = (data: Loose, paths: string[][]): Loose => {
  const copy = JSON.parse(JSON.stringify(data ?? {})) as Loose;
  for (const path of paths) {
    let parent: unknown = copy;
    for (const part of path.slice(0, -1)) {
      parent =
        parent !== null && typeof parent === "object"
          ? (parent as Loose)[part]
          : undefined;
    }
    if (parent !== null && typeof parent === "object") {
      delete (parent as Loose)[path[path.length - 1]];
    }
  }
  return copy;
};

/**
 * The data without the secret fields and without free-form values. A free-form
 * value is typed YAML of any shape and can hold a secret under any key.
 */
export const withoutSecrets = (
  data: Loose,
  leaves: readonly LeafField[]
): Loose =>
  cloneWithout(
    data,
    leaves
      .filter((leaf) => leaf.secret || leaf.freeForm)
      .map((leaf) => leaf.path)
  );

/** Path keys of the values that were left out of a draft and must be asked again. */
const clearedPaths = (
  data: Loose,
  leaves: readonly LeafField[],
  removed: readonly string[]
): string[] => {
  const filled = filledSecrets(leaves, data);
  const extra = removed.filter(
    (path) =>
      !filled.some((item) => item === path || item.startsWith(`${path}.`))
  );
  return [...filled, ...extra];
};

/** What is kept in the browser. Secret values are never part of it. */
export interface GuidedDraft {
  version: 1;
  step: GuidedStep;
  kind?: string;
  entityDomain: string | null;
  data: Loose;
  /** Path keys of secrets that were filled in and must be asked for again. */
  clearedSecrets: string[];
  savedAt: number;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const draftKey = (domain: string, entityDomain: string | null): string =>
  `guided-setup-draft:${domain}:${entityDomain ?? "settings"}`;

export const saveDraft = (
  storage: DraftStorage | undefined,
  key: string,
  draft: Omit<GuidedDraft, "version" | "clearedSecrets" | "savedAt">,
  leaves: readonly LeafField[],
  now: number = Date.now()
): boolean => {
  if (!storage) {
    return false;
  }
  // Leaves know the declared secrets; the key-name pass catches every other
  // key that looks like one, at any depth, even before the form has loaded.
  const { data, removed } = stripSecretValues(
    withoutSecrets(draft.data, leaves)
  );
  const stored: GuidedDraft = {
    ...draft,
    version: 1,
    data,
    clearedSecrets: clearedPaths(draft.data, leaves, removed),
    savedAt: now,
  };
  try {
    storage.setItem(key, JSON.stringify(stored));
    return true;
  } catch (_err) {
    return false;
  }
};

export const loadDraft = (
  storage: DraftStorage | undefined,
  key: string
): GuidedDraft | undefined => {
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Loose;
    if (
      parsed?.version !== 1 ||
      !GUIDED_STEPS.includes(parsed.step) ||
      parsed.data === null ||
      typeof parsed.data !== "object" ||
      !Array.isArray(parsed.clearedSecrets)
    ) {
      return undefined;
    }
    return parsed as GuidedDraft;
  } catch (_err) {
    return undefined;
  }
};

export const clearDraft = (
  storage: DraftStorage | undefined,
  key: string
): void => {
  try {
    storage?.removeItem(key);
  } catch (_err) {
    // Nothing to clear when storage is unavailable.
  }
};

/** True when the data holds something worth keeping a draft of. */
export const hasContent = (data: Loose): boolean =>
  Object.values(data ?? {}).some((value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? hasContent(value as Loose)
      : !isEmptyValue(value)
  );

export type StepStatus = "current" | "done" | "error" | "available" | "locked";

export interface StepContext {
  current: GuidedStep;
  /** The furthest step reached so far. */
  furthest: GuidedStep;
  /** Problems found in the options. */
  errorCount: number;
  saved: boolean;
}

/** How each step shows in the rail and whether it can be jumped to. */
export const stepStatus = (step: GuidedStep, ctx: StepContext): StepStatus => {
  const position = GUIDED_STEPS.indexOf(step);
  const currentPosition = GUIDED_STEPS.indexOf(ctx.current);
  const reached = GUIDED_STEPS.indexOf(ctx.furthest);
  if (ctx.saved && step !== "done") {
    return "locked";
  }
  if (step === ctx.current) {
    return step === "options" && ctx.errorCount > 0 ? "error" : "current";
  }
  if (step === "options" && ctx.errorCount > 0 && position <= reached) {
    return "error";
  }
  if (step === "done" || position > reached) {
    return "locked";
  }
  return position < currentPosition ? "done" : "available";
};

export const canJumpTo = (step: GuidedStep, ctx: StepContext): boolean => {
  const status = stepStatus(step, ctx);
  return status !== "locked" && step !== ctx.current;
};
