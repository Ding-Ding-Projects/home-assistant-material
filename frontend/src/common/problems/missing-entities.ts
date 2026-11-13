/**
 * Finds the entity ids a card or automation step names that Home Assistant
 * does not know. Used by the problem detector.
 */

const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;

const ENTITY_KEYS = new Set(["entity", "entity_id", "entities", "target"]);

/** Templates, wildcards and "all" are not entity ids, so the pattern skips them. */
const looksLikeEntityId = (value: string): boolean => ENTITY_ID.test(value);

const collect = (value: unknown, out: Set<string>, depth: number): void => {
  if (depth > 8 || value == null) {
    return;
  }
  if (typeof value === "string") {
    if (looksLikeEntityId(value)) {
      out.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A list of entity rows can be objects with an `entity` key.
    if (typeof record.entity === "string" && looksLikeEntityId(record.entity)) {
      out.add(record.entity);
    }
  }
};

const memo = new WeakMap<object, string[]>();

/** Every entity id named by the config's entity fields, in order of first use. */
export const configEntityIds = (config: unknown): string[] => {
  if (config && typeof config === "object") {
    const cached = memo.get(config);
    if (cached) {
      return cached;
    }
  }
  const out = new Set<string>();
  const walk = (node: unknown, level: number) => {
    if (level > 8 || node == null || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, level + 1));
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>
    )) {
      if (key === "target" && value && typeof value === "object") {
        collect((value as Record<string, unknown>).entity_id, out, level + 1);
        continue;
      }
      if (ENTITY_KEYS.has(key)) {
        collect(value, out, level + 1);
        continue;
      }
      // Nested cards and steps (stacks, choose branches, sequences).
      if (typeof value === "object") {
        walk(value, level + 1);
      }
    }
  };
  walk(config, 0);
  const ids = [...out];
  if (config && typeof config === "object") {
    memo.set(config, ids);
  }
  return ids;
};

/** The entity ids the config names that are not in `states`. */
export const missingEntities = (
  config: unknown,
  states: Record<string, unknown> | undefined
): string[] => {
  if (!states) {
    return [];
  }
  return configEntityIds(config).filter((id) => !(id in states));
};

/** A short, stable id for a config, so the same card keeps the same problem id. */
export const configKey = (config: unknown): string => {
  let text: string;
  try {
    text = JSON.stringify(config) ?? "";
  } catch (_err) {
    text = String(config);
  }
  // 32-bit FNV-1a, enough to tell cards on one page apart.
  /* eslint-disable no-bitwise */
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
  /* eslint-enable no-bitwise */
};
