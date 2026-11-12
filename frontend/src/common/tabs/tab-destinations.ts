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

/** The address a tab leads to: a page path, or the path of its destination. */
export const tabRoute = (id: string): string => {
  const { kind, path } = parseDestinationId(id);
  return kind === "page" ? `/${id}` : `/${path}`;
};

const segmentsOf = (path: string): string[] =>
  cleanDestinationPath(path).split("/").filter(Boolean);

/** True when `path` is the destination itself or a route below it. */
export const isRouteUnder = (pathname: string, path: string): boolean => {
  const route = segmentsOf(pathname);
  const base = segmentsOf(path);
  return (
    base.length > 0 &&
    base.length <= route.length &&
    base.every((segment, index) => route[index] === segment)
  );
};

/**
 * The tab that is selected for a location. A settings page or tool tab that is
 * open claims its own route and every route below it, and the most specific
 * one wins (a tab for `config/tools/yaml` beats one for `config/tools`). When
 * no destination tab claims the location, the page tab named by `fallback`
 * (the panel being shown) is selected, so the Settings tab stays the tab for
 * every settings route that no destination tab claims.
 */
export const selectTabForLocation = (
  openIds: readonly string[],
  pathname: string,
  fallback?: string
): string | undefined => {
  let best: { id: string; depth: number } | undefined;
  openIds.forEach((id) => {
    const { kind, path } = parseDestinationId(id);
    if (kind === "page" || !isRouteUnder(pathname, path)) {
      return;
    }
    const depth = segmentsOf(path).length;
    if (!best || depth > best.depth) {
      best = { id, depth };
    }
  });
  return best?.id ?? fallback;
};

/**
 * The tab to go to when the tab in use is closed: the one after it in strip
 * order, or the one before it when it was the last. `orderedOpenIds` lists
 * the open tabs in strip order and still includes the tab being closed.
 */
export const neighbourTab = (
  orderedOpenIds: readonly string[],
  id: string
): string | undefined => {
  const index = orderedOpenIds.indexOf(id);
  if (index === -1) {
    return undefined;
  }
  return orderedOpenIds[index + 1] ?? orderedOpenIds[index - 1];
};

/** Removes repeats so that no destination owns two tabs. */
export const uniqueDestinations = (ids: readonly string[]): string[] =>
  cleanIds([...ids]);
