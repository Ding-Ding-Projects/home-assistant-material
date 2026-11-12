import { getStorage } from "../decorators/storage";
import { cleanSurface, surfaceEntries } from "./tab-validate";

/** The edge of the screen a tab strip is docked to. */

export const DOCK_STORAGE_KEY = "pageTabsDock";

export const DOCK_EDGES = ["left", "right", "top", "bottom"] as const;

export type DockEdge = (typeof DOCK_EDGES)[number];

/** The edge when nothing was chosen. */
export const DEFAULT_DOCK_EDGE: DockEdge = "left";

/** Stored shape: strip name to its edge. Only chosen edges are kept. */
export type DockStore = Record<string, DockEdge>;

export const isDockEdge = (value: unknown): value is DockEdge =>
  typeof value === "string" &&
  (DOCK_EDGES as readonly string[]).includes(value);

export const normalizeDock = (raw: unknown): DockStore => {
  const store: DockStore = {};
  surfaceEntries(raw).forEach(([surface, edge]) => {
    if (isDockEdge(edge)) {
      store[surface] = edge;
    }
  });
  return store;
};

/** The edge of one strip; left unless the person chose another. */
export const dockFor = (store: DockStore, surface?: string): DockEdge =>
  store[cleanSurface(surface)] ?? DEFAULT_DOCK_EDGE;

/** The store after choosing an edge. Choosing the default removes the entry. */
export const withDock = (
  store: DockStore,
  surface: string | undefined,
  edge: unknown
): DockStore => {
  const key = cleanSurface(surface);
  const next = { ...store };
  if (!isDockEdge(edge) || edge === DEFAULT_DOCK_EDGE) {
    delete next[key];
  } else {
    next[key] = edge;
  }
  return next;
};

/** A strip on the left or right runs top to bottom. */
export const isVerticalDock = (edge: DockEdge): boolean =>
  edge === "left" || edge === "right";

/** The `aria-orientation` of a strip docked to the edge. */
export const dockOrientation = (edge: DockEdge): "horizontal" | "vertical" =>
  isVerticalDock(edge) ? "vertical" : "horizontal";

export const readDock = (surface?: string): DockEdge =>
  dockFor(normalizeDock(getStorage().getValue(DOCK_STORAGE_KEY)), surface);

export const writeDock = (surface: string | undefined, edge: DockEdge): void =>
  getStorage().setValue(
    DOCK_STORAGE_KEY,
    withDock(
      normalizeDock(getStorage().getValue(DOCK_STORAGE_KEY)),
      surface,
      edge
    )
  );
