import { getStorage } from "../decorators/storage";

/**
 * Browser storage can be blocked, full or hold text that is not valid JSON.
 * These helpers never throw: a read gives undefined and a write gives false.
 */
export const safeGetStored = <T>(key: string): T | undefined => {
  try {
    return getStorage().getValue<T>(key);
  } catch (_err) {
    return undefined;
  }
};

export const safeSetStored = <T>(key: string, value: T): boolean => {
  try {
    getStorage().setValue<T>(key, value);
    return true;
  } catch (_err) {
    return false;
  }
};
