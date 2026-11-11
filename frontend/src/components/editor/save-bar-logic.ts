/** Pure rules for the editor save bar, kept apart so they can be tested. */

export interface SaveBarInput {
  /** The editor holds changes that are not saved yet. */
  dirty: boolean;
  /** A save is running. */
  saving: boolean;
  /** The item cannot be changed, so nothing can be saved. */
  readOnly: boolean;
  /** Number of validation problems the editor reports. */
  errorCount: number;
}

export type SaveBarState = "saving" | "errors" | "unsaved" | "saved";

export type SaveBarAnnouncement = "saved" | "error";

/**
 * The bar is shown while there is something to say or do: unsaved changes,
 * a running save or problems to fix. A read-only item has no changes to save,
 * so its bar stays hidden. When `hideWhenClean` is false the bar is always
 * shown, which is how the other editors keep using it.
 */
export const isSaveBarVisible = (
  input: SaveBarInput,
  hideWhenClean: boolean
): boolean => {
  if (!hideWhenClean) {
    return true;
  }
  if (input.readOnly) {
    return false;
  }
  return input.dirty || input.saving || input.errorCount > 0;
};

/** Save is off for a read-only item and while a save is already running. */
export const isSaveEnabled = (input: SaveBarInput): boolean =>
  !input.readOnly && !input.saving;

/** Discard is possible when there is something to discard and no save runs. */
export const isDiscardEnabled = (input: SaveBarInput): boolean =>
  !input.readOnly && !input.saving && input.dirty;

/** Which label the bar shows. */
export const saveBarState = (input: SaveBarInput): SaveBarState => {
  if (input.saving) {
    return "saving";
  }
  if (input.errorCount > 0) {
    return "errors";
  }
  return input.dirty ? "unsaved" : "saved";
};

/**
 * What the live region should announce after the inputs changed: "saved"
 * when a running save ended with nothing left unsaved, "error" when it ended
 * with a failure, and nothing for every other change.
 */
export const saveBarAnnouncement = (
  previous: Pick<SaveBarInput, "saving">,
  next: SaveBarInput,
  failed: boolean
): SaveBarAnnouncement | undefined => {
  if (!previous.saving || next.saving) {
    return undefined;
  }
  if (failed) {
    return "error";
  }
  return next.dirty ? undefined : "saved";
};
