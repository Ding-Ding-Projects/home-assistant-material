import { ensureArray } from "../../../common/array/ensure-array";

/**
 * A readable comparison of two versions of one automation.
 *
 * The server only offers a text diff. For the steps view, the two configs are
 * compared section by section: triggers, conditions and actions one step at a
 * time, and every other key (name, mode, description, variables) on its own.
 */

export type ChangeKind = "changed" | "added" | "removed";

export type ChangeSection =
  "trigger" | "condition" | "action" | "alias" | "other";

export interface FieldChange {
  key: string;
  /** Set when both sides are short plain values that can be shown inline. */
  before?: string;
  after?: string;
}

export interface ConfigChange {
  kind: ChangeKind;
  section: ChangeSection;
  /** The key of a setting that is not a step, such as `mode`. */
  key?: string;
  /** Position of the step in its list, from 0. */
  index?: number;
  /** The step before and after. A step that is new has no `before`. */
  before?: unknown;
  after?: unknown;
  /** What changed inside a step that exists on both sides. */
  fields: FieldChange[];
}

const SECTIONS = [
  ["trigger", ["triggers", "trigger"]],
  ["condition", ["conditions", "condition"]],
  ["action", ["actions", "action"]],
] as const;

const SECTION_KEYS = new Set<string>(
  SECTIONS.flatMap(([, keys]) => keys as readonly string[])
);

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const isPlain = (value: unknown): value is string | number | boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const inline = (value: unknown): string | undefined =>
  isPlain(value) && String(value).length <= 60 ? String(value) : undefined;

const fieldChanges = (before: unknown, after: unknown): FieldChange[] => {
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object"
  ) {
    return [];
  }
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => !same(a[key], b[key]))
    .map((key) => ({
      key,
      before: inline(a[key]),
      after: inline(b[key]),
    }));
};

const readSection = (config: unknown, keys: readonly string[]): unknown[] => {
  if (!config || typeof config !== "object") {
    return [];
  }
  const record = config as Record<string, unknown>;
  const key = keys.find((name) => name in record);
  return key ? (ensureArray(record[key] as unknown) ?? []) : [];
};

/** Every difference between two versions, in the order a person reads them. */
export const compareAutomationConfigs = (
  before: unknown,
  after: unknown
): ConfigChange[] => {
  const changes: ConfigChange[] = [];
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;

  if (!same(a.alias, b.alias)) {
    changes.push({
      kind: "changed",
      section: "alias",
      key: "alias",
      before: a.alias,
      after: b.alias,
      fields: [
        { key: "alias", before: inline(a.alias), after: inline(b.alias) },
      ],
    });
  }

  SECTIONS.forEach(([section, keys]) => {
    const oldSteps = readSection(a, keys);
    const newSteps = readSection(b, keys);
    const length = Math.max(oldSteps.length, newSteps.length);
    for (let index = 0; index < length; index++) {
      if (index >= oldSteps.length) {
        changes.push({
          kind: "added",
          section,
          index,
          after: newSteps[index],
          fields: [],
        });
      } else if (index >= newSteps.length) {
        changes.push({
          kind: "removed",
          section,
          index,
          before: oldSteps[index],
          fields: [],
        });
      } else if (!same(oldSteps[index], newSteps[index])) {
        changes.push({
          kind: "changed",
          section,
          index,
          before: oldSteps[index],
          after: newSteps[index],
          fields: fieldChanges(oldSteps[index], newSteps[index]),
        });
      }
    }
  });

  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => key !== "alias" && !SECTION_KEYS.has(key))
    .filter((key) => !same(a[key], b[key]))
    .forEach((key) => {
      changes.push({
        kind:
          a[key] === undefined
            ? "added"
            : b[key] === undefined
              ? "removed"
              : "changed",
        section: "other",
        key,
        before: a[key],
        after: b[key],
        fields: [{ key, before: inline(a[key]), after: inline(b[key]) }],
      });
    });

  return changes;
};

/**
 * A commit message that names what changed, like the one the server writes
 * when an automation is saved.
 */
export const suggestCommitMessage = (
  alias: string,
  changes: ConfigChange[]
): string => {
  const names = new Set<string>();
  changes.forEach((change) => {
    names.add(
      change.section === "other" || change.section === "alias"
        ? (change.key ?? change.section)
        : `${change.section}s`
    );
  });
  return names.size
    ? `${alias}: change ${[...names].sort().join(", ")}`
    : alias;
};
