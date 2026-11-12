import type { SearchQueryError } from "../regex/query";
import { regexQuery, regexRanges, searchMatcher } from "../regex/filter";
import type { AnsiSegment } from "../string/ansi-segments";
import { stripAnsi } from "../string/ansi-segments";

/**
 * Pure rules for the log terminal: how lines are kept, which are shown, where
 * a search matches, and how the log is copied and exported. Nothing here
 * touches the page.
 */

export type LogLevel = "debug" | "info" | "warning" | "error";

/**
 * Where a line came from: `job` for what the Supervisor reports about the
 * job, `app` for the app's own log, `note` for a heading line of the terminal.
 */
export type LogSource = "job" | "app" | "note";

export interface LogLine {
  id: number;
  /** Milliseconds since the epoch. */
  time: number;
  source: LogSource;
  level: LogLevel;
  /** As written, so colour codes from an app's log are still in it. */
  text: string;
}

export type NewLogLine = Omit<LogLine, "id">;

/** The newest lines the terminal keeps, so a phone does not run out of memory. */
export const MAX_LOG_LINES = 5000;

export interface LogBuffer {
  lines: LogLine[];
  /** How many older lines were dropped to stay within the limit. */
  dropped: number;
  nextId: number;
}

export const emptyBuffer = (): LogBuffer => ({
  lines: [],
  dropped: 0,
  nextId: 1,
});

/** The buffer with new lines added, keeping only the newest `cap` lines. */
export const appendLines = (
  buffer: LogBuffer,
  incoming: readonly NewLogLine[],
  cap = MAX_LOG_LINES
): LogBuffer => {
  if (!incoming.length) {
    return buffer;
  }
  let nextId = buffer.nextId;
  const added = incoming.map((line) => ({ ...line, id: nextId++ }));
  const all = buffer.lines.concat(added);
  const overflow = Math.max(0, all.length - cap);
  return {
    lines: overflow ? all.slice(overflow) : all,
    dropped: buffer.dropped + overflow,
    nextId,
  };
};

const ERROR_WORD =
  /(?:^|[\s[(=])(?:ERROR|CRITICAL|FATAL|EXCEPTION|error|fatal)(?=[\s\]):,]|$)/;
const WARNING_WORD =
  /(?:^|[\s[(=])(?:WARNING|WARN|warning|warn)(?=[\s\]):,]|$)/;
const DEBUG_WORD = /(?:^|[\s[(=])(?:DEBUG|TRACE|debug|trace)(?=[\s\]):,]|$)/;

/**
 * The level a line of an app's log states, read from the level word that
 * logging libraries and the app base images write. A line that states none is
 * "info".
 */
export const detectLevel = (text: string): LogLevel => {
  const plain = stripAnsi(text).slice(0, 200);
  if (/^Traceback \(most recent call last\)/.test(plain)) {
    return "error";
  }
  if (ERROR_WORD.test(plain)) {
    return "error";
  }
  if (WARNING_WORD.test(plain)) {
    return "warning";
  }
  if (DEBUG_WORD.test(plain)) {
    return "debug";
  }
  return "info";
};

/**
 * The lines of a new snapshot of a log that are not in the previous one. A
 * log read in pieces overlaps: the newest lines of the previous snapshot are
 * the oldest of the next. When nothing overlaps, the log has moved on by more
 * than one snapshot and every line of the new one is added.
 */
export const newLinesOf = (
  previous: readonly string[],
  snapshot: readonly string[]
): string[] => {
  if (!previous.length) {
    return [...snapshot];
  }
  const most = Math.min(previous.length, snapshot.length);
  for (let size = most; size > 0; size--) {
    let same = true;
    for (let index = 0; index < size; index++) {
      if (previous[previous.length - size + index] !== snapshot[index]) {
        same = false;
        break;
      }
    }
    if (same) {
      return snapshot.slice(size);
    }
  }
  return [...snapshot];
};

export const ALL_LEVELS: readonly LogLevel[] = [
  "error",
  "warning",
  "info",
  "debug",
];

export interface LogFilter {
  /** The search text, plain or `/pattern/flags`. */
  query: string;
  /** Show only the lines that match the search. */
  onlyMatches: boolean;
  /** The levels that are shown. */
  levels: ReadonlySet<LogLevel>;
}

/** The text of a line that a search is run against. */
export const searchableText = (line: LogLine): string => stripAnsi(line.text);

/** Why a search text cannot be used, undefined when it can. */
export const queryError = (query: string): SearchQueryError | undefined =>
  regexQuery(query)?.error;

/** Indexes, into `lines`, of the lines the search text matches. */
export const matchIndexes = (
  lines: readonly LogLine[],
  query: string
): number[] => {
  if (!query.trim()) {
    return [];
  }
  const matches = searchMatcher(query);
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (matches(searchableText(line))) {
      found.push(index);
    }
  });
  return found;
};

