import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPendingGoBack,
  storeHistory,
  storePendingGoBack,
  takeGoBackNotice,
} from "../../../../src/panels/config/core/updates/update-history";

// The page loads on the build the person went back to: it is the older build's
// own page, with a stored record of the way back, and says so exactly once.

describe("landing on the build that was gone back to", () => {
  const target = "2026.11.1.490";
  const from = "2026.11.1.495";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports the way back once, then forgets it", () => {
    storePendingGoBack({ version: target, startedAt: 1000, fromVersion: from });
    // The page has just noted the target as installed.
    const history = [
      { version: target, firstSeen: 5000 },
      { version: from, firstSeen: 100 },
    ];
    storeHistory(history);

    const first = takeGoBackNotice(history, target, 6000);
    expect(first).toEqual({ kind: "done", build: "490", time: 5000 });
    expect(loadPendingGoBack()).toBeUndefined();
    expect(takeGoBackNotice(history, target, 7000)).toBeUndefined();
  });

  it("reports it when the target is simply the installed version", () => {
    storePendingGoBack({ version: target, startedAt: 1000, fromVersion: from });
    expect(takeGoBackNotice([], target, 6000)).toEqual({
      kind: "done",
      build: "490",
      time: 6000,
    });
  });

  it("says nothing without a record, and keeps an undecided one", () => {
    expect(takeGoBackNotice([], target, 6000)).toBeUndefined();
    storePendingGoBack({ version: target, startedAt: 1000, fromVersion: from });
    expect(takeGoBackNotice([], from, 2000)).toBeUndefined();
    expect(loadPendingGoBack()?.version).toBe(target);
  });
});

// The stored record can be gone after the reload (another browser profile, or
// an older interface that never touched it). The history alone then shows the
// way back: the newest entry is an older build than the one before it.

describe("a way back derived from the history alone", () => {
  const target = "2026.11.1.490";
  const from = "2026.11.1.495";
  const now = 10 * 60 * 1000;

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports an older build installed after a newer one, once", () => {
    const history = [
      { version: target, firstSeen: 5000 },
      { version: from, firstSeen: 100 },
    ];
    expect(takeGoBackNotice(history, target, now)).toEqual({
      kind: "done",
      build: "490",
      time: 5000,
    });
    expect(takeGoBackNotice(history, target, now + 1000)).toBeUndefined();
  });

  it("says nothing after an update forward to the newer build", () => {
    const history = [
      { version: from, firstSeen: 9000 },
      { version: target, firstSeen: 5000 },
      { version: from, firstSeen: 100 },
    ];
    expect(takeGoBackNotice(history, from, now)).toBeUndefined();
  });

  it("says nothing for an old way back or for versions without a build", () => {
    const old = [
      { version: target, firstSeen: 5000 },
      { version: from, firstSeen: 100 },
    ];
    expect(
      takeGoBackNotice(old, target, 5000 + 25 * 60 * 60 * 1000)
    ).toBeUndefined();
    const plain = [
      { version: "2026.11.1", firstSeen: 5000 },
      { version: "2026.11.2", firstSeen: 100 },
    ];
    expect(takeGoBackNotice(plain, "2026.11.1", now)).toBeUndefined();
  });
});
