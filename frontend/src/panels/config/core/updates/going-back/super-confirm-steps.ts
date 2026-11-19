/**
 * The five steps of the super confirmation, finished in order and in one
 * sitting. Plain functions so the order can be tested without a page.
 */

export const SUPER_STEPS = ["keys", "moles", "four", "coin", "cookie"] as const;

export type SuperStep = (typeof SUPER_STEPS)[number];

export interface SuperProgress {
  /** How many steps are finished; the next one is `SUPER_STEPS[done]`. */
  done: number;
}

export const startSuperConfirm = (): SuperProgress => ({ done: 0 });

/** The step being played now, or undefined when all are finished. */
export const currentStep = (progress: SuperProgress): SuperStep | undefined =>
  SUPER_STEPS[progress.done];

/**
 * Marks a step finished. Only the current step can be finished: a step
 * reported out of order changes nothing.
 */
export const finishStep = (
  progress: SuperProgress,
  step: SuperStep
): SuperProgress =>
  currentStep(progress) === step ? { done: progress.done + 1 } : progress;

export const allStepsDone = (progress: SuperProgress): boolean =>
  progress.done >= SUPER_STEPS.length;

export type StepState = "done" | "current" | "waiting";

export const stepState = (
  progress: SuperProgress,
  step: SuperStep
): StepState => {
  const index = SUPER_STEPS.indexOf(step);
  if (index < progress.done) {
    return "done";
  }
  return index === progress.done ? "current" : "waiting";
};

/** Leaving the page, or hiding it, starts again from step 1. */
export const leftPage = (_progress: SuperProgress): SuperProgress =>
  startSuperConfirm();
