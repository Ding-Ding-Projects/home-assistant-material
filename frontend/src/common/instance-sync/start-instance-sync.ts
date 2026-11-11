import type { Connection } from "home-assistant-js-websocket";
import { appearanceSync } from "../appearance/appearance-sync";
import { wordingSync } from "../vocabulary/wording-sync";
import { claimSyncOwner } from "./sync-owner";

/**
 * Starts saving the person's appearance choices and personal wording on this
 * instance, and loading them after sign-in. Call it once the connection is
 * up and the signed-in account is known; calling it again for the same
 * connection is counted, and each returned function lets go of its own call.
 *
 * Before anything is read or sent, the browser's cached copy is checked
 * against the account: a cache that belongs to someone else, or to nobody
 * known, is cleared first, so one person's private wording or appearance is
 * never shown to, or uploaded for, another account on the same browser.
 *
 * Only a signed-in connection ever reaches this: the sign-in page never reads
 * or loads either value. Without an account id nothing starts.
 */
/**
 * Starts the sync once, whenever the account first becomes known. A page can
 * subscribe before the signed-in user has loaded, so the caller asks again
 * on each update: this does nothing until there is a user id, starts exactly
 * once, and lets go of its one start in `release`.
 */
export class InstanceSyncStarter {
  private _stop?: () => void;

  public ensure(conn: Connection, userId: string | undefined): void {
    if (!this._stop && userId) {
      this._stop = startInstanceSync(conn, userId);
    }
  }

  public release(): void {
    this._stop?.();
    this._stop = undefined;
  }
}

export const startInstanceSync = (
  conn: Connection,
  userId: string | undefined
): (() => void) => {
  if (!claimSyncOwner(userId, [wordingSync, appearanceSync])) {
    return () => undefined;
  }
  const stopWording = wordingSync.start(conn);
  const stopAppearance = appearanceSync.start(conn);
  return () => {
    stopWording();
    stopAppearance();
  };
};
