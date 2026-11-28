import type { OwnerScopedSync } from "../instance-sync/sync-owner";
import {
  clearPersonalVocabulary,
  restorePersonalVocabulary,
} from "./personal-vocabulary";

// Older releases kept a timestamp for this setting. It still distinguishes
// an unowned legacy cache from one belonging to a previous signed-in user.
const previousAgeKey = "instanceSync.personal_wording";

export const localWordingCache: OwnerScopedSync = {
  hasAge() {
    try {
      return window.localStorage.getItem(previousAgeKey) !== null;
    } catch {
      return true;
    }
  },
  restoreLocal: restorePersonalVocabulary,
  resetLocal() {
    clearPersonalVocabulary();
    try {
      window.localStorage.removeItem(previousAgeKey);
    } catch {
      // Storage can be unavailable in this browser.
    }
  },
};
