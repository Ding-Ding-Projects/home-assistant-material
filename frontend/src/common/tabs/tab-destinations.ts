import { cleanIds, isSafeKey } from "./tab-validate";

/**
 * Destination identity: one tab per destination.
 *
 * A sidebar page keeps its bare URL path as its id, exactly as the tabs
 * already stored by earlier versions, so nothing needs to migrate. Settings
 * pages and tools use a prefix so they can never collide with a page.
 */

export type DestinationKind = "page" | "settings" | "tool";

const PREFIXES: Record<Exclude<DestinationKind, "page">, string> = {
  settings: "settings:",
  tool: "tool:",
};

/** Path without query, hash or trailing and leading slashes. */
export const cleanDestinationPath = (path: string): string =>
  path.split(/[?#]/)[0].replace(/^\/+/, "").replace(/\/+$/, "");

/** The stable id of a destination; undefined when the path is unusable. */
export const destinationId = (
  kind: DestinationKind,
  path: string
): string | undefined => {
  const clean = cleanDestinationPath(typeof path === "string" ? path : "");
  const id = kind === "page" ? clean : `${PREFIXES[kind]}${clean}`;
  return clean && isSafeKey(id) ? id : undefined;
};

/** What kind and path a stored id stands for. */
export const parseDestinationId = (
  id: string
): { kind: DestinationKind; path: string } => {
  for (const kind of ["settings", "tool"] as const) {
    if (id.startsWith(PREFIXES[kind])) {
      return { kind, path: id.slice(PREFIXES[kind].length) };
    }
  }
  return { kind: "page", path: id };
};

export type OpenDestination =
  | { action: "focus"; id: string }
  | { action: "open"; id: string; reopen: boolean }
  | { action: "none" };

/**
 * What choosing a destination does. An open tab for it is focused; no second
 * tab is made. A closed one is opened again; a never-opened one is opened.
 * `openIds` are the ids of the tabs now in the strip.
 */
export const openDestination = (
  openIds: readonly string[],
  closed: readonly string[],
  kind: DestinationKind,
  path: string
): OpenDestination => {
  const id = destinationId(kind, path);
  if (!id) {
    return { action: "none" };
  }
  if (openIds.includes(id)) {
    return { action: "focus", id };
  }
  return { action: "open", id, reopen: closed.includes(id) };
};

/** The tab id whose destination contains a location, for the active tab. */
export const tabForLocation = (
  openIds: readonly string[],
  pathname: string
): string | undefined => {
  const segments = cleanDestinationPath(pathname).split("/");
  const candidates = cleanIds(
    openIds.filter((id) => parseDestinationId(id).kind === "page")
  );
  // A page id is the first path segment (`config` for `/config/devices`).
  return candidates.find((id) => id === segments[0]);
};

/** Removes repeats so that no destination owns two tabs. */
export const uniqueDestinations = (ids: readonly string[]): string[] =>
  cleanIds([...ids]);
