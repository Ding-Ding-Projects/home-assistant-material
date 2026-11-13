import type { LovelaceConfig } from "../../../../data/lovelace/config/types";

/**
 * Named checkpoints of a dashboard, stored in this browser only. The product
 * does not keep a version history of dashboards, so a person names the
 * moments they want to compare or return to.
 */

export interface Checkpoint {
  id: string;
  name: string;
  at: number;
  config: LovelaceConfig;
}

export const CHECKPOINT_LIMIT = 20;

/** A stored checkpoint larger than this is not kept, in characters. */
export const CHECKPOINT_SIZE_LIMIT = 512 * 1024;

const storageKey = (urlPath: string | null) =>
  `dashboardCheckpoints:${urlPath ?? "default"}`;

export const normalizeCheckpoints = (raw: unknown): Checkpoint[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (c): c is Checkpoint =>
        !!c &&
        typeof c === "object" &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        Number.isFinite(c.at) &&
        !!c.config &&
        typeof c.config === "object" &&
        Array.isArray((c.config as LovelaceConfig).views)
    )
    .slice(-CHECKPOINT_LIMIT);
};

export const readCheckpoints = (urlPath: string | null): Checkpoint[] => {
  try {
    return normalizeCheckpoints(
      JSON.parse(window.localStorage.getItem(storageKey(urlPath)) || "null")
    );
  } catch (_err) {
    return [];
  }
};

/** Adds a checkpoint; throws when it is too large or the browser refuses to store it. */
export const addCheckpoint = (
  urlPath: string | null,
  name: string,
  config: LovelaceConfig,
  at = Date.now()
): Checkpoint[] => {
  const checkpoint: Checkpoint = {
    id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    at,
    config: structuredClone(config),
  };
  if (JSON.stringify(checkpoint).length > CHECKPOINT_SIZE_LIMIT) {
    throw new Error("too_large");
  }
  const next = [...readCheckpoints(urlPath), checkpoint].slice(
    -CHECKPOINT_LIMIT
  );
  window.localStorage.setItem(storageKey(urlPath), JSON.stringify(next));
  return next;
};

export const removeCheckpoint = (
  urlPath: string | null,
  id: string
): Checkpoint[] => {
  const next = readCheckpoints(urlPath).filter((c) => c.id !== id);
  try {
    window.localStorage.setItem(storageKey(urlPath), JSON.stringify(next));
  } catch (_err) {
    // Nothing stored, nothing to remove.
  }
  return next;
};
