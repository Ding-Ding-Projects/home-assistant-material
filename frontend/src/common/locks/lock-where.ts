import type { LockStore } from "./element-locks";

/**
 * Where a lock is, in words, for the list of locks. A lock made with this
 * build keeps the title of its page. Older locks only have their key, which
 * holds the address of the page, so that is shown instead.
 */

const PAGE_PREFIX = "page:";
const ELEMENT_PREFIX = "element:";

/** The address of the page a lock key belongs to; undefined for a key of another form. */
export const lockPageAddress = (key: string): string | undefined => {
  if (key.startsWith(PAGE_PREFIX)) {
    return key.slice(PAGE_PREFIX.length) || "/";
  }
  if (key.startsWith(ELEMENT_PREFIX)) {
    const rest = key.slice(ELEMENT_PREFIX.length);
    const at = rest.indexOf("#");
    return (at === -1 ? rest : rest.slice(0, at)) || "/";
  }
  return undefined;
};

export const isPageLockKey = (key: string): boolean =>
  key.startsWith(PAGE_PREFIX);

/** The name of the page a lock is on: its stored title, else its address. */
export const lockPageName = (
  store: LockStore,
  key: string
): string | undefined =>
  store.records?.[key]?.page ?? lockPageAddress(key) ?? undefined;
