import { dump } from "js-yaml";
import { ensureArray } from "../../../../common/array/ensure-array";

export type StepSection = "triggers" | "conditions" | "actions";

export interface StepSelection {
  section: StepSection;
  index: number;
}

export interface BlueprintInputSpec {
  /** The key the blueprint input is stored under. */
  key: string;
  kind: "entity" | "device" | "area";
  /** Set when every entity of this input shares one domain. */
  domain?: string;
  multiple: boolean;
}

export interface BlueprintDraft {
  yaml: string;
  inputs: BlueprintInputSpec[];
  steps: number;
}

interface ConfigLike {
  triggers?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  condition?: unknown;
  actions?: unknown;
  action?: unknown;
}

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const MARKER = "__BLUEPRINT_INPUT__";

const sectionSteps = (config: ConfigLike, section: StepSection): unknown[] => {
  const legacy = {
    triggers: "trigger",
    conditions: "condition",
    actions: "action",
  }[section] as "trigger" | "condition" | "action";
  return ensureArray(config[section] ?? config[legacy] ?? []);
};

/** Lists the steps of a configuration so the user can pick some. */
export const listSteps = (
  config: ConfigLike
): { section: StepSection; index: number; step: unknown }[] =>
  (["triggers", "conditions", "actions"] as StepSection[]).flatMap((section) =>
    sectionSteps(config, section).map((step, index) => ({
      section,
      index,
      step,
    }))
  );

const cloneStep = <T>(step: T): T => JSON.parse(JSON.stringify(step));

/**
 * Builds real blueprint YAML from the selected steps. Every entity, device and
 * area the steps point at becomes a blueprint input, and the step refers to it
 * with `!input`. Nothing is saved: the YAML is for the user to copy or save.
 */
export const buildBlueprint = (
  config: ConfigLike,
  selection: StepSelection[],
  meta: { name: string; description?: string }
): BlueprintDraft => {
  const inputs: BlueprintInputSpec[] = [];
  const keysByValue = new Map<string, string>();
  const counters: Record<string, number> = {};

  const inputFor = (
    kind: BlueprintInputSpec["kind"],
    value: string
  ): string => {
    const cacheKey = `${kind}:${value}`;
    const existing = keysByValue.get(cacheKey);
    if (existing) {
      return existing;
    }
    const domain = kind === "entity" ? value.split(".")[0] : undefined;
    const base = domain ?? kind;
    counters[base] = (counters[base] ?? 0) + 1;
    const key = counters[base] === 1 ? base : `${base}_${counters[base]}`;
    keysByValue.set(cacheKey, key);
    inputs.push({ key, kind, domain, multiple: false });
    return key;
  };

  const rewrite = (node: unknown, depth = 0): unknown => {
    if (depth > 40 || node === null || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child) => rewrite(child, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const kind =
        key === "entity_id"
          ? "entity"
          : key === "device_id"
            ? "device"
            : key === "area_id"
              ? "area"
              : undefined;
      if (
        kind &&
        typeof value === "string" &&
        (kind !== "entity" || ENTITY_ID.test(value))
      ) {
        out[key] = `${MARKER}${inputFor(kind, value)}`;
      } else if (
        kind &&
        Array.isArray(value) &&
        value.length === 1 &&
        typeof value[0] === "string" &&
        (kind !== "entity" || ENTITY_ID.test(value[0]))
      ) {
        out[key] = `${MARKER}${inputFor(kind, value[0])}`;
      } else {
        out[key] = rewrite(value, depth + 1);
      }
    }
    return out;
  };

  const picked: Record<StepSection, unknown[]> = {
    triggers: [],
    conditions: [],
    actions: [],
  };
  for (const { section, index } of selection) {
    const step = sectionSteps(config, section)[index];
    if (step !== undefined) {
      picked[section].push(rewrite(cloneStep(step)));
    }
  }

  const inputBlock: Record<string, unknown> = {};
  for (const spec of inputs) {
    const selector =
      spec.kind === "entity"
        ? { entity: spec.domain ? { domain: spec.domain } : {} }
        : { [spec.kind]: {} };
    inputBlock[spec.key] = {
      name: spec.key
        .replace(/_\d+$/, "")
        .replace(/_/g, " ")
        .replace(/^./, (c) => c.toUpperCase()),
      selector,
    };
  }

  const document: Record<string, unknown> = {
    blueprint: {
      name: meta.name,
      ...(meta.description ? { description: meta.description } : {}),
      domain: "automation",
      ...(inputs.length ? { input: inputBlock } : {}),
    },
  };
  (["triggers", "conditions", "actions"] as StepSection[]).forEach(
    (section) => {
      if (picked[section].length) {
        document[section] = picked[section];
      }
    }
  );

  const yaml = dump(document, { noRefs: true, lineWidth: -1 }).replace(
    new RegExp(`(['"]?)${MARKER}([A-Za-z0-9_]+)\\1`, "g"),
    "!input $2"
  );
  return { yaml, inputs, steps: selection.length };
};
