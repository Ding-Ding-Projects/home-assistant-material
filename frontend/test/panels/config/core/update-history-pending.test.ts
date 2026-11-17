import { describe, expect, it } from "vitest";
import {
  GO_BACK_KEEP_MS,
  GO_BACK_LIMIT_MS,
  parsePendingGoBack,
  resolvePendingGoBack,
} from "../../../../src/panels/config/core/updates/update-history";

// Protects the one-time report about a way back across the reload: the page
// that started it is replaced by the older build's page, so the result has to
// come from stored evidence, never from a timer alone.

describe("pending way back", () => {
  const pending = {
    version: "2026.11.1.490",
    startedAt: 1000,
    fromVersion: "2026.11.1.495",
  };

  it("is done once the installed version is the target", () => {
    expect(resolvePendingGoBack(pending, [], "2026.11.1.490", 2000)).toEqual({
      kind: "done",
      time: 2000,
    });
  });

  it("trusts a record that was marked done, even on a newer build", () => {
    expect(
      resolvePendingGoBack(
        { ...pending, done: true, finishedAt: 5000 },
        [],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS * 3
      )
    ).toEqual({ kind: "done", time: 5000 });
  });

  it("trusts a history entry for the target first seen after the start", () => {
    expect(
      resolvePendingGoBack(
        pending,
        [
          { version: "2026.11.1.495", firstSeen: 9000 },
          { version: "2026.11.1.490", firstSeen: 3000 },
        ],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS * 2
      )
    ).toEqual({ kind: "done", time: 3000 });
  });

  it("ignores a history entry for the target from before the start", () => {
    expect(
      resolvePendingGoBack(
        pending,
        [{ version: "2026.11.1.490", firstSeen: 500 }],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS * 2
      )
    ).toEqual({ kind: "failed" });
  });

  it("says it did not finish only when the original version is still installed", () => {
    expect(
      resolvePendingGoBack(
        pending,
        [],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS
      )
    ).toEqual({ kind: "pending" });
    expect(
      resolvePendingGoBack(
        pending,
        [],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS + 1
      )
    ).toEqual({ kind: "failed" });
  });

  it("stays silent when another version is installed or the start is unknown", () => {
    expect(
      resolvePendingGoBack(
        pending,
        [],
        "2026.11.1.500",
        1000 + GO_BACK_LIMIT_MS + 1
      )
    ).toEqual({ kind: "pending" });
    expect(
      resolvePendingGoBack(
        { version: pending.version, startedAt: 1000 },
        [],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS + 1
      )
    ).toEqual({ kind: "pending" });
  });

  it("drops an unsettled record after a day without saying anything", () => {
    expect(
      resolvePendingGoBack(
        pending,
        [],
        "2026.11.1.500",
        1000 + GO_BACK_KEEP_MS + 1
      )
    ).toEqual({ kind: "clear" });
  });

  it("does not call the real sequence unfinished", () => {
    // Back from 495 to 490 (no history card on 490), then updated to 495 again.
    const recorded = { ...pending, done: true, finishedAt: 4000 };
    expect(
      resolvePendingGoBack(
        recorded,
        [{ version: "2026.11.1.495", firstSeen: 100 }],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS * 4
      ).kind
    ).toBe("done");
    // Without the done mark the same state stays silent, not "unfinished"
    // as long as the original version is not the one installed... here it is,
    // so the stale case is the only one allowed to say so.
    expect(
      resolvePendingGoBack(
        { ...pending, fromVersion: "2026.11.1.480" },
        [],
        "2026.11.1.495",
        1000 + GO_BACK_LIMIT_MS * 4
      ).kind
    ).toBe("pending");
  });

  it("reads back only a well formed record", () => {
    expect(parsePendingGoBack(JSON.stringify(pending))).toEqual(pending);
    const done = { ...pending, done: true, finishedAt: 5000 };
    expect(parsePendingGoBack(JSON.stringify(done))).toEqual(done);
    expect(parsePendingGoBack("nope")).toBeUndefined();
    expect(parsePendingGoBack('{"version":1}')).toBeUndefined();
  });
});
