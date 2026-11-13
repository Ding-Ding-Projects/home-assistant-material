/**
 * Whole-id entity swap on raw configuration text. Unlike `replaceEntity`, which
 * rewrites a parsed config, this works on the text the raw editor shows, so
 * comments and formatting survive and every match can be previewed by line.
 */

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

export interface EntityTextMatch {
  /** 1-based line number */
  line: number;
  /** Offsets in the whole document */
  from: number;
  to: number;
  /** Full text of the line before the swap */
  before: string;
  /** Full text of the line after the swap */
  after: string;
}

export const isEntityId = (value: string): boolean => ENTITY_ID.test(value);

const WORD = /[A-Za-z0-9_]/;

/**
 * Finds every place where `id` appears as a complete entity ID. An ID that only
 * contains it (light.kitchen_counter for light.kitchen) is not a match, and
 * neither is the tail of a longer dotted name.
 */
export const findEntityMatches = (
  text: string,
  id: string,
  replacement: string
): EntityTextMatch[] => {
  if (!ENTITY_ID.test(id)) {
    return [];
  }
  const matches: EntityTextMatch[] = [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  };

  let index = text.indexOf(id);
  while (index !== -1) {
    const end = index + id.length;
    const prev = index > 0 ? text[index - 1] : "";
    const next = end < text.length ? text[end] : "";
    const nextNext = end + 1 < text.length ? text[end + 1] : "";
    const startsClean = !prev || (!WORD.test(prev) && prev !== ".");
    const endsClean =
      !next || (!WORD.test(next) && !(next === "." && WORD.test(nextNext)));
    if (startsClean && endsClean) {
      const lineIndex = lineOf(index);
      const lineStart = lineStarts[lineIndex];
      let lineEnd = text.indexOf("\n", lineStart);
      if (lineEnd === -1) {
        lineEnd = text.length;
      }
      const before = text.slice(lineStart, lineEnd).replace(/\r$/, "");
      const relative = index - lineStart;
      matches.push({
        line: lineIndex + 1,
        from: index,
        to: end,
        before,
        after:
          before.slice(0, relative) +
          replacement +
          before.slice(relative + id.length),
      });
    }
    index = text.indexOf(id, end);
  }
  return matches;
};

/** Applies the chosen matches and returns the new text. */
export const applyEntityMatches = (
  text: string,
  matches: EntityTextMatch[],
  replacement: string
): string => {
  let result = "";
  let cursor = 0;
  for (const match of [...matches].sort((a, b) => a.from - b.from)) {
    result += text.slice(cursor, match.from) + replacement;
    cursor = match.to;
  }
  return result + text.slice(cursor);
};
