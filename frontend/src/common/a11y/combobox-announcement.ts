/**
 * Helpers for what a picker says to a screen reader while a person moves
 * through its options with the keyboard. The search field keeps focus and the
 * list lives in another shadow tree, so the active option cannot be named by
 * `aria-activedescendant`; it is spoken through a polite live region instead.
 */

/** The spoken name of an option: its name, then each detail, separated by commas. */
export const describeComboOption = (
  parts: readonly (string | undefined | null)[]
): string =>
  parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");

/**
 * The position (1-based) of the item at `index` among the options of a list,
 * and the number of options. Section titles and placeholder rows do not count.
 * Returns undefined when the item at `index` is not an option.
 */
export const optionPosition = <T>(
  items: readonly T[],
  index: number,
  isOption: (item: T) => boolean
): { position: number; total: number } | undefined => {
  if (index < 0 || index >= items.length || !isOption(items[index])) {
    return undefined;
  }
  let position = 0;
  let total = 0;
  items.forEach((item, i) => {
    if (isOption(item)) {
      total++;
      if (i <= index) {
        position++;
      }
    }
  });
  return { position, total };
};
