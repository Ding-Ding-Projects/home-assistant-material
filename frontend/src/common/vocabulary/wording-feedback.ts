import type { LocalizeFunc } from "../translations/localize";
import type { ActionCue } from "../sound/action-sound";
import type { WordingImportResult } from "./wording-import";

/** The key a wording file may give to name its own celebration headline. */
export const CELEBRATION_HEADLINE_KEY = "private vocabulary";

/**
 * The headline for the celebration: the value the applied file gives for the
 * headline key, otherwise the neutral localized text.
 */
export const chooseCelebrationHeadline = (
  fileValue: string | undefined,
  neutral: string
): string => (fileValue && fileValue.trim() ? fileValue : neutral);

export interface WordingFeedbackDeps {
  /** Plays one cue. A failure to play must never reach the caller. */
  playCue: (cue: ActionCue) => unknown;
  /** Shows the full-window celebration. */
  celebrate: (headline: string, detail: string) => void;
  /** The applied file's value for an exact key. */
  entryFor: (key: string) => string | undefined;
  localize: LocalizeFunc;
}

/**
 * Gives the sound and the celebration for one import outcome. A refused file
 * gets one refusal cue and nothing else; the caller shows the message. A
 * valid file gets one success cue and one celebration. A feedback failure
 * never changes the import result.
 */
export const giveWordingFeedback = (
  result: WordingImportResult,
  deps: WordingFeedbackDeps
): void => {
  const cue: ActionCue = result.ok ? "success" : "refused";
  try {
    deps.playCue(cue);
  } catch (_err) {
    // Sound is only a hint.
  }
  if (!result.ok) {
    return;
  }
  try {
    deps.celebrate(
      chooseCelebrationHeadline(
        deps.entryFor(CELEBRATION_HEADLINE_KEY),
        deps.localize("ui.personal_wording.overlay_title")
      ),
      // The wording is saved on the account, so a drop replaces it everywhere.
      `${deps.localize("ui.personal_wording.overlay_count", {
        count: result.count,
      })} ${deps.localize("ui.personal_wording.overlay_everywhere")}`
    );
  } catch (_err) {
    // The wording is already applied and saved.
  }
};
