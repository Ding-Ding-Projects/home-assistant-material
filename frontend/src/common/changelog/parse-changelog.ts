/**
 * Reads the project's CHANGELOG.md: a heading with a date for each day,
 * and under it one bullet for each change, in plain sentences.
 */

export interface ChangelogItem {
  text: string;
  /** The commit that added the entry, when it is known. */
  commit?: string;
}

export interface ChangelogDay {
  /** ISO 8601 date, yyyy-mm-dd. */
  date: string;
  items: ChangelogItem[];
}

const DAY = /^## (\d{4}-\d{2}-\d{2})\s*$/;

export const parseChangelog = (markdown: string): ChangelogDay[] => {
  const days: ChangelogDay[] = [];
  let day: ChangelogDay | undefined;
  let item: ChangelogItem | undefined;
  markdown.split(/\r?\n/).forEach((line) => {
    const heading = DAY.exec(line);
    if (heading) {
      day = { date: heading[1], items: [] };
      days.push(day);
      item = undefined;
      return;
    }
    if (line.startsWith("## ")) {
      // A heading that is not a day ends the dated part.
      day = undefined;
      item = undefined;
      return;
    }
    if (!day) {
      return;
    }
    if (line.startsWith("- ")) {
      item = { text: line.slice(2).trim() };
      day.items.push(item);
    } else if (item && /^\s+\S/.test(line)) {
      item.text += ` ${line.trim()}`;
    } else if (!line.trim()) {
      item = undefined;
    }
  });
  return days.filter((entry) => entry.items.length);
};

/** The days between two dates, both included; either end may be open. */
export const filterDays = (
  days: ChangelogDay[],
  from?: string,
  to?: string
): ChangelogDay[] =>
  days.filter((day) => (!from || day.date >= from) && (!to || day.date <= to));

/** Markdown text for inline code only; everything else is plain text. */
export const splitCode = (text: string): { text: string; code: boolean }[] =>
  text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2
        ? { text: part.slice(1, -1), code: true }
        : { text: part, code: false }
    );
