/**
 * Pure rules for the address an embedded page points at.
 */

/** Resolves an address against the page it is shown from; undefined if it is not a valid address. */
export const resolveAddress = (
  address: string,
  base: string
): URL | undefined => {
  try {
    return new URL(address, base);
  } catch {
    return undefined;
  }
};

/**
 * The address as it may be shown on screen: scheme, host and path only. Any
 * user name and password, query string and fragment are left out, because they
 * can carry a token or a name. A query is marked with an ellipsis so the
 * address does not look complete when it is not.
 */
export const displayAddress = (address: string, base: string): string => {
  const url = resolveAddress(address, base);
  if (!url) {
    // Cut at the first character that can start a query or a fragment, and
    // drop anything before an at sign in the authority.
    const cut = address.split(/[?#]/)[0];
    return cut.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  }
  if (url.origin === "null") {
    return `${url.protocol}…`;
  }
  return `${url.origin}${url.pathname}${url.search ? "?…" : ""}`;
};

/** True when the address carries a part that `displayAddress` hides. */
export const hasHiddenAddressParts = (
  address: string,
  base: string
): boolean => {
  const url = resolveAddress(address, base);
  if (!url) {
    return /[?#@]/.test(address);
  }
  return !!(url.search || url.hash || url.username || url.password);
};

/**
 * Whether an address is on this instance's own origin. Only such an address
 * may be opened from the product in a new window; an outside address is shown
 * as text so the person decides to visit it.
 */
export const isOwnOrigin = (address: string, base: string): boolean => {
  const url = resolveAddress(address, base);
  const own = resolveAddress(base, base);
  return !!url && !!own && url.origin === own.origin && url.origin !== "null";
};
