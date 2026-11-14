import type { LovelaceRawConfig } from "../../../../data/lovelace/config/types";

/** Local recovery journal, separate from named checkpoints and unsaved drafts. */
export interface SavedRevision {
  at: number;
  before: LovelaceRawConfig;
  after: LovelaceRawConfig;
}

export interface RevisionScope {
  userId: string;
  urlPath: string | null;
}

export const SAVED_REVISION_LIMIT = 20;
export const SAVED_REVISION_SIZE_LIMIT = 1024 * 1024;

type RevisionStorage = Pick<Storage, "getItem" | "setItem">;

// JSON tuple encoding avoids user/path delimiter collisions. Origin isolation is
// provided by localStorage; no anonymous bucket is ever created.
const storageKey = ({ userId, urlPath }: RevisionScope) =>
  `dashboardSavedRevisions:v1:${JSON.stringify([userId, urlPath])}`;

const isConfig = (value: unknown): value is LovelaceRawConfig => {
  if (!value || typeof value !== "object") return false;
  return (
    ("views" in value && Array.isArray(value.views)) ||
    ("strategy" in value &&
      !!value.strategy &&
      typeof value.strategy === "object")
  );
};

export const readSavedRevisions = (
  scope: RevisionScope,
  storage?: RevisionStorage
): SavedRevision[] => {
  if (!scope.userId) return [];
  try {
    const serialized = (storage ?? window.localStorage).getItem(
      storageKey(scope)
    );
    if (!serialized || serialized.length > SAVED_REVISION_SIZE_LIMIT) return [];
    const data: unknown = JSON.parse(serialized);
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (entry): entry is SavedRevision =>
          !!entry &&
          typeof entry === "object" &&
          Number.isFinite(entry.at) &&
          isConfig(entry.before) &&
          isConfig(entry.after)
      )
      .slice(-SAVED_REVISION_LIMIT);
  } catch {
    return [];
  }
};

/** Best effort: recovery storage must never turn a successful save into a failure. */
export const recordSavedRevision = (
  scope: RevisionScope,
  before: LovelaceRawConfig,
  after: LovelaceRawConfig,
  at = Date.now(),
  storage?: RevisionStorage
): boolean => {
  if (!scope.userId) return false;
  try {
    const target = storage ?? window.localStorage;
    const entry: SavedRevision = { at, before, after };
    const serializedEntry = JSON.stringify(entry);
    if (serializedEntry.length + 2 > SAVED_REVISION_SIZE_LIMIT) return false;
    if (JSON.stringify(before) === JSON.stringify(after)) return true;
    const entries = [...readSavedRevisions(scope, target), entry].slice(
      -SAVED_REVISION_LIMIT
    );
    let serialized = JSON.stringify(entries);
    while (
      serialized.length > SAVED_REVISION_SIZE_LIMIT &&
      entries.length > 1
    ) {
      entries.shift();
      serialized = JSON.stringify(entries);
    }
    target.setItem(storageKey(scope), serialized);
    return true;
  } catch {
    return false;
  }
};

/** Never journal a pending or rejected backend save. Capture identity at call time. */
export const saveWithRevision = async (
  save: () => Promise<void>,
  scope: RevisionScope | undefined,
  before: LovelaceRawConfig,
  after: LovelaceRawConfig,
  storage?: RevisionStorage
): Promise<void> => {
  // Snapshot before awaiting so another edit cannot mutate the recorded content.
  let snapshot:
    | {
        scope: RevisionScope;
        before: LovelaceRawConfig;
        after: LovelaceRawConfig;
      }
    | undefined;
  try {
    if (scope?.userId) snapshot = structuredClone({ scope, before, after });
  } catch {
    // A journal snapshot failure must not prevent normal saving.
  }
  await save();
  if (snapshot) {
    recordSavedRevision(
      snapshot.scope,
      snapshot.before,
      snapshot.after,
      Date.now(),
      storage
    );
  }
};
