/**
 * The plain rules behind the progress ring of an update run: how full it is.
 * Pure functions, so they can be tested without a page.
 */

export interface RingValue {
  /** How full the ring is, from 0 to 1. */
  fraction: number;
  /** The steps that are finished. */
  finished: number;
  /** All steps of the run. */
  total: number;
}

/**
 * The ring of a run fills to the steps that are finished out of all steps.
 * Nothing else is guessed: a run with no steps is an empty ring.
 */
export const ringFromSteps = (finished: number, total: number): RingValue => {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const safeFinished =
    Number.isFinite(finished) && finished > 0
      ? Math.min(Math.floor(finished), safeTotal)
      : 0;
  return {
    fraction: safeTotal ? safeFinished / safeTotal : 0,
    finished: safeFinished,
    total: safeTotal,
  };
};

/** The stroke-dashoffset that shows `fraction` of a circle. */
export const ringOffset = (fraction: number, circumference: number): number =>
  circumference * (1 - Math.max(0, Math.min(1, fraction)));
