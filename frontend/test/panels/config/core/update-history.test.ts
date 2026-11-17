import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  anyUpdateInProgress,
  historyRows,
  installCoreVersion,
  parseStoredHistory,
  recordVersion,
  rollbackBlockReason,
  rollbackTargets,
  runDuration,
  splitDuration,
} from "../../../../src/panels/config/core/updates/update-history";
import type {
  HistoryEntry,
  RollbackContext,
} from "../../../../src/panels/config/core/updates/update-history";

// Protects the rules for going back to an earlier Core build: only a build
// that really ran here and is older is offered, and nothing starts while
// another update is running. A wrong answer here would offer an install of a
// version this instance never had, or restart Core in the middle of another
// update, without any visible error.

const entry = (version: string, firstSeen: number): HistoryEntry => ({
  version,
  firstSeen,
});

describe("recordVersion", () => {
  it("seeds an empty history with the current version", () => {
    expect(recordVersion([], "2026.11.1.457", 1000)).toEqual([
      entry("2026.11.1.457", 1000),
    ]);
  });

  it("does not add the same version twice in a row", () => {
    const history = [entry("2026.11.1.457", 1000)];
    expect(recordVersion(history, "2026.11.1.457", 9000)).toEqual(history);
  });

  it("puts a new version first and keeps the older ones", () => {
    const history = [entry("2026.11.1.457", 1000)];
    const next = recordVersion(history, "2026.11.1.460", 5000);
    expect(next.map((item) => item.version)).toEqual([
      "2026.11.1.460",
      "2026.11.1.457",
    ]);
    expect(next[0].firstSeen).toBe(5000);
  });

  it("starts a new run when an older version comes back", () => {
    const history = [
      entry("2026.11.1.460", 5000),
      entry("2026.11.1.457", 1000),
    ];
    const next = recordVersion(history, "2026.11.1.457", 8000);
    expect(next.map((item) => item.version)).toEqual([
      "2026.11.1.457",
      "2026.11.1.460",
      "2026.11.1.457",
    ]);
  });

  it("ignores an empty version", () => {
    expect(recordVersion([entry("a.b.c.1", 1)], "  ", 5)).toHaveLength(1);
    expect(recordVersion([], null, 5)).toEqual([]);
  });

  it("keeps at most the limit, dropping the oldest", () => {
    let history: HistoryEntry[] = [];
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
      history = recordVersion(history, `2026.11.1.${100 + i}`, i * 1000);
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].version).toBe(`2026.11.1.${100 + HISTORY_LIMIT + 5}`);
    expect(history.some((item) => item.version === "2026.11.1.101")).toBe(
      false
    );
  });
});

