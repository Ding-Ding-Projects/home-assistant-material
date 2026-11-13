import { ensureArray } from "../../../../common/array/ensure-array";
import { getStorage } from "../../../../common/decorators/storage";
import type { ManualAutomationConfig } from "../../../../data/automation";
import type { StepSection } from "./automation-blueprint-maker";

export const SNIPPETS_STORAGE_KEY = "automation-snippets";

export interface AutomationSnippet {
  id: string;
  name: string;
  section: StepSection;
  steps: unknown[];
}

const isSnippet = (value: unknown): value is AutomationSnippet => {
  const v = value as AutomationSnippet;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    ["triggers", "conditions", "actions"].includes(v.section) &&
    Array.isArray(v.steps)
  );
};

/** Snippets are kept per browser, in the product's own preference storage. */
export const loadSnippets = (): AutomationSnippet[] => {
  const stored = getStorage().getValue<unknown>(SNIPPETS_STORAGE_KEY);
  return Array.isArray(stored) ? stored.filter(isSnippet) : [];
};

export const saveSnippets = (snippets: AutomationSnippet[]): void =>
  getStorage().setValue(SNIPPETS_STORAGE_KEY, snippets);

export const addSnippet = (
  snippets: AutomationSnippet[],
  name: string,
  section: StepSection,
  steps: unknown[]
): AutomationSnippet[] => {
  const trimmed = name.trim();
  if (!trimmed || !steps.length) {
    return snippets;
  }
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [
    ...snippets,
    { id, name: trimmed, section, steps: JSON.parse(JSON.stringify(steps)) },
  ];
};

export const removeSnippet = (
  snippets: AutomationSnippet[],
  id: string
): AutomationSnippet[] => snippets.filter((s) => s.id !== id);

/** Returns a new configuration with the snippet's steps appended. */
export const insertSnippet = (
  config: ManualAutomationConfig,
  snippet: AutomationSnippet
): ManualAutomationConfig => {
  const copy = JSON.parse(JSON.stringify(snippet.steps)) as unknown[];
  const current = ensureArray(
    (config as any)[snippet.section] ??
      (config as any)[snippet.section.slice(0, -1)] ??
      []
  );
  const next: Record<string, unknown> = {
    ...(config as unknown as Record<string, unknown>),
    [snippet.section]: [...current, ...copy],
  };
  // The deprecated singular key would otherwise shadow the plural one.
  delete next[snippet.section.slice(0, -1)];
  return next as unknown as ManualAutomationConfig;
};
