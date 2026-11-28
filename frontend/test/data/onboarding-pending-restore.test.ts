import { describe, expect, it } from "vitest";
import {
  interpretPendingRestoreResponse,
  pendingRestorePollDelay,
} from "../../src/data/onboarding-pending-restore";

describe("interpretPendingRestoreResponse", () => {
  const restore = { name: "B", state: "failed", error: "x" } as const;

  it("returns the record the server sent", () => {
    expect(
      interpretPendingRestoreResponse(200, { pending_restore: restore })
    ).toEqual({ status: "record", restore });
  });

  it("treats a null record as none", () => {
    expect(
      interpretPendingRestoreResponse(200, { pending_restore: null })
    ).toEqual({ status: "none" });
  });

  it("treats a missing route as none, so onboarding shows its welcome step", () => {
    expect(interpretPendingRestoreResponse(404, undefined)).toEqual({
      status: "none",
    });
  });

  it("keeps an unreachable answer apart from none", () => {
    // A restore stops Core on purpose, and the page must keep its last state
    expect(interpretPendingRestoreResponse(502, undefined)).toEqual({
      status: "unreachable",
    });
  });

  it("stops reading the public route once Core requires sign-in", () => {
    expect(interpretPendingRestoreResponse(401, undefined)).toEqual({
      status: "none",
    });
  });

  it("retries a first-start outage and polls until restore finishes", () => {
    const outage = interpretPendingRestoreResponse(502, undefined);
    expect(pendingRestorePollDelay(outage, 1)).toBe(6000);
    expect(pendingRestorePollDelay(outage, 12)).toBe(24000);
    for (const state of ["queued", "running", "done", "failed"] as const) {
      const result = interpretPendingRestoreResponse(200, {
        pending_restore: { ...restore, state },
      });
      expect(pendingRestorePollDelay(result, 0)).toBe(
        state === "queued" || state === "running" ? 3000 : undefined
      );
    }
  });
});
