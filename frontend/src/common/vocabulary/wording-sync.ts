import { UserDataSync } from "../instance-sync/user-data-sync";
import {
  applyInstanceVocabulary,
  getStoredPersonalVocabulary,
  parsePersonalVocabulary,
  restorePersonalVocabulary,
  subscribeLocalVocabularyChange,
} from "./personal-vocabulary";

/**
 * Personal wording, saved on this instance for the signed-in person under the
 * user-data key `personal_wording`. The value is the same checked entries the
 * browser caches, wrapped with a version and an `updated` time by the shared
 * sync helper.
 *
 * The wording never goes anywhere except this instance's own websocket, and
 * a copy that arrives is checked in full again before it is used.
 */

export const WORDING_SYNC_KEY = "personal_wording" as const;

export type WordingEntries = Record<string, string>;

/**
 * Checks the stored entries like a dropped file (same limits, same rules);
 * undefined if they fail or are empty.
 */
export const validateWordingData = (
  data: unknown
): WordingEntries | undefined => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }
  let text: string;
  try {
    text = JSON.stringify({ schemaVersion: 1, entries: data });
  } catch (_err) {
    return undefined;
  }
  const result = parsePersonalVocabulary(text);
  return result.ok && result.count ? result.entries : undefined;
};

export const wordingSync = new UserDataSync<WordingEntries>({
  key: WORDING_SYNC_KEY,
  validate: (data) => validateWordingData(data),
  readLocal: getStoredPersonalVocabulary,
  writeLocal: applyInstanceVocabulary,
  // A second tab keeps its memory in step with the cache the first one wrote.
  refreshLocal: restorePersonalVocabulary,
});

// A drop, a Settings upload or a clear on this device goes to the instance.
subscribeLocalVocabularyChange(() => wordingSync.push());
