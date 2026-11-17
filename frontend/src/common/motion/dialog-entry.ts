import { currentMotionLock } from "../appearance/motion-profiles";
import type { ConfirmationDrama } from "../confirm/two-key-drama";
import { normalizeConfirmationDrama } from "../confirm/two-key-drama";
import { getPersonalPreferences } from "../preferences/personal-preferences";
import { pageEntryProfile } from "./page-entry";

/** The narrow viewport width at or below which a dialog becomes a sheet. */
export const DIALOG_SHEET_MAX_WIDTH_PX = 600;
/** The media query that matches a viewport where a dialog is a sheet. */
export const DIALOG_SHEET_MEDIA_QUERY = `(max-width: ${DIALOG_SHEET_MAX_WIDTH_PX}px)`;

/** How a dialog arrives: nothing, a fade, a rise, or a rise that also grows. */
export type DialogMotionMode = "none" | "fade" | "rise" | "rise-scale";

/**
 * How a dialog arrives for a given "Confirmation drama" choice, reusing the
 * page entry rules: Off is no motion, Calm fades only, Standard rises and
 * Dramatic rises and grows a little. Reduced motion always wins.
 */
export const dialogMotionMode = (
  drama: ConfirmationDrama,
  reducedMotion = false
): DialogMotionMode => {
  const profile = pageEntryProfile(drama, reducedMotion);
  if (!profile.enabled) {
    return "none";
  }
  if (!profile.rise) {
    return "fade";
  }
  return profile.scale === 1 ? "rise" : "rise-scale";
};

/** Reads the person's current choice and the reduced-motion switches. */
export const currentDialogMotionMode = (): DialogMotionMode => {
  let drama: ConfirmationDrama;
  try {
    drama = normalizeConfirmationDrama(
      getPersonalPreferences().confirmationDrama
    );
  } catch (_err) {
    drama = normalizeConfirmationDrama(undefined);
  }
  let reduced: boolean;
  try {
    reduced = currentMotionLock() !== undefined;
  } catch (_err) {
    reduced = false;
  }
  return dialogMotionMode(drama, reduced);
};

/** Whether a drag of this far, or this fast, closes the sheet. */
export const shouldCloseSheet = (
  distancePx: number,
  velocityPxPerMs: number
): boolean => distancePx > 96 || (distancePx > 24 && velocityPxPerMs > 0.6);
