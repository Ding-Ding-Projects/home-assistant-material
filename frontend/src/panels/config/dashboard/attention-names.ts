/** How many update names the "things need you" card lists before counting. */
export const ATTENTION_NAMES_SHOWN = 2;

/**
 * The names of the pending updates as the card shows them: the word "Update"
 * that ends each name is dropped, at most two names are listed and the rest
 * are counted by `more`. A long list therefore never becomes one unbroken line.
 */
export const summarizeUpdateNames = (
  names: readonly string[],
  more: (shown: string, count: number) => string
): string => {
  const clean = names
    .map((name) => name.replace(/\s+Update$/i, "").trim())
    .filter((name) => name.length > 0);
  const shown = clean.slice(0, ATTENTION_NAMES_SHOWN).join(", ");
  return clean.length > ATTENTION_NAMES_SHOWN
    ? more(shown, clean.length - ATTENTION_NAMES_SHOWN)
    : shown;
};
