import { describe, expect, it } from "vitest";
import type { UpdateStageInput } from "../../../src/components/update-progress/update-progress-logic";
import {
  buildProblemSummary,
  deriveUpdateStage,
  isConnectionLostError,
} from "../../../src/components/update-progress/update-progress-logic";

// Protects two promises: the install card never claims a stage or a percentage
// that no signal reported, and the copied problem summary never carries a
// credential.

const base: UpdateStageInput = {
  inProgress: false,
  supportsProgress: true,
  percentage: null,
  backupRequested: false,
  disconnected: false,
  callPending: false,
  seenInProgress: true,
  installedVersion: "2025.1.0",
  targetVersion: "2025.2.0",
  fromVersion: "2025.1.0",
  graceExpired: false,
};

describe("deriveUpdateStage", () => {
  it("shows a percentage only when the entity reports one", () => {
    expect(
      deriveUpdateStage({ ...base, inProgress: true, percentage: 41.7 })
    ).toEqual({ stage: "installing", percent: 41 });
    expect(
      deriveUpdateStage({ ...base, inProgress: true, supportsProgress: false })
    ).toEqual({ stage: "installing" });
    // A percentage on an entity that does not support progress is ignored.
    expect(
      deriveUpdateStage({
        ...base,
        inProgress: true,
        supportsProgress: false,
        percentage: 50,
      }).percent
    ).toBeUndefined();
  });

  it("says preparing while progress is supported but not yet reported", () => {
    expect(deriveUpdateStage({ ...base, inProgress: true })).toEqual({
      stage: "preparing",
    });
  });

  it("names the backup stage only when the manager reports a backup", () => {
    const input = { ...base, inProgress: true, backupRequested: true };
    expect(
      deriveUpdateStage({ ...input, backupState: "create_backup" })
    ).toEqual({ stage: "backing_up" });
    expect(deriveUpdateStage({ ...input, backupState: "idle" }).stage).not.toBe(
      "backing_up"
    );
    expect(
      deriveUpdateStage({
        ...base,
        inProgress: true,
        backupState: "create_backup",
      }).stage
    ).not.toBe("backing_up");
  });

  it("waits while the socket is down and checks the version after", () => {
    expect(
      deriveUpdateStage({ ...base, inProgress: true, disconnected: true })
    ).toEqual({ stage: "waiting" });
    expect(deriveUpdateStage({ ...base })).toEqual({ stage: "checking" });
    expect(
      deriveUpdateStage({ ...base, installedVersion: "2025.2.0" })
    ).toEqual({ stage: "done" });
  });

  it("fails when the new version never shows up, or the call failed", () => {
    expect(deriveUpdateStage({ ...base, graceExpired: true })).toEqual({
      stage: "failed",
    });
    expect(
      deriveUpdateStage({ ...base, inProgress: true, callError: "boom" })
    ).toEqual({ stage: "failed" });
  });

  it("does not call a started install failed before it reports", () => {
    expect(
      deriveUpdateStage({ ...base, callPending: true, seenInProgress: false })
    ).toEqual({ stage: "preparing" });
  });

  it("treats a dropped socket as a restart, not a failed call", () => {
    expect(isConnectionLostError({ code: 3 })).toBe(true);
    expect(isConnectionLostError({ code: 1, message: "x" })).toBe(false);
    expect(isConnectionLostError(new Error("x"))).toBe(false);
  });
});

describe("buildProblemSummary", () => {
  const labels = {
    heading: "Summary",
    what: "Update",
    from: "From",
    to: "To",
    stage: "Stage",
    error: "Error",
    instance: "Instance",
    time: "Time",
    unknown: "not known",
  };

  it("hides credentials in every field", () => {
    const text = buildProblemSummary(
      {
        title: "Core",
        fromVersion: "1",
        toVersion: "2",
        stage: "Installing",
        error: "fetch https://user:hunter2@example.org/x failed, token=abcdef",
        instanceVersion: "2025.1.0",
        time: "2025-01-01T00:00:00Z",
      },
      labels
    );
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("abcdef");
    expect(text).toContain("Error: ");
  });

  it("says not known instead of leaving a field empty", () => {
    const text = buildProblemSummary(
      {
        title: "Core",
        fromVersion: null,
        toVersion: undefined,
        stage: "Failed",
        error: undefined,
        instanceVersion: "2025.1.0",
        time: "t",
      },
      labels
    );
    expect(text).toContain("From: not known");
    expect(text).toContain("Error: not known");
  });
});
