import { describe, expect, it } from "vitest";
import type {
  LogLevel,
  LogLine,
} from "../../../src/common/log-terminal/log-terminal-logic";
import {
  ALL_LEVELS,
  appendLines,
  detectLevel,
  emptyBuffer,
  exportAsJsonLines,
  exportAsText,
  exportFileName,
  linesAsText,
  markSegments,
  matchIndexes,
  matchRanges,
  newLinesOf,
  queryError,
  splitMatches,
  stepMatch,
  visibleLines,
} from "../../../src/common/log-terminal/log-terminal-logic";
import { parseAnsiSegments } from "../../../src/common/string/ansi-segments";

const line = (
  id: number,
  text: string,
  level: LogLevel = "info",
  source: LogLine["source"] = "app"
): LogLine => ({
  id,
  time: Date.UTC(2026, 10, 11, 12, 0, id),
  source,
  level,
  text,
});

const all = new Set<LogLevel>(ALL_LEVELS);

describe("the bounded buffer", () => {
  it("keeps the newest lines and counts the ones it dropped", () => {
    let buffer = emptyBuffer();
    buffer = appendLines(
      buffer,
      Array.from({ length: 5 }, (_value, index) => ({
        time: index,
        source: "job" as const,
        level: "info" as const,
        text: `line ${index}`,
      })),
      3
    );
    expect(buffer.lines.map((entry) => entry.text)).toEqual([
      "line 2",
      "line 3",
      "line 4",
    ]);
    expect(buffer.dropped).toBe(2);
    buffer = appendLines(
      buffer,
      [{ time: 9, source: "job", level: "info", text: "line 5" }],
      3
    );
    expect(buffer.dropped).toBe(3);
    expect(new Set(buffer.lines.map((entry) => entry.id)).size).toBe(3);
  });

  it("gives every line a new id", () => {
    const first = appendLines(emptyBuffer(), [
      { time: 1, source: "app", level: "info", text: "a" },
    ]);
    const second = appendLines(first, [
      { time: 2, source: "app", level: "info", text: "b" },
    ]);
    expect(second.lines.map((entry) => entry.id)).toEqual([1, 2]);
  });
});

describe("levels", () => {
  it("reads the level word that app logs write", () => {
    expect(detectLevel("[12:00:01] ERROR: it broke")).toBe("error");
    expect(detectLevel("2026-11-11 12:00:00 WARNING (MainThread) hmm")).toBe(
      "warning"
    );
    expect(detectLevel("level=debug msg=ok")).toBe("debug");
    expect(detectLevel("[12:00:01] INFO: started")).toBe("info");
    expect(detectLevel("Traceback (most recent call last):")).toBe("error");
  });

  it("reads through colour codes and does not take a word inside text for a level", () => {
    expect(detectLevel("\u001b[31m[12:00:01] ERROR: red\u001b[0m")).toBe(
      "error"
    );
    expect(detectLevel("Listening on port 1883, no errors so far")).toBe(
      "info"
    );
  });
});

