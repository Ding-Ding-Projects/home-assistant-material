import { describe, expect, it } from "vitest";
import { interpretPendingRestoreResponse } from "../../src/data/onboarding-pending-restore";

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
    expect(interpretPendingRestoreResponse(401, undefined)).toEqual({
      status: "unreachable",
    });
  });
});
