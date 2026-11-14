import { deepEqual } from "../../../../common/util/deep-equal";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";

export interface CardDraftScope {
  userId: string;
  urlPath: string | null;
  path: readonly (string | number)[];
}

export interface CardDraft {
  path: readonly (string | number)[];
  at: number;
  original: LovelaceCardConfig;
  config: LovelaceCardConfig;
}

const LIMIT = 10;
export const CARD_DRAFT_SIZE_LIMIT = 256 * 1024;
const TOTAL_LIMIT = 1024 * 1024;
type DraftStorage = Pick<Storage, "getItem" | "setItem">;
const key = (scope: CardDraftScope) =>
  `dashboardCardDrafts:v1:${JSON.stringify([scope.userId, scope.urlPath])}`;
const validCard = (value: unknown): value is LovelaceCardConfig =>
  !!value &&
  typeof value === "object" &&
  "type" in value &&
  typeof value.type === "string";

const readDrafts = (
  scope: CardDraftScope,
  storage: DraftStorage
): CardDraft[] => {
  const serialized = storage.getItem(key(scope));
  if (!serialized || serialized.length > TOTAL_LIMIT) return [];
  const data: unknown = JSON.parse(serialized);
  return Array.isArray(data)
    ? data
        .filter(
          (entry): entry is CardDraft =>
            !!entry &&
            typeof entry === "object" &&
            Number.isFinite(entry.at) &&
            Array.isArray(entry.path) &&
            entry.path.every(
              (part: unknown) =>
                typeof part === "string" || Number.isInteger(part)
            ) &&
            validCard(entry.original) &&
            validCard(entry.config)
        )
        .slice(-LIMIT)
    : [];
};

export const readCardDraft = (
  scope: CardDraftScope,
  storage?: DraftStorage
): CardDraft | undefined => {
  if (!scope.userId) return undefined;
  try {
    return readDrafts(scope, storage ?? window.localStorage).find((entry) =>
      deepEqual(entry.path, scope.path)
    );
  } catch {
    return undefined;
  }
};

export const canRecoverCardDraft = (
  draft: CardDraft,
  original: LovelaceCardConfig
): boolean => deepEqual(draft.original, original);

/** Local-only, bounded recovery. Never fail editing because persistence is unavailable. */
export const writeCardDraft = (
  scope: CardDraftScope,
  original: LovelaceCardConfig,
  config: LovelaceCardConfig,
  storage?: DraftStorage
): CardDraft | undefined => {
  if (
    !scope.userId ||
    !validCard(original) ||
    !validCard(config) ||
    !Array.isArray(scope.path) ||
    !scope.path.every(
      (part) => typeof part === "string" || Number.isInteger(part)
    )
  ) {
    return undefined;
  }
  try {
    const target = storage ?? window.localStorage;
    const entry = { path: scope.path, at: Date.now(), original, config };
    if (JSON.stringify(entry).length > CARD_DRAFT_SIZE_LIMIT) return undefined;
    let entries: CardDraft[];
    try {
      entries = readDrafts(scope, target);
    } catch {
      entries = [];
    }
    entries = [
      ...entries.filter((item) => !deepEqual(item.path, scope.path)),
      entry,
    ].slice(-LIMIT);
    let serialized = JSON.stringify(entries);
    while (serialized.length > TOTAL_LIMIT && entries.length > 1) {
      entries.shift();
      serialized = JSON.stringify(entries);
    }
    target.setItem(key(scope), serialized);
    return structuredClone(entry);
  } catch {
    return undefined;
  }
};

/** Do not discard a newer draft written by another editor tab. */
export const removeCardDraft = (
  scope: CardDraftScope,
  expected: CardDraft,
  storage?: DraftStorage
): void => {
  try {
    const target = storage ?? window.localStorage;
    const entries = readDrafts(scope, target);
    target.setItem(
      key(scope),
      JSON.stringify(entries.filter((entry) => !deepEqual(entry, expected)))
    );
  } catch {
    // Recovery storage is best effort and must not block closing an editor.
  }
};

/** Closing an editor does not discard an older draft the user has not recovered. */
export const clearEditorCardDraft = (
  scope: CardDraftScope,
  written: CardDraft | undefined,
  pending: CardDraft | undefined,
  discardPending = false,
  storage?: DraftStorage
): void => {
  if (pending && !discardPending) return;
  const target = discardPending ? (pending ?? written) : written;
  if (target) removeCardDraft(scope, target, storage);
};