/** The lines to show: the level filter, then the search when it only shows matches. */
export const visibleLines = (
  lines: readonly LogLine[],
  filter: LogFilter
): LogLine[] => {
  const byLevel = lines.filter((line) => filter.levels.has(line.level));
  if (!filter.onlyMatches || !filter.query.trim()) {
    return byLevel;
  }
  const matches = searchMatcher(filter.query);
  return byLevel.filter(
    (line) => line.source === "note" || matches(searchableText(line))
  );
};

export interface TextPart {
  text: string;
  match: boolean;
}

/** Where the search text matches inside a text, for plain text and for a pattern alike. */
export const matchRanges = (
  query: string,
  text: string
): [number, number][] => {
  const fromPattern = regexRanges(query, text);
  if (fromPattern) {
    return fromPattern;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  let from = 0;
  while (from < lower.length && ranges.length < 200) {
    const at = lower.indexOf(needle, from);
    if (at === -1) {
      break;
    }
    ranges.push([at, at + needle.length]);
    from = at + needle.length;
  }
  return ranges;
};

/** A run of text cut into the parts that match the search and the parts that do not. */
export const splitMatches = (text: string, query: string): TextPart[] => {
  if (!query.trim() || !text) {
    return [{ text, match: false }];
  }
  const ranges = matchRanges(query, text);
  if (!ranges.length) {
    return [{ text, match: false }];
  }
  const parts: TextPart[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at) {
      continue;
    }
    if (start > at) {
      parts.push({ text: text.slice(at, start), match: false });
    }
    parts.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < text.length) {
    parts.push({ text: text.slice(at), match: false });
  }
  return parts;
};

export interface MarkedSegment extends AnsiSegment {
  match: boolean;
}

/**
 * Runs of coloured text cut where a match starts or ends, so a match can be
 * marked without losing the colours. The ranges are positions in the text
 * the segments make up together.
 */
export const markSegments = (
  segments: readonly AnsiSegment[],
  ranges: readonly [number, number][]
): MarkedSegment[] => {
  if (!ranges.length) {
    return segments.map((segment) => ({ ...segment, match: false }));
  }
  const marked: MarkedSegment[] = [];
  let offset = 0;
  for (const segment of segments) {
    const end = offset + segment.text.length;
    let at = offset;
    for (const [start, stop] of ranges) {
      if (stop <= at || start >= end) {
        continue;
      }
      const from = Math.max(start, at);
      const to = Math.min(stop, end);
      if (from > at) {
        marked.push({
          text: segment.text.slice(at - offset, from - offset),
          classes: segment.classes,
          match: false,
        });
      }
      marked.push({
        text: segment.text.slice(from - offset, to - offset),
        classes: segment.classes,
        match: true,
      });
      at = to;
    }
    if (at < end) {
      marked.push({
        text: segment.text.slice(at - offset),
        classes: segment.classes,
        match: false,
      });
    }
    offset = end;
  }
  return marked;
};

const pad = (value: number, size = 2): string =>
  String(value).padStart(size, "0");

/** "12:04:09" in the viewer's time zone. */
export const clockTime = (time: number): string => {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** One line as plain text, with colour codes removed. */
export const lineAsText = (line: LogLine, timestamps: boolean): string => {
  const text = stripAnsi(line.text);
  return timestamps ? `${clockTime(line.time)} ${text}` : text;
};

export const linesAsText = (
  lines: readonly LogLine[],
  timestamps: boolean
): string => lines.map((line) => lineAsText(line, timestamps)).join("\n");

/** The whole log as a text file: an ISO time in front of every line. */
export const exportAsText = (lines: readonly LogLine[]): string =>
  lines
    .map(
      (line) => `${new Date(line.time).toISOString()} ${stripAnsi(line.text)}`
    )
    .join("\n") + (lines.length ? "\n" : "");

/** The whole log as JSON lines: one object per line with time, source, level and text. */
export const exportAsJsonLines = (lines: readonly LogLine[]): string =>
  lines
    .map((line) =>
      JSON.stringify({
        timestamp: new Date(line.time).toISOString(),
        source: line.source,
        level: line.level,
        text: stripAnsi(line.text),
      })
    )
    .join("\n") + (lines.length ? "\n" : "");

/** A file name made of the app's name and the time, safe on every system. */
export const exportFileName = (
  name: string,
  time: number,
  extension: string
): string => {
  const date = new Date(time);
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const safe =
    name
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "log";
  return `${safe}_${stamp}.${extension}`;
};

/** The index of the next match after `current`, wrapping round. -1 when there are none. */
export const stepMatch = (
  matches: readonly number[],
  current: number,
  direction: 1 | -1
): number => {
  if (!matches.length) {
    return -1;
  }
  if (current < 0 || current >= matches.length) {
    return direction === 1 ? 0 : matches.length - 1;
  }
  return (current + direction + matches.length) % matches.length;
};
