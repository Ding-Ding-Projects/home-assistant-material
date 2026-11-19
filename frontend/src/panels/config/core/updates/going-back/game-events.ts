import { currentMotionLock } from "../../../../../common/appearance/motion-profiles";

declare global {
  interface HASSDomEvents {
    /** A game of the super confirmation was won. */
    "game-won": undefined;
  }
}

/** Movement is reduced by the system, the accessibility tools or low stimulation. */
export const lessMotion = (): boolean => !!currentMotionLock();

export const GAME_PREFIX = "ui.panel.config.updates.history.games";
