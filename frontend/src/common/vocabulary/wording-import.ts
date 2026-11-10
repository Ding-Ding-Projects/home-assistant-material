import { WORDING_CELEBRATION_MS } from "../../components/wording/ha-wording-celebration";
import { getPersonalPreferences } from "../preferences/personal-preferences";
import { playActionCue } from "../sound/action-sound";
import type { LocalizeFunc } from "../translations/localize";
import type { VocabularyError } from "./personal-vocabulary";
import {
  activeVocabularyEntry,
  loadPersonalVocabulary,
  VOCABULARY_LIMITS,
} from "./personal-vocabulary";
import { giveWordingFeedback } from "./wording-feedback";

export type WordingImportResult =
  | { ok: true; count: number }
  | { ok: false; error: VocabularyError | "unreadable" | "not_json" };

/** True for a dropped or chosen file that could be a wording file. */
export const looksLikeWordingFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".json") || file.type === "application/json";

/**
 * Reads a file the person chose and loads it as personal wording. The size
 * is checked before the file is read. Nothing about the file is kept.
 */
export const importWordingFile = async (
  file: File
): Promise<WordingImportResult> => {
  if (file.size > VOCABULARY_LIMITS.bytes) {
    return { ok: false, error: "too_large" };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (_err) {
    return { ok: false, error: "unreadable" };
  }
  const result = loadPersonalVocabulary(bytes);
  return result.ok
    ? { ok: true, count: result.count }
    : { ok: false, error: result.error };
};

let celebrationTimer: number | undefined;

/** True when motion should be replaced by a plain fade. */
const wantsStillMotion = (): boolean => {
  let low: boolean;
  try {
    low = getPersonalPreferences().lowStimulation;
  } catch (_err) {
    low = false;
  }
  return (
    low ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.documentElement.hasAttribute("data-a11y-reduce-motion")
  );
};

/**
 * Shows the full-window celebration for about three seconds. A celebration
 * already showing is replaced, never stacked. It takes no focus and no input.
 */
export const showWordingCelebration = (
  headline: string,
  detail: string
): void => {
  document
    .querySelectorAll("ha-wording-celebration")
    .forEach((old) => old.remove());
  window.clearTimeout(celebrationTimer);
  const celebration = document.createElement("ha-wording-celebration");
  celebration.headline = headline;
  celebration.detail = detail;
  celebration.still = wantsStillMotion();
  celebration.setAttribute("popover", "manual");
  document.body.append(celebration);
  try {
    celebration.showPopover();
  } catch (_err) {
    // Without the popover API the element still shows, fixed in place.
  }
  celebrationTimer = window.setTimeout(
    () => celebration.remove(),
    WORDING_CELEBRATION_MS
  );
};

/**
 * The sound and the celebration for one import outcome: one success cue and
 * one celebration for a valid file, one refusal cue for a refused one.
 */
export const reportWordingImport = (
  result: WordingImportResult,
  localize: LocalizeFunc
): void =>
  giveWordingFeedback(result, {
    playCue: playActionCue,
    celebrate: showWordingCelebration,
    entryFor: activeVocabularyEntry,
    localize,
  });
