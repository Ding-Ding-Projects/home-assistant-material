/** Zoom steps offered by the plus and minus buttons of the flow view. */
export const FLOW_ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

/** The smallest scale a fit will choose, so labels stay readable. */
export const FLOW_MIN_FIT = 0.4;

/**
 * The scale at which a graph fits its canvas. "width" fits only the width (the
 * graph then scrolls down when it is taller), "both" fits the whole graph. A
 * graph that already fits is shown at 100%, never enlarged.
 */
export const fitScale = (
  canvasWidth: number,
  canvasHeight: number,
  graphWidth: number,
  graphHeight: number,
  mode: "width" | "both" = "width"
): number => {
  if (canvasWidth <= 0 || graphWidth <= 0 || graphHeight <= 0) {
    return 1;
  }
  const byWidth = canvasWidth / graphWidth;
  const ratio =
    mode === "both" && canvasHeight > 0
      ? Math.min(byWidth, canvasHeight / graphHeight)
      : byWidth;
  return Math.max(FLOW_MIN_FIT, Math.min(1, ratio));
};

/** The next zoom step above or below the current scale, or the same scale. */
export const stepZoom = (scale: number, direction: 1 | -1): number => {
  if (direction === 1) {
    return FLOW_ZOOMS.find((z) => z > scale + 0.001) ?? scale;
  }
  const lower = FLOW_ZOOMS.filter((z) => z < scale - 0.001);
  return lower.length ? lower[lower.length - 1] : scale;
};
