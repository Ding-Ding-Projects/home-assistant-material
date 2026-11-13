import { getStorage } from "../decorators/storage";
import { cleanSurface, surfaceEntries } from "./tab-validate";

/** The edge of the screen a tab strip is docked to. */

/**
 * The storage key. It was "pageTabsDock" while earlier builds wrote "top"
 * there by themselves; a new key means only an edge a person chose is read.
 */
export const DOCK_STORAGE_KEY = "pageTabsEdge";

/**
 * The edges a strip can be docked to, and "float": a panel the person drags
 * anywhere over the page, which takes no room from it.
 */
export const DOCK_EDGES = ["left", "right", "top", "bottom", "float"] as const;

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

/** A strip on the left or right, or floating, runs top to bottom. */
export const isVerticalDock = (edge: DockEdge): boolean =>
  edge === "left" || edge === "right" || edge === "float";

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

// Floating: where the panel sits.

export const FLOAT_STORAGE_KEY = "pageTabsFloat";

/**
 * The top left corner of a floating strip, as a share of the window's width
 * and height (0 to 1), so it stays in the same place on another window size.
 */
export interface FloatPosition {
  x: number;
  y: number;
}

export type FloatStore = Record<string, FloatPosition>;

/** Where a strip floats before it is moved: near the top left, clear of the rail. */
export const DEFAULT_FLOAT: FloatPosition = { x: 0.1, y: 0.12 };

const share = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : undefined;

export const normalizeFloat = (raw: unknown): FloatStore => {
  const store: FloatStore = {};
  surfaceEntries(raw).forEach(([surface, value]) => {
    if (value && typeof value === "object") {
      const x = share((value as Record<string, unknown>).x);
      const y = share((value as Record<string, unknown>).y);
      if (x !== undefined && y !== undefined) {
        store[surface] = { x, y };
      }
    }
  });
  return store;
};

export const floatFor = (store: FloatStore, surface?: string): FloatPosition =>
  store[cleanSurface(surface)] ?? DEFAULT_FLOAT;

export const withFloat = (
  store: FloatStore,
  surface: string | undefined,
  position: FloatPosition
): FloatStore => {
  const x = share(position.x);
  const y = share(position.y);
  if (x === undefined || y === undefined) {
    return store;
  }
  return { ...store, [cleanSurface(surface)]: { x, y } };
};

/**
 * The pixel position of a floating panel of the given size in a window of the
 * given size, kept fully on screen with a margin.
 */
export const floatPixels = (
  position: FloatPosition,
  panel: { width: number; height: number },
  window: { width: number; height: number },
  margin = 8
): { left: number; top: number } => {
  const clamp = (value: number, max: number) =>
    Math.round(Math.min(Math.max(margin, value), Math.max(margin, max)));
  return {
    left: clamp(position.x * window.width, window.width - panel.width - margin),
    top: clamp(
      position.y * window.height,
      window.height - panel.height - margin
    ),
  };
};

/** The stored position for a panel whose top left corner is at these pixels. */
export const floatFromPixels = (
  left: number,
  top: number,
  window: { width: number; height: number }
): FloatPosition => ({
  x: share(window.width ? left / window.width : 0) ?? 0,
  y: share(window.height ? top / window.height : 0) ?? 0,
});

export const readFloat = (surface?: string): FloatPosition =>
  floatFor(normalizeFloat(getStorage().getValue(FLOAT_STORAGE_KEY)), surface);

export const writeFloat = (
  surface: string | undefined,
  position: FloatPosition
): void =>
  getStorage().setValue(
    FLOAT_STORAGE_KEY,
    withFloat(
      normalizeFloat(getStorage().getValue(FLOAT_STORAGE_KEY)),
      surface,
      position
    )
  );

// Collapsing: a strip that shows its tabs' icons only.

export const COLLAPSE_STORAGE_KEY = "pageTabsCollapsed";

/** Stored shape: the strips that are collapsed. Expanded strips are not kept. */
export type CollapseStore = Record<string, true>;

export const normalizeCollapse = (raw: unknown): CollapseStore => {
  const store: CollapseStore = {};
  surfaceEntries(raw).forEach(([surface, value]) => {
    if (value === true) {
      store[surface] = true;
    }
  });
  return store;
};

export const withCollapsed = (
  store: CollapseStore,
  surface: string | undefined,
  collapsed: boolean
): CollapseStore => {
  const key = cleanSurface(surface);
  const next = { ...store };
  if (collapsed) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return next;
};

export const readCollapsed = (surface?: string): boolean =>
  normalizeCollapse(getStorage().getValue(COLLAPSE_STORAGE_KEY))[
    cleanSurface(surface)
  ] === true;

export const writeCollapsed = (
  surface: string | undefined,
  collapsed: boolean
): void =>
  getStorage().setValue(
    COLLAPSE_STORAGE_KEY,
    withCollapsed(
      normalizeCollapse(getStorage().getValue(COLLAPSE_STORAGE_KEY)),
      surface,
      collapsed
    )
  );
