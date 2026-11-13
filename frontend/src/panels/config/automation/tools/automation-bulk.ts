import type { AutomationConfig } from "../../../../data/automation";
import {
  fetchAutomationFileConfig,
  saveAutomationConfig,
} from "../../../../data/automation";
import type { HomeAssistant } from "../../../../types";

export interface StoredAutomation {
  id: string;
  entityId: string;
  name: string;
  config: AutomationConfig;
}

export interface EntitySwap {
  /** The configuration with the entity replaced. */
  config: AutomationConfig;
  /** Where the entity was replaced, such as `actions[2].target.entity_id`. */
  paths: string[];
  /** Text values that mention the entity inside a larger string (templates). */
  untouchedMentions: string[];
}

/**
 * Replaces an entity id wherever it is a complete value. Text that only
 * mentions the entity inside a longer string, such as a template, is reported
 * but never rewritten, because that cannot be done safely.
 */
export const swapEntity = (
  config: AutomationConfig,
  from: string,
  to: string
): EntitySwap => {
  const paths: string[] = [];
  const untouchedMentions: string[] = [];

  const walk = (node: unknown, path: string, depth: number): unknown => {
    if (depth > 60) {
      return node;
    }
    if (typeof node === "string") {
      if (node === from) {
        paths.push(path);
        return to;
      }
      if (node.includes(from)) {
        untouchedMentions.push(path);
      }
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child, i) => walk(child, `${path}[${i}]`, depth + 1));
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        out[key] = walk(value, path ? `${path}.${key}` : key, depth + 1);
      }
      return out;
    }
    return node;
  };

  return {
    config: walk(config, "", 0) as AutomationConfig,
    paths,
    untouchedMentions,
  };
};

/** Loads every stored automation that has an id the configuration API knows. */
export const loadAllAutomations = async (
  hass: HomeAssistant
): Promise<{ automations: StoredAutomation[]; failed: string[] }> => {
  const entities = Object.values(hass.states).filter(
    (s) => s.entity_id.startsWith("automation.") && s.attributes.id
  );
  const automations: StoredAutomation[] = [];
  const failed: string[] = [];
  const queue = [...entities];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const id = String(s.attributes.id);
        automations.push({
          id,
          entityId: s.entity_id,
          name: String(s.attributes.friendly_name ?? s.entity_id),
          // eslint-disable-next-line no-await-in-loop
          config: await fetchAutomationFileConfig(hass, id),
        });
      } catch (_err) {
        failed.push(s.entity_id);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  automations.sort((a, b) => a.name.localeCompare(b.name));
  return { automations, failed };
};

export type SaveOutcome =
  | { id: string; status: "saved" }
  | { id: string; status: "failed"; message: string };

/** Saves one automation through the configuration API. */
export const saveOne = async (
  hass: HomeAssistant,
  id: string,
  config: AutomationConfig
): Promise<SaveOutcome> => {
  try {
    await saveAutomationConfig(hass, id, config);
    return { id, status: "saved" };
  } catch (err: unknown) {
    return {
      id,
      status: "failed",
      message:
        (err as { body?: { message?: string } })?.body?.message ??
        (err instanceof Error ? err.message : String(err)),
    };
  }
};