describe("durations", () => {
  const history = [
    entry("2026.11.1.470", 10_000_000),
    entry("2026.11.1.460", 4_000_000),
    entry("2026.11.1.450", 1_000_000),
  ];

  it("measures a run to the start of the next one", () => {
    expect(runDuration(history, 1)).toBe(6_000_000);
    expect(runDuration(history, 2)).toBe(3_000_000);
  });

  it("has no duration for the current version", () => {
    expect(runDuration(history, 0)).toBeUndefined();
  });

  it("splits a duration into days, hours and minutes", () => {
    expect(splitDuration((26 * 60 + 5) * 60000)).toEqual({
      days: 1,
      hours: 2,
      minutes: 5,
    });
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it("marks only the newest entry as current", () => {
    const rows = historyRows(history, "2026.11.1.470");
    expect(rows.map((row) => row.isCurrent)).toEqual([true, false, false]);
    expect(rows[1].build).toBe(460);
    expect(rows[1].ranFor).toBe(6_000_000);
  });
});

describe("rollbackTargets", () => {
  it("offers only older builds that were installed here, once each", () => {
    const history = [
      entry("2026.11.1.470", 9),
      entry("2026.11.1.450", 8),
      entry("2026.11.1.460", 7),
      entry("2026.11.1.450", 6),
      entry("2026.11.1.480", 5),
    ];
    expect(rollbackTargets(history, "2026.11.1.470")).toEqual([
      "2026.11.1.460",
      "2026.11.1.450",
    ]);
  });

  it("offers nothing when the current build cannot be read", () => {
    expect(rollbackTargets([entry("2026.11.1.450", 1)], "dev")).toEqual([]);
  });

  it("never offers a version without a readable build number", () => {
    expect(rollbackTargets([entry("2026.11.1", 1)], "2026.11.1.470")).toEqual(
      []
    );
  });

  it("offers nothing on a fresh history", () => {
    expect(
      rollbackTargets([entry("2026.11.1.470", 1)], "2026.11.1.470")
    ).toEqual([]);
  });
});

describe("rollbackBlockReason", () => {
  const free: RollbackContext = {
    isAdmin: true,
    supervisorAvailable: true,
    queueActive: false,
    updateRunning: false,
    rollbackRunning: false,
  };

  it("allows going back when nothing stands in the way", () => {
    expect(rollbackBlockReason(free)).toBeUndefined();
  });

  it("refuses for a person who is not an administrator", () => {
    expect(rollbackBlockReason({ ...free, isAdmin: false })).toBe("not_admin");
  });

  it("refuses without the Supervisor", () => {
    expect(rollbackBlockReason({ ...free, supervisorAvailable: false })).toBe(
      "no_supervisor"
    );
  });

  it("refuses while the queue or another update is running", () => {
    expect(rollbackBlockReason({ ...free, queueActive: true })).toBe(
      "queue_running"
    );
    expect(rollbackBlockReason({ ...free, updateRunning: true })).toBe(
      "update_running"
    );
  });

  it("refuses a second start while going back is running", () => {
    expect(rollbackBlockReason({ ...free, rollbackRunning: true })).toBe(
      "rollback_running"
    );
  });

  it("finds a running update among the entities", () => {
    expect(
      anyUpdateInProgress({
        "update.a": { attributes: { in_progress: false } },
        "light.b": { attributes: { in_progress: true } },
      })
    ).toBe(false);
    expect(
      anyUpdateInProgress({
        "update.a": { attributes: { in_progress: true } },
      })
    ).toBe(true);
  });
});

describe("parseStoredHistory", () => {
  it("reads a valid stored history", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [{ version: "2026.11.1.470", firstSeen: 5 }],
    });
    expect(parseStoredHistory(raw)).toEqual([entry("2026.11.1.470", 5)]);
  });

  it("drops anything unexpected", () => {
    expect(parseStoredHistory(null)).toEqual([]);
    expect(parseStoredHistory("not json")).toEqual([]);
    expect(
      parseStoredHistory(JSON.stringify({ version: 2, entries: [] }))
    ).toEqual([]);
    const raw = JSON.stringify({
      version: 1,
      entries: [
        { version: 5, firstSeen: 1 },
        { version: "x.y.z.1", firstSeen: "late" },
        { version: "x.y.z.2", firstSeen: 3 },
      ],
    });
    expect(parseStoredHistory(raw)).toEqual([entry("x.y.z.2", 3)]);
  });
});

describe("installCoreVersion", () => {
  // The Supervisor reads version, backup and background from this call and
  // accepts an older version. A wrong key would be ignored silently and the
  // latest version would be installed instead of the chosen one.
  it("sends the chosen older version and the backup choice to the Core update call", async () => {
    const calls: any[] = [];
    const hass = {
      callWS: async (msg: any) => {
        calls.push(msg);
      },
    } as any;
    await installCoreVersion(hass, "2026.11.1.450", true);
    expect(calls).toEqual([
      {
        type: "supervisor/api",
        endpoint: "/core/update",
        method: "post",
        timeout: null,
        data: { version: "2026.11.1.450", backup: true },
      },
    ]);
  });
});
