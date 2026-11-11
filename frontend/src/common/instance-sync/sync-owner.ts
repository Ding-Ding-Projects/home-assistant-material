/**
 * Ties the browser's cached copy of the synced settings to the account that
 * made it.
 *
 * The cache (personal wording, appearance choices, reading options,
 * accessibility tools) and the ages kept beside it live in this browser. A
 * session can end without a clean sign-out (an expired or revoked token, a
 * removed session), which leaves the cache behind. If the next person signed
 * in on the same browser, their page would show the previous person's wording
 * and the sync would upload it into their account. So the cache records the
 * account it belongs to, and a different account starts from nothing, before
 * the first merge.
 *
 * One case is a migration, not a mismatch: a cache with no recorded owner and
 * no ages was made before this feature existed and was never synced. The
 * first account to sign in claims it once and it uploads as before, so
 * nobody loses settings on the update.
 */

export const SYNC_OWNER_KEY = "instanceSync.owner";

const META_PREFIX = "instanceSync.";

/** What the owner check needs from each synced setting. */
export interface OwnerScopedSync {
  /** Forgets the cached value, its age and what is on screen. */
  resetLocal(): void;
  /** Puts the cached value in use, once its owner is confirmed. */
  restoreLocal(): void;
  /** True when this browser holds an age for the cached value. */
  hasAge(): boolean;
}

// The account this page has already claimed the cache for.
let claimed: string | undefined;

const readOwner = (): string | undefined => {
  try {
    return window.localStorage.getItem(SYNC_OWNER_KEY) ?? undefined;
  } catch (_err) {
    return undefined;
  }
};

const writeOwner = (userId: string): void => {
  try {
    window.localStorage.setItem(SYNC_OWNER_KEY, userId);
  } catch (_err) {
    // Without storage nothing is cached either.
  }
};

/** True when any owner or age key exists, so the cache was synced before. */
const hasSyncRecord = (): boolean => {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      if (window.localStorage.key(i)?.startsWith(META_PREFIX)) {
        return true;
      }
    }
  } catch (_err) {
    // Treated as having a record, so nothing is shown that might not be theirs.
    return true;
  }
  return false;
};

/**
 * Whether the cached copy may be put in use right now, before the account is
 * known: only when this page already claimed it, or when it is an old cache
 * that was never synced (no owner and no ages). A cache with a recorded owner
 * waits until that owner is confirmed, so it is never shown for one frame to
 * a different account.
 */
export const syncCacheUsable = (): boolean =>
  claimed !== undefined || !hasSyncRecord();

/**
 * Confirms the signed-in account owns the cache. Returns false, and touches
 * nothing, when the account is not known yet. When the stored owner is a
 * different account, or the cache has ages but no owner, the cache is cleared
 * before anything can read or upload it. A cache with neither owner nor ages
 * is claimed by this account. When the owner matches, the cache is put in use.
 */
export const claimSyncOwner = (
  userId: string | undefined,
  syncs: OwnerScopedSync[]
): boolean => {
  if (!userId) {
    return false;
  }
  if (claimed === userId) {
    return true;
  }
  const stored = readOwner();
  const legacy =
    claimed === undefined &&
    stored === undefined &&
    !syncs.some((sync) => sync.hasAge());
  const mismatch = !legacy && (claimed !== undefined || stored !== userId);
  claimed = userId;
  if (mismatch) {
    syncs.forEach((sync) => sync.resetLocal());
    writeOwner(userId);
  } else {
    if (legacy) {
      writeOwner(userId);
    }
    syncs.forEach((sync) => sync.restoreLocal());
  }
  return true;
};

/** For tests: forgets which account this page claimed the cache for. */
export const forgetClaimedOwner = (): void => {
  claimed = undefined;
};
