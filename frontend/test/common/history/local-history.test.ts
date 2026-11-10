import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../../../src/common/history/local-history";
import {
  addHistoryEntry,
  HISTORY_LIMIT,
  HISTORY_MERGE_MS,
  normalizeHistory,
} from "../../../src/common/history/local-history";

// Protects the journal of local changes: that a dragged slider is one entry,
// that the private vocabulary is never copied into it, and that it stays
// bounded.

const change = (
  at: number,
  before: string | null,
  after: string | null,
  subject: HistoryEntry["subject"] = "appearance",
  page = "/config"
) => ({ subject, page, before, after, at });

describe("addHistoryEntry", () => {
  it("adds a change with the choice before and after", () => {
    const entries = addHistoryEntry([], change(1000, null, '{"a":1}'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      subject: "appearance",
      page: "/config",
      kept: true,
      before: null,
      after: '{"a":1}',
    });
  });

  it("ignores a change that changes nothing", () => {
    expect(addHistoryEntry([], change(1000, "x", "x"))).toEqual([]);
  });

  it("joins a burst into one entry from the first choice to the last", () => {
    let entries = addHistoryEntry([], change(1000, "a", "b"));
    entries = addHistoryEntry(entries, change(1500, "b", "c"));
    entries = addHistoryEntry(entries, change(2500, "c", "d"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ before: "a", after: "d", at: 2500 });
  });

  it("drops a burst that ends where it started", () => {
    let entries = addHistoryEntry([], change(1000, "a", "b"));
    entries = addHistoryEntry(entries, change(1500, "b", "a"));
    expect(entries).toEqual([]);
  });

  it("keeps changes apart in time, on other pages or of other things", () => {
    let entries = addHistoryEntry([], change(1000, "a", "b"));
    entries = addHistoryEntry(
      entries,
      change(1000 + HISTORY_MERGE_MS, "b", "c")
    );
    entries = addHistoryEntry(
      entries,
      change(6000, "c", "d", "appearance", "/")
    );
    entries = addHistoryEntry(entries, change(6100, null, "t", "tabs", "/"));
    expect(entries).toHaveLength(4);
  });

  it("lists a vocabulary change without its text", () => {
    const entries = addHistoryEntry(
      [],
      change(1000, null, '{"entries":{"private":"words"}}', "wording")
    );
    expect(entries[0].kept).toBe(false);
    expect(JSON.stringify(entries)).not.toContain("words");
  });

  it("keeps the newest entries only", () => {
    let entries: HistoryEntry[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 5; index++) {
      entries = addHistoryEntry(
        entries,
        change(index * 10000, String(index), String(index + 1))
      );
    }
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].before).toBe("5");
  });
});

describe("normalizeHistory", () => {
  it("drops entries that are not well formed", () => {
    expect(
      normalizeHistory([
        {
          id: "a",
          at: 1,
          subject: "tabs",
          page: "/",
          kept: true,
          before: null,
          after: "[]",
        },
        { id: "b", at: 1, subject: "locks", page: "/", kept: true },
        { id: "c", at: "now", subject: "tabs", page: "/", kept: true },
        null,
      ])
    ).toHaveLength(1);
    expect(normalizeHistory("nope")).toEqual([]);
  });
});
