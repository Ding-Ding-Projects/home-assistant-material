import { describe, expect, it } from "vitest";
import {
  classifyStagedInstall,
  isFinalStage,
} from "../../../src/components/update-progress/update-progress-logic";

// Protects the honest end of an operating system update: a staged version that
// waits for a restart is not "installed", and a machine that comes back on the
// old version is reported as rolled back.

const input = {
  running: "1",
  pending: null as string | null,
  target: "2",
  from: "1",
};

describe("classifyStagedInstall", () => {
  it("needs a restart while a different version is staged", () => {
    expect(classifyStagedInstall({ ...input, pending: "2" })).toBe(
      "restart_required"
    );
  });

  it("is done once the running version is the staged one", () => {
    expect(
      classifyStagedInstall({ ...input, running: "2", pending: null })
    ).toBe("done");
  });

  it("is rolled back when the old version runs and nothing is staged", () => {
    expect(classifyStagedInstall(input)).toBe("rolled_back");
  });

  it("is not a restart when the staged version is already running", () => {
    expect(
      classifyStagedInstall({ ...input, running: "2", pending: "2" })
    ).toBe("done");
  });
});

describe("isFinalStage", () => {
  it("treats a rollback as the end and a pending restart as not the end", () => {
    expect(isFinalStage("rolled_back")).toBe(true);
    expect(isFinalStage("restart_required")).toBe(false);
  });
});
