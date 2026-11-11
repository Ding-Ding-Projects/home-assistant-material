/**
 * Pure rules for the split layout and its divider: how far a divider may move,
 * what a stored size is allowed to be, what a key press does and when two
 * columns give way to a stack. Nothing here touches the page, so the rules can
 * be tested on their own.
 */

/** Pixels moved by an arrow key, and by an arrow key held with Shift. */
export const DIVIDER_STEP = 16;
export const DIVIDER_STEP_LARGE = 64;

/** A stored size above this is treated as damaged and ignored. */
export const MAX_STORED_SIZE = 10000;

export type SplitCollapsed = "" | "start" | "end";

export interface StoredSplitState {
  /** Width of the start side in pixels, as last seen. Older records hold only this. */
  size: number;
  /** Share of the container the start side takes, between 0 and 1. */
  ratio?: number;
  collapsed: SplitCollapsed;
}

/** Keeps a size between a minimum and a maximum; the minimum wins if they cross. */
export const clampSize = (size: number, min: number, max: number): number => {
  const low = Number.isFinite(min) ? Math.max(0, min) : 0;
  const high = Number.isFinite(max) ? Math.max(low, max) : low;
  if (!Number.isFinite(size)) {
    return low;
  }
  return Math.min(high, Math.max(low, size));
};

/**
 * The largest the start side can be: what is left of the container once the
 * end side has its minimum and the divider has its width.
 */
export const maxStartSize = (
  total: number,
  minEnd: number,
  dividerSize: number
): number => Math.max(0, total - minEnd - dividerSize);

/** Whether the two columns are too narrow to sit side by side. */
export const shouldStack = (width: number, stackBelow: number): boolean =>
  Number.isFinite(width) && width > 0 && width < stackBelow;

/** A size as a whole percentage of the container, for assistive technology. */
export const toPercent = (size: number, total: number): number => {
  if (!Number.isFinite(size) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.round(Math.min(100, Math.max(0, (size / total) * 100)));
};

/** Reads one stored size; anything that is not a sensible number is dropped. */
export const parseStoredSize = (raw: unknown): number | undefined => {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < 0 ||
    raw > MAX_STORED_SIZE
  ) {
    return undefined;
  }
  return raw;
};

/** Reads a stored share of the container; only a number above 0 up to 1 counts. */
export const parseStoredRatio = (raw: unknown): number | undefined => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > 1) {
    return undefined;
  }
  return raw;
};

/** A size as a share of the container; undefined when the container is unknown. */
export const sizeToRatio = (
  size: number,
  total: number
): number | undefined => {
  if (!Number.isFinite(size) || !Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  return Math.min(1, Math.max(0, size / total)) || undefined;
};

/**
 * The pixel size a stored state gives for a container. A stored ratio wins
 * when the container is known; an older pixel value is used as it is.
 */
export const resolveStoredSize = (
  state: Pick<StoredSplitState, "size" | "ratio">,
  total: number
): number => {
  if (state.ratio !== undefined && Number.isFinite(total) && total > 0) {
    return Math.round(state.ratio * total);
  }
  return state.size;
};

/** Reads the stored state of a split layout; a damaged value gives nothing. */
export const parseStoredState = (
  raw: unknown
): StoredSplitState | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const { size, ratio, collapsed } = raw as Record<string, unknown>;
  const parsedSize = parseStoredSize(size);
  const parsedRatio = parseStoredRatio(ratio);
  if (parsedSize === undefined && parsedRatio === undefined) {
    return undefined;
  }
  if (collapsed !== "" && collapsed !== "start" && collapsed !== "end") {
    return undefined;
  }
  return { size: parsedSize ?? 0, ratio: parsedRatio, collapsed };
};

/**
 * Whether a stored "filters open" choice may be applied now. The choice only
 * counts while the side pane is shown; on a narrow width it would open the
 * full-width dialog as soon as the page loads.
 */
export const shouldRestoreFiltersOpen = (
  collapsed: SplitCollapsed,
  paneShown: boolean
): boolean => collapsed === "" && paneShown;

export interface StepOptions {
  current: number;
  min: number;
  max: number;
  /** The size the divider returns to on Enter. */
  defaultSize: number;
  rtl: boolean;
  shift: boolean;
}

/**
 * What a key press does to the start side. Returns the new size, or
 * undefined when the key is not one the divider uses. In a right-to-left page
 * the start side is on the right, so the arrows swap.
 */
export const sizeForKey = (
  key: string,
  { current, min, max, defaultSize, rtl, shift }: StepOptions
): number | undefined => {
  const step = shift ? DIVIDER_STEP_LARGE : DIVIDER_STEP;
  switch (key) {
    case "ArrowRight":
      return clampSize(current + (rtl ? -step : step), min, max);
    case "ArrowLeft":
      return clampSize(current + (rtl ? step : -step), min, max);
    case "Home":
      return clampSize(min, min, max);
    case "End":
      return clampSize(max, min, max);
    case "Enter":
      return clampSize(defaultSize, min, max);
    default:
      return undefined;
  }
};

/**
 * The size a drag gives. `delta` is how far the pointer moved along the
 * screen; in a right-to-left page moving right makes the start side smaller.
 */
export const sizeForDrag = (
  startSize: number,
  delta: number,
  rtl: boolean,
  min: number,
  max: number
): number => clampSize(startSize + (rtl ? -delta : delta), min, max);
