import type { ChangelogDay } from "../../../common/changelog/parse-changelog";

/** One line of the changelog with what the page needs to know about it. */
export interface NoteEntry {
  key: string;
  date: string;
  text: string;
  commit?: string;
  /** True for entries that begin with "Fixed:". */
  fixed: boolean;
  /** The page the note is about, when its first words name one. */
  page?: string;
}

export interface NoteDay {
  date: string;
  entries: NoteEntry[];
}

export type NoteFilter = "all" | "fixed" | "new";

/**
 * Pages a note can link to. A note is linked only when its first word names
 * one of these pages; nothing is guessed from the rest of the sentence.
 */
export const NOTE_PAGES: { pattern: RegExp; path: string }[] = [
  { pattern: /^Automations?\b/i, path: "/config/automation" },
  { pattern: /^Dashboards?\b/i, path: "/config/lovelace/dashboards" },
  { pattern: /^Backups?\b/i, path: "/config/backup" },
  { pattern: /^Personal\b/i, path: "/config/personal" },
  { pattern: /^Devices?\b/i, path: "/config/devices" },
  { pattern: /^Notifications?\b/i, path: "/config/notifications" },
  { pattern: /^Tools\b/i, path: "/config/tools" },
];

export const isFixedNote = (text: string): boolean => /^Fixed:/i.test(text);

export const notePage = (text: string): string | undefined =>
  NOTE_PAGES.find((entry) => entry.pattern.test(text))?.path;

/** A short stable key for an entry, from its day and its text. */
export const entryKey = (date: string, text: string): string => {
  let hash = 5381;
  const source = `${date}|${text}`;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 33 + source.charCodeAt(i)) % 4294967291;
  }
  return `${date}:${hash.toString(36)}`;
};

export const toNoteDays = (days: ChangelogDay[]): NoteDay[] =>
  days.map((day) => ({
    date: day.date,
    entries: day.items.map((item) => ({
      key: entryKey(day.date, item.text),
      date: day.date,
      text: item.text,
      commit: item.commit,
      fixed: isFixedNote(item.text),
      page: notePage(item.text),
    })),
  }));

/**
 * The entries that were not there the last time the page was looked at.
 * Nothing is new on the first visit, since there is nothing to compare to.
 */
export const newKeys = (
  days: NoteDay[],
  seen: ReadonlySet<string> | undefined
): Set<string> => {
  const keys = new Set<string>();
  if (!seen) {
    return keys;
  }
  days.forEach((day) =>
    day.entries.forEach((entry) => {
      if (!seen.has(entry.key)) {
        keys.add(entry.key);
      }
    })
  );
  return keys;
};

export const filterNoteDays = (
  days: NoteDay[],
  filter: NoteFilter,
  isNew: ReadonlySet<string>,
  matches: (...texts: (string | undefined)[]) => boolean
): NoteDay[] =>
  days
    .map((day) => ({
      date: day.date,
      entries: day.entries.filter(
        (entry) =>
          (filter === "all" ||
            (filter === "fixed" && entry.fixed) ||
            (filter === "new" && isNew.has(entry.key))) &&
          matches(entry.text, entry.commit, day.date)
      ),
    }))
    .filter((day) => day.entries.length);

/** The days between two ISO dates, both included; either end may be open. */
export const filterNoteDaysByRange = (
  days: NoteDay[],
  from?: string,
  to?: string
): NoteDay[] =>
  days.filter((day) => (!from || day.date >= from) && (!to || day.date <= to));

/** A day's notes as plain text, ready to paste. */
export const dayAsText = (heading: string, entries: NoteEntry[]): string =>
  [heading, ...entries.map((entry) => `- ${entry.text}`)].join("\n");

export const SEEN_STORAGE_KEY = "ha-material-release-notes-seen";
const SEEN_LIMIT = 2000;

export const readSeen = (): Set<string> | undefined => {
  try {
    const stored = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (!stored) {
      return undefined;
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key) => typeof key === "string"))
      : undefined;
  } catch (_err: any) {
    return undefined;
  }
};

export const writeSeen = (keys: Iterable<string>): void => {
  try {
    window.localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify(Array.from(keys).slice(-SEEN_LIMIT))
    );
  } catch (_err: any) {
    // The marker is a convenience; without storage nothing is marked.
  }
};