describe("reading a log in pieces", () => {
  it("adds only the lines that are new", () => {
    expect(newLinesOf(["a", "b", "c"], ["b", "c", "d", "e"])).toEqual([
      "d",
      "e",
    ]);
  });

  it("adds everything on the first read and when nothing overlaps", () => {
    expect(newLinesOf([], ["a", "b"])).toEqual(["a", "b"]);
    expect(newLinesOf(["a", "b"], ["x", "y"])).toEqual(["x", "y"]);
  });

  it("adds nothing when the log has not moved", () => {
    expect(newLinesOf(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

describe("searching", () => {
  const lines = [
    line(1, "Starting the broker"),
    line(2, "\u001b[31mERROR\u001b[0m: port in use", "error"),
    line(3, "Retrying on port 1884"),
    line(4, "App log", "info", "note"),
  ];

  it("finds plain text without regard to case, through colour codes", () => {
    expect(matchIndexes(lines, "error")).toEqual([1]);
    expect(matchIndexes(lines, "PORT")).toEqual([1, 2]);
  });

  it("finds a pattern written as /pattern/flags", () => {
    expect(matchIndexes(lines, "/port \\d+/")).toEqual([2]);
    expect(matchIndexes(lines, "/PORT/i")).toEqual([1, 2]);
  });

  it("matches nothing and reports why when a pattern cannot be used", () => {
    expect(queryError("/(/")).toBe("invalid");
    expect(matchIndexes(lines, "/(/")).toEqual([]);
    expect(queryError("plain")).toBeUndefined();
  });

  it("shows only matching lines in filter mode but keeps heading lines", () => {
    const shown = visibleLines(lines, {
      query: "port",
      onlyMatches: true,
      levels: all,
    });
    expect(shown.map((entry) => entry.id)).toEqual([2, 3, 4]);
  });

  it("filters by level before it searches", () => {
    const shown = visibleLines(lines, {
      query: "",
      onlyMatches: false,
      levels: new Set<LogLevel>(["error"]),
    });
    expect(shown.map((entry) => entry.id)).toEqual([2]);
  });

  it("shows no line at all for an invalid pattern in filter mode, except headings", () => {
    const shown = visibleLines(lines, {
      query: "/(/",
      onlyMatches: true,
      levels: all,
    });
    expect(shown.map((entry) => entry.id)).toEqual([4]);
  });

  it("steps through matches and wraps round", () => {
    expect(stepMatch([2, 5, 9], -1, 1)).toBe(0);
    expect(stepMatch([2, 5, 9], 2, 1)).toBe(0);
    expect(stepMatch([2, 5, 9], 0, -1)).toBe(2);
    expect(stepMatch([], 0, 1)).toBe(-1);
  });
});

describe("marking matches", () => {
  it("cuts a text where a plain match starts and ends", () => {
    expect(splitMatches("Retrying on port 1884", "port")).toEqual([
      { text: "Retrying on ", match: false },
      { text: "port", match: true },
      { text: " 1884", match: false },
    ]);
  });

  it("gives the same ranges for plain text and for a pattern", () => {
    expect(matchRanges("PORT", "a port b")).toEqual([[2, 6]]);
    expect(matchRanges("/p\\w+t/", "a port b")).toEqual([[2, 6]]);
  });

  it("keeps the colours when a match crosses a colour change", () => {
    const segments = parseAnsiSegments("ab\u001b[31mcd\u001b[0mef");
    const marked = markSegments(segments, [[1, 4]]);
    expect(marked.map((part) => [part.text, part.match, part.classes])).toEqual(
      [
        ["a", false, []],
        ["b", true, []],
        ["cd", true, ["fg-red"]],
        ["ef", false, []],
      ]
    );
  });
});

describe("copy and export", () => {
  const lines = [
    line(1, "first"),
    line(2, "\u001b[32msecond\u001b[0m", "info", "job"),
  ];

  it("copies plain text without colour codes", () => {
    expect(linesAsText(lines, false)).toBe("first\nsecond");
  });

  it("exports a text file with an ISO time in front of every line", () => {
    expect(exportAsText(lines)).toBe(
      "2026-11-11T12:00:01.000Z first\n2026-11-11T12:00:02.000Z second\n"
    );
  });

  it("exports JSON lines with timestamp, source, level and text", () => {
    const rows = exportAsJsonLines(lines)
      .trim()
      .split("\n")
      .map((row) => JSON.parse(row));
    expect(rows[1]).toEqual({
      timestamp: "2026-11-11T12:00:02.000Z",
      source: "job",
      level: "info",
      text: "second",
    });
  });

  it("names a file after the app and the time, safe on every system", () => {
    const name = exportFileName(
      "Mosquitto broker / MQTT",
      Date.UTC(2026, 10, 11, 12, 0, 0),
      "txt"
    );
    expect(name).toMatch(
      /^mosquitto-broker-mqtt_2026-11-\d\d_\d\d-\d\d-00\.txt$/
    );
    expect(exportFileName("", 0, "jsonl")).toMatch(/^log_.*\.jsonl$/);
  });
});
