/**
 * The decision behind the dim sum surprise, with no DOM and no timers.
 *
 * Once per launch (one page load of the app shell) there is one random draw.
 * It shows a dish when the draw is below the chance and nothing that must not
 * be interrupted is going on at that moment. A draw that does not show is
 * simply lost for that launch.
 */

export const DIM_SUM_CHANCE = 0.1;

/** How long the shell may take to settle before the draw is lost. */
export const DIM_SUM_SETTLE_MS = 5000;

/** How long the card stays, unless it is paused. */
export const DIM_SUM_VISIBLE_MS = 6000;

export interface DimSumAppState {
  /** School mode is on: the surprise is not present at all. */
  schoolMode: boolean;
  /** The first-run onboarding is showing. */
  onboarding: boolean;
  /** The sign in or authorize page is showing. */
  signInPage: boolean;
  /** The connection to the server is up. */
  connected: boolean;
  /** The server is starting, restarting, stopping or an update is running. */
  serverBusy: boolean;
  /** The panels and user data the shell needs are not loaded yet. */
  shellLoading: boolean;
  /** An error screen is showing. */
  errorShown: boolean;
  /** A dialog is open. */
  dialogOpen: boolean;
  /** A page has changes that are not saved. */
  unsavedChanges: boolean;
}

export type DimSumDecision = "show" | "skip" | "wait";

/**
 * What to do with this launch's draw right now.
 *
 * - "skip": the draw is lost, nothing more happens this launch.
 * - "wait": the shell has not settled; ask again shortly. After
 *   `DIM_SUM_SETTLE_MS` of waiting the draw is lost.
 * - "show": show one dish.
 */
export const decideDimSum = (
  random: number,
  state: DimSumAppState,
  waitedMs = 0
): DimSumDecision => {
  if (state.schoolMode || state.onboarding || state.signInPage) {
    return "skip";
  }
  if (!state.connected || state.serverBusy || state.shellLoading) {
    return waitedMs >= DIM_SUM_SETTLE_MS ? "skip" : "wait";
  }
  if (state.errorShown || state.dialogOpen || state.unsavedChanges) {
    return "skip";
  }
  return random < DIM_SUM_CHANCE ? "show" : "skip";
};

let launchTaken = false;

/** True the first time it is called in a page load, false afterwards. */
export const takeLaunchDraw = (): boolean => {
  if (launchTaken) {
    return false;
  }
  launchTaken = true;
  return true;
};

/** Makes the next call to `takeLaunchDraw` succeed again. For tests. */
export const resetLaunchDrawForTest = () => {
  launchTaken = false;
};

type RandomSource = () => number;

let randomSource: RandomSource = () => Math.random();

/** Replaces the random source. For tests and the development hook. */
export const setDimSumRandomSource = (source?: RandomSource) => {
  randomSource = source ?? (() => Math.random());
};

/** One fresh random value between 0 (included) and 1 (excluded). */
export const drawDimSumRandom = (): number => randomSource();
