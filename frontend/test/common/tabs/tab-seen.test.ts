import { describe, expect, it } from "vitest";
import {
  closeTab,
  normalizeSeenStore,
  openEveryTab,
  openTab,
  reconcileSeen,
} from "../../../src/common/tabs/tab-seen";

// The strip must open a page that arrives with an update exactly once, keep a
// closed tab closed, and never mistake a returning page for a new one.

describe("reconcileSeen", () => {
  it("treats nothing as new on the first run", () => {
    const result = reconcileSeen(["a", "b"], []);
    expect(result.firstRun).toBe(true);
    expect(result.newlyOffered).toEqual([]);
    expect(result.seen).toEqual(["a", "b"]);
  });

  it("offers only a never-offered tab after an update, once", () => {
    const first = reconcileSeen(["a", "b", "c"], ["a", "b"]);
    expect(first.newlyOffered).toEqual(["c"]);
    expect(first.firstRun).toBe(false);
    const second = reconcileSeen(["a", "b", "c"], first.seen);
    expect(second.newlyOffered).toEqual([]);
  });

  it("does not offer a returning page as new", () => {
    const gone = reconcileSeen(["a"], ["a", "b"]);
    expect(gone.seen).toEqual(["a", "b"]);
    expect(reconcileSeen(["a", "b"], gone.seen).newlyOffered).toEqual([]);
  });

  it("lists new tabs in page order and ignores hostile ids", () => {
    const result = reconcileSeen(["z", "a", "__proto__", "m"], ["q"]);
    expect(result.newlyOffered).toEqual(["z", "a", "m"]);
  });

  it("keeps the newest when the limit is reached", () => {
    const seen = Array.from({ length: 2000 }, (_v, i) => `t${i}`);
    const result = reconcileSeen(["fresh"], seen);
    expect(result.seen).toHaveLength(2000);
    expect(result.seen[1999]).toBe("fresh");
    expect(result.seen).not.toContain("t0");
  });
});

describe("closing and opening tabs", () => {
  it("keeps a closed tab closed, with no repeats", () => {
    expect(closeTab(["a"], "b")).toEqual(["a", "b"]);
    expect(closeTab(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(closeTab(["a"], "__proto__")).toEqual(["a"]);
  });

  it("opens one tab again", () => {
    expect(openTab(["a", "b"], "a")).toEqual(["b"]);
  });

  it("Open every tab reopens the rest in page order and nothing else", () => {
    const result = openEveryTab(["a", "b", "c", "d"], ["d", "b", "gone"]);
    expect(result.reopened).toEqual(["b", "d"]);
    // A page that is not on offer stays closed if it returns.
    expect(result.closed).toEqual(["gone"]);
  });

  it("Open every tab with nothing closed changes nothing", () => {
    expect(openEveryTab(["a"], [])).toEqual({ closed: [], reopened: [] });
  });
});

describe("normalizeSeenStore", () => {
  it("validates the stored shape", () => {
    const hostile = JSON.parse(
      '{"main":["a","a",1],"__proto__":["x"],"bad":"text","empty":[]}'
    );
    expect(normalizeSeenStore(hostile)).toEqual({ main: ["a"] });
    expect(normalizeSeenStore(null)).toEqual({});
    expect(normalizeSeenStore([1])).toEqual({});
  });
});
