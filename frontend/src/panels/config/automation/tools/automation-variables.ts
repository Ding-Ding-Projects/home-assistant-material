import { ensureArray } from "../../../../common/array/ensure-array";

/** Where in the configuration something happens. `index` is zero based. */
export interface VariableLocation {
  section: "variables" | "trigger" | "condition" | "action";
  index: number;
}

export interface VariableInfo {
  name: string;
  /** True for variables the product provides itself, such as `trigger`. */
  builtin: boolean;
  setAt: VariableLocation[];
  usedAt: VariableLocation[];
  /** The value when it is a plain literal, otherwise undefined. */
  literal?: unknown;
}

export interface TemplateInfo {
  template: string;
  location: VariableLocation;
}

export interface VariableAnalysis {
  variables: VariableInfo[];
  templates: TemplateInfo[];
}

const BUILTINS = ["trigger", "this", "repeat", "wait"];

export const isTemplateString = (value: unknown): value is string =>
  typeof value === "string" && (value.includes("{{") || value.includes("{%"));

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

/** True when `name` is read as an identifier somewhere in the template. */
export const templateUsesName = (template: string, name: string): boolean => {
  // Blank out quoted text so `states('who')` does not count as using `who`.
  const stripped = template.replace(STRING_LITERAL, '""');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w.])${escaped}(?![\\w])`).test(stripped);
};

const collectTemplates = (node: unknown, found: string[], depth = 0): void => {
  if (depth > 40 || node === null || node === undefined) {
    return;
  }
  if (typeof node === "string") {
    if (isTemplateString(node)) {
      found.push(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectTemplates(child, found, depth + 1));
    return;
  }
  if (typeof node === "object") {
    Object.values(node as Record<string, unknown>).forEach((child) =>
      collectTemplates(child, found, depth + 1)
    );
  }
};

/** Names a step makes available to the steps after it. */
const namesSetByStep = (step: unknown, found: Set<string>, depth = 0): void => {
  if (depth > 40 || !step || typeof step !== "object") {
    return;
  }
  if (Array.isArray(step)) {
    step.forEach((child) => namesSetByStep(child, found, depth + 1));
    return;
  }
  const record = step as Record<string, unknown>;
  if (record.variables && typeof record.variables === "object") {
    Object.keys(record.variables as Record<string, unknown>).forEach((key) =>
      found.add(key)
    );
  }
  if (
    typeof record.response_variable === "string" &&
    record.response_variable
  ) {
    found.add(record.response_variable);
  }
  if (typeof record.wait_for_trigger !== "undefined") {
    found.add("wait");
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      namesSetByStep(value, found, depth + 1);
    }
  }
};

interface ConfigLike {
  variables?: Record<string, unknown>;
  trigger?: unknown;
  triggers?: unknown;
  condition?: unknown;
  conditions?: unknown;
  action?: unknown;
  actions?: unknown;
}

/**
 * Finds every variable the configuration sets and every template that reads
 * them. Everything comes from the configuration as it is on screen; nothing is
 * evaluated here.
 */
export const analyzeVariables = (config: ConfigLike): VariableAnalysis => {
  const triggers = ensureArray(config.triggers ?? config.trigger ?? []);
  const conditions = ensureArray(config.conditions ?? config.condition ?? []);
  const actions = ensureArray(config.actions ?? config.action ?? []);

  const byName = new Map<string, VariableInfo>();
  const declare = (
    name: string,
    location: VariableLocation,
    builtin = false,
    literal?: unknown
  ) => {
    let info = byName.get(name);
    if (!info) {
      info = { name, builtin, setAt: [], usedAt: [] };
      byName.set(name, info);
    }
    if (
      !info.setAt.some(
        (l) => l.section === location.section && l.index === location.index
      )
    ) {
      info.setAt.push(location);
    }
    if (literal !== undefined && !isTemplateString(literal)) {
      info.literal = literal;
    }
  };

  Object.entries(config.variables ?? {}).forEach(([name, value]) =>
    declare(name, { section: "variables", index: 0 }, false, value)
  );
  triggers.forEach((trigger, index) => {
    const vars = (trigger as any)?.variables;
    if (vars && typeof vars === "object") {
      Object.entries(vars).forEach(([name, value]) =>
        declare(name, { section: "trigger", index }, false, value)
      );
    }
  });
  actions.forEach((step, index) => {
    const names = new Set<string>();
    namesSetByStep(step, names);
    const direct = (step as any)?.variables;
    names.forEach((name) =>
      declare(
        name,
        { section: "action", index },
        name === "wait",
        direct && typeof direct === "object" ? direct[name] : undefined
      )
    );
  });

  const templates: TemplateInfo[] = [];
  const addTemplates = (
    nodes: unknown[],
    section: VariableLocation["section"]
  ) =>
    nodes.forEach((node, index) => {
      const found: string[] = [];
      collectTemplates(node, found);
      found.forEach((template) =>
        templates.push({ template, location: { section, index } })
      );
    });
  addTemplates(triggers, "trigger");
  addTemplates(conditions, "condition");
  addTemplates(actions, "action");
  const topLevel: string[] = [];
  collectTemplates(config.variables, topLevel);
  topLevel.forEach((template) =>
    templates.push({
      template,
      location: { section: "variables", index: 0 },
    })
  );

  // Built-in names only appear when something reads them.
  for (const name of BUILTINS) {
    if (
      !byName.has(name) &&
      templates.some((t) => templateUsesName(t.template, name))
    ) {
      declare(
        name,
        { section: name === "trigger" ? "trigger" : "action", index: 0 },
        true
      );
    }
  }

  byName.forEach((info) => {
    for (const template of templates) {
      if (templateUsesName(template.template, info.name)) {
        const loc = template.location;
        if (
          !info.usedAt.some(
            (l) => l.section === loc.section && l.index === loc.index
          )
        ) {
          info.usedAt.push(loc);
        }
      }
    }
  });

  return {
    variables: [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    templates,
  };
};

/** The literal values of variables, usable as context for a template preview. */
export const literalContext = (
  analysis: VariableAnalysis
): Record<string, unknown> => {
  const context: Record<string, unknown> = {};
  for (const info of analysis.variables) {
    if (info.literal !== undefined) {
      context[info.name] = info.literal;
    }
  }
  return context;
};
