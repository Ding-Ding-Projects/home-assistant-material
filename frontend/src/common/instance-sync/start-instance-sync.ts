import type { Connection } from "home-assistant-js-websocket";
import { appearanceSync } from "../appearance/appearance-sync";
import { wordingSync } from "../vocabulary/wording-sync";

/**
 * Starts saving the person's appearance choices and personal wording on this
 * instance, and loading them after sign-in. Call it once the connection is
 * up; calling it again for the same connection does nothing. Returns the
 * function that stops it.
 *
 * Only a signed-in connection ever reaches this: the sign-in page never reads
 * or loads either value.
 */
export const startInstanceSync = (conn: Connection): (() => void) => {
  const stopWording = wordingSync.start(conn);
  const stopAppearance = appearanceSync.start(conn);
  return () => {
    stopWording();
    stopAppearance();
  };
};
