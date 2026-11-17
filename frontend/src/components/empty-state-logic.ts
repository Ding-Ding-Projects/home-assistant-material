/**
 * Pure rules for the empty state of a list: which of the three tones fits.
 * Nothing here touches the page, so the rules can be tested on their own.
 */

/**
 * - `start`: the page has nothing yet, so the next step is to create something.
 * - `filtered`: there is something, but the search or filters hide all of it.
 * - `missing`: what was asked for does not exist or could not be found.
 */
export type EmptyStateTone = "start" | "filtered" | "missing";

export interface EmptyToneInput {
  /** How many rows the page handed to the table, before the table's search. */
  dataCount: number;
  /** Whether the table's search text is not empty. */
  searchActive: boolean;
  /** Whether the page has at least one filter switched on. */
  filtersActive: boolean;
}

/**
 * The tone for a list that shows no rows. Rows that exist but are hidden by a
 * search or a filter are never "start": the page is not empty, it is filtered.
 */
export const emptyTone = (input: EmptyToneInput): EmptyStateTone => {
  if (input.searchActive || input.filtersActive) {
    return "filtered";
  }
  // Rows exist and nothing narrows them down: the table hid them for another
  // reason, for example a column filter of its own.
  return input.dataCount > 0 ? "filtered" : "start";
};
