import type { Connection } from "home-assistant-js-websocket";
import {
  saveFrontendSystemData,
  subscribeFrontendSystemData,
} from "../../data/frontend";
import {
  SHARED_IDENTITY_KEY,
  sanitizeIdentity,
  setSharedIdentity,
  type Identity,
} from "./identity";

declare global {
  interface FrontendSystemData {
    identity: Identity;
  }
}

/**
 * Starts reading the identity stored for everyone. Every value that arrives
 * is validated like a locally stored one before it is used.
 */
export const subscribeSharedIdentity = (conn: Connection) =>
  subscribeFrontendSystemData(conn, SHARED_IDENTITY_KEY, ({ value }) => {
    setSharedIdentity(value);
  });

/** Stores the identity for everyone. Administrators only. */
export const applyIdentityForEveryone = (
  conn: Connection,
  identity: Identity
): Promise<void> =>
  saveFrontendSystemData(conn, SHARED_IDENTITY_KEY, sanitizeIdentity(identity));

/** Clears the identity stored for everyone. Administrators only. */
export const removeIdentityForEveryone = (conn: Connection): Promise<void> =>
  saveFrontendSystemData(conn, SHARED_IDENTITY_KEY, {});
