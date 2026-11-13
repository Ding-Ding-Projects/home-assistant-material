/**
 * Known options for the visual object editor.
 *
 * What may go in a dictionary field such as "Options" or "Data" depends on the
 * action and on the integration behind the chosen entity. This module holds
 * the model for what is known about it and the rules for combining the
 * sources, with no knowledge of the interface.
 */

import { emptyNode, nodeFromValue, parseNumberText } from "./object-model";
import type { ObjectNode } from "./object-model";

/** Where a known option comes from. Earlier beats later when merging. */
export type KnownOptionSource = "declared" | "common";

export const KNOWN_OPTION_SOURCES: KnownOptionSource[] = ["declared", "common"];

export interface KnownChoice {
  value: string;
  label?: string;
}

export type KnownOptionKind =
  | { type: "text" }
  | { type: "number"; min?: number; max?: number; step?: number; unit?: string }
  | { type: "boolean" }
  | { type: "choice"; choices: KnownChoice[] }
  | { type: "list" }
  | { type: "dict" }
  | { type: "template" }
  | { type: "entity" }
  | { type: "url" }
  | { type: "colour" };

export interface KnownOption {
  key: string;
  /** Shown instead of the key when set. */
  label?: string;
  /** One line that explains the option. */
  description?: string;
  /** Left out when the source does not say; the merge fills it in or uses text. */
  kind?: KnownOptionKind;
  default?: unknown;
  source: KnownOptionSource;
}

export type ResolvedKnownOption = KnownOption & { kind: KnownOptionKind };

const SOURCE_RANK: Record<KnownOptionSource, number> = {
  declared: 0,
  common: 1,
};

/**
 * Combines lists from several sources. For one key the declared entry beats
 * the common one; the winner keeps its
 * source and takes any detail it lacks (description, value kind, default)
 * from the lower sources. The result is ordered declared, common,
 * and by first appearance within a source.
 */
export const mergeKnownOptions = (
  ...lists: (KnownOption[] | undefined)[]
): ResolvedKnownOption[] => {
  const all = lists
    .flatMap((list) => list ?? [])
    .map((option, index) => ({ option, index }))
    .sort(
      (a, b) =>
        SOURCE_RANK[a.option.source] - SOURCE_RANK[b.option.source] ||
        a.index - b.index
    )
    .map((item) => item.option);

  const merged = new Map<string, KnownOption>();
  for (const option of all) {
    const existing = merged.get(option.key);
    if (!existing) {
      merged.set(option.key, { ...option });
      continue;
    }
    existing.label ??= option.label;
    existing.description ??= option.description;
    existing.kind ??= option.kind;
    if (existing.default === undefined) {
      existing.default = option.default;
    }
  }
  return [...merged.values()].map((option) => ({
    ...option,
    kind: option.kind ?? { type: "text" },
  }));
};

/** The known options that are not yet a key of the dictionary. */
export const unusedKnownOptions = (
  options: ResolvedKnownOption[],
  usedKeys: Iterable<string>
): ResolvedKnownOption[] => {
  const used = new Set(usedKeys);
  return options.filter((option) => !used.has(option.key));
};

/** The kind of a plain value, used to guess how an option is entered. */
export const inferKind = (value: unknown): KnownOptionKind | undefined => {
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }
  if (typeof value === "number") {
    return { type: "number" };
  }
  if (typeof value === "string") {
    return value.includes("{{") || value.includes("{%")
      ? { type: "template" }
      : { type: "text" };
  }
  if (Array.isArray(value)) {
    return { type: "list" };
  }
  if (typeof value === "object" && value !== null) {
    return { type: "dict" };
  }
  return undefined;
};

/** The tree for a new row of an option, filled with the default if any. */
export const nodeForOption = (option: ResolvedKnownOption): ObjectNode => {
  const { kind } = option;
  if (option.default !== undefined && option.default !== null) {
    const fromDefault = nodeFromValue(option.default);
    if (nodeFitsKind(fromDefault, kind) || kind.type === "choice") {
      return fromDefault;
    }
  }
  switch (kind.type) {
    case "number":
      return emptyNode("number");
    case "boolean":
      return emptyNode("boolean");
    case "list":
      return emptyNode("list");
    case "dict":
      return emptyNode("dict");
    case "template":
      return emptyNode("template");
    default:
      // text, choice, entity, url and colour are typed as text.
      return emptyNode("text");
  }
};

/** Whether a node can be edited with the specific control of a kind. */
export const nodeFitsKind = (
  node: ObjectNode,
  kind: KnownOptionKind
): boolean => {
  switch (kind.type) {
    case "number":
      return node.type === "number";
    case "boolean":
      return node.type === "boolean";
    case "list":
      return node.type === "list";
    case "dict":
      return node.type === "dict";
    case "template":
      return node.type === "template" || node.type === "text";
    default:
      return node.type === "text";
  }
};

/** Checks a number against the limits of its kind. */
export const numberOutOfRange = (
  kind: Extract<KnownOptionKind, { type: "number" }>,
  text: string
): boolean => {
  const parsed = parseNumberText(text);
  if (parsed === undefined) {
    return false;
  }
  return (
    (kind.min !== undefined && parsed < kind.min) ||
    (kind.max !== undefined && parsed > kind.max)
  );
};

/** The options an engine or integration declares, as far as it says. */
export interface DeclaredOptionsInput {
  keys: string[];
  defaults?: Record<string, unknown>;
  /** Choices known for a key, such as the voices of a speech engine. */
  choices?: Record<string, KnownChoice[]>;
}

/**
 * Turns a declared list of keys into known options. Value kinds come from the
 * default when there is one and from a list of choices when there is one;
 * otherwise the kind stays open for the merge to fill in.
 */
export const declaredOptions = (input: DeclaredOptionsInput): KnownOption[] =>
  input.keys.map((key) => {
    const choices = input.choices?.[key];
    const defaultValue = input.defaults?.[key];
    const kind: KnownOptionKind | undefined = choices?.length
      ? { type: "choice", choices }
      : inferKind(defaultValue);
    return {
      key,
      source: "declared" as const,
      ...(kind ? { kind } : {}),
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
    };
  });
