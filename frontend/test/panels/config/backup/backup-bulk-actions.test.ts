import { describe, expect, it } from "vitest";
import {
  CLOUD_AGENT,
  CORE_LOCAL_AGENT,
  type BackupContent,
} from "../../../../src/data/backup";
import {
  backupPreviewItems,
  newestBackupId,
  planBackupDelete,
  summarizeBackupDelete,
} from "../../../../src/panels/config/backup/backup-bulk-actions";

const backup = (
  id: string,
  date: string,
  agents: string[] = [CORE_LOCAL_AGENT, CLOUD_AGENT],
  size = 1000
): BackupContent => ({
  backup_id: id,
  date,
  name: `Backup ${id}`,
  agents: Object.fromEntries(
    agents.map((agent) => [agent, { size, protected: false }])
  ),
  failed_agent_ids: [],
  failed_addons: [],
  failed_folders: [],
  extra_metadata: {},
  with_automatic_settings: null,
});

const all = [
  backup("old", "2026-01-01T10:00:00Z"),
  backup("mid", "2026-02-01T10:00:00Z", [CORE_LOCAL_AGENT]),
  backup("new", "2026-03-01T10:00:00Z"),
];

describe("planBackupDelete", () => {
  it("marks the most recent backup of all, not only of the selection", () => {
    expect(newestBackupId(all)).toBe("new");
    const plan = planBackupDelete(["old", "mid"], all);
    expect(plan.deletable.some((entry) => entry.newest)).toBe(false);
    const withNewest = planBackupDelete(["old", "new"], all);
    expect(withNewest.deletable.find((e) => e.backupId === "new")?.newest).toBe(
      true
    );
  });

  it("warns about a backup that is stored in one location only", () => {
    const plan = planBackupDelete(["old", "mid"], all);
    const mid = plan.deletable.find((entry) => entry.backupId === "mid");
    expect(mid?.onlyCopy).toBe(true);
    expect(mid?.agentIds).toEqual([CORE_LOCAL_AGENT]);
    expect(
      plan.deletable.find((entry) => entry.backupId === "old")?.onlyCopy
    ).toBe(false);
  });

  it("lists the backups with the most recent first", () => {
    const plan = planBackupDelete(["old", "new", "mid"], all);
    expect(plan.deletable.map((entry) => entry.backupId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(plan.deletable[0].size).toBe(1000);
  });

  it("skips locked backups and backups that are still being created", () => {
    const plan = planBackupDelete(["old", "mid", "new"], all, {
      lockedIds: new Set(["old"]),
      creatingIds: new Set(["mid"]),
    });
    expect(plan.deletable.map((entry) => entry.backupId)).toEqual(["new"]);
    expect(plan.skipped).toEqual([
      { backupId: "old", name: "Backup old", reason: "locked" },
      { backupId: "mid", name: "Backup mid", reason: "creating" },
    ]);
  });

  it("includes selected backups that a search or filter hides", () => {
    // The plan works from every backup, so a hidden row is treated alike
    const plan = planBackupDelete(["old"], all);
    expect(plan.deletable).toHaveLength(1);
    expect(plan.deletable[0].backupId).toBe("old");
  });

  it("skips an id that no longer exists and ignores duplicates", () => {
    const plan = planBackupDelete(["old", "old", "gone"], all);
    expect(plan.deletable).toHaveLength(1);
    expect(plan.skipped).toEqual([
      { backupId: "gone", name: "gone", reason: "missing" },
    ]);
  });
});

describe("backupPreviewItems", () => {
  const text = { entry: "entry", newest: "newest", onlyCopy: "only copy" };

  it("draws the costs that cannot be undone as warnings, not as a safe line", () => {
    expect(backupPreviewItems({ newest: true, onlyCopy: true }, text)).toEqual([
      { kind: "change", text: "entry" },
      { kind: "warning", text: "newest" },
      { kind: "warning", text: "only copy" },
    ]);
  });

  it("adds a warning only for the cost the backup really has", () => {
    expect(backupPreviewItems({ newest: false, onlyCopy: true }, text)).toEqual(
      [
        { kind: "change", text: "entry" },
        { kind: "warning", text: "only copy" },
      ]
    );
    expect(
      backupPreviewItems({ newest: false, onlyCopy: false }, text)
    ).toEqual([{ kind: "change", text: "entry" }]);
  });
});

describe("summarizeBackupDelete", () => {
  it("separates deleted backups from failed ones", () => {
    const error = new Error("busy");
    const outcome = summarizeBackupDelete(
      ["a", "b", "c"],
      [
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: error },
        { status: "fulfilled", value: undefined },
      ]
    );
    expect(outcome.deleted).toEqual(["a", "c"]);
    expect(outcome.failed).toEqual([{ backupId: "b", error }]);
  });
});
