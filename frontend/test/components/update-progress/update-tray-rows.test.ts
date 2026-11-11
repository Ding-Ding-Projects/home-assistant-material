import { describe, expect, it } from "vitest";
import type { UpdateRun } from "../../../src/components/update-progress/update-install-tracker";
import {
  deriveUpdateTrayRows,
  UPDATE_ROW_LINGER_MS,
} from "../../../src/components/update-progress/update-install-tracker";

// Protects what the tray promises about update installs: a slow restart is a
// running row and never a failed one, a percentage is shown only when the
// entity reported one, a finished row leaves after a minute while a failed one
// stays, and failure details never carry a credential.

const NOW = 1_000_000;

const run = (patch: Partial<UpdateRun>): UpdateRun => ({
  entityId: "update.core",
  title: "Core",
  fromVersion: "1",
  targetVersion: "2",
  backupRequested: false,
  stage: "installing",
  startedAt: NOW - 5000,
  canRetry: true,
  generation: 1,
  activityId: "a1",
  ...patch,
});

describe("deriveUpdateTrayRows", () => {
  it("shows a running install with its percentage", () => {
    const [row] = deriveUpdateTrayRows([run({ percent: 42 })], NOW);
    expect(row.state).toBe("running");
    expect(row.stage).toBe("installing");
    expect(row.percent).toBe(42);
    expect(row.expiresAt).toBeUndefined();
  });

  it("shows no percentage when the entity reported none", () => {
    const [row] = deriveUpdateTrayRows([run({})], NOW);
    expect(row.percent).toBeUndefined();
  });

  it("keeps a restart wait and the version check as running rows", () => {
    for (const stage of ["waiting", "checking"] as const) {
      const [row] = deriveUpdateTrayRows([run({ stage })], NOW);
      expect(row.state).toBe("running");
      expect(row.details).toBeUndefined();
      expect(row.canRetry).toBe(false);
    }
  });

  it("flags a slow start only while running", () => {
    expect(
      deriveUpdateTrayRows([run({ stage: "preparing", slow: true })], NOW)[0]
        .slow
    ).toBe(true);
    expect(
      deriveUpdateTrayRows([run({ stage: "failed", slow: true })], NOW)[0].slow
    ).toBe(false);
  });

  it("keeps a failed install with retry and redacted details, without expiry", () => {
    const [row] = deriveUpdateTrayRows(
      [
        run({
          stage: "failed",
          finishedAt: NOW - 10 * UPDATE_ROW_LINGER_MS,
          error: "pull failed Authorization: Bearer abcdefghijklmnop",
        }),
      ],
      NOW
    );
    expect(row.state).toBe("failed");
    expect(row.canRetry).toBe(true);
    expect(row.expiresAt).toBeUndefined();
    expect(row.details).not.toContain("abcdefghijklmnop");
  });

  it("offers no retry for an adopted run", () => {
    const [row] = deriveUpdateTrayRows(
      [run({ stage: "failed", canRetry: false, error: "x" })],
      NOW
    );
    expect(row.canRetry).toBe(false);
  });

  it("keeps a finished install for a minute and then drops it", () => {
    const finished = run({ stage: "done", finishedAt: NOW - 1000 });
    const [row] = deriveUpdateTrayRows([finished], NOW);
    expect(row.state).toBe("done");
    expect(row.expiresAt).toBe(NOW - 1000 + UPDATE_ROW_LINGER_MS);
    expect(
      deriveUpdateTrayRows([finished], NOW - 1000 + UPDATE_ROW_LINGER_MS)
    ).toEqual([]);
  });

  it("orders rows by start time", () => {
    const rows = deriveUpdateTrayRows(
      [
        run({ entityId: "update.b", startedAt: NOW - 1 }),
        run({ entityId: "update.a", startedAt: NOW - 100 }),
      ],
      NOW
    );
    expect(rows.map((r) => r.entityId)).toEqual(["update.a", "update.b"]);
  });
});
