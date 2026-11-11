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
 * Whether an address is on this instance's own origin. Only such an address
 * may be opened from the product in a new window; an outside address is shown
 * as text so the person decides to visit it.
 */
export const isOwnOrigin = (address: string, base: string): boolean => {
  const url = resolveAddress(address, base);
  const own = resolveAddress(base, base);
  return !!url && !!own && url.origin === own.origin && url.origin !== "null";
};
