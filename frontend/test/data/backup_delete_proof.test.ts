import { describe, expect, it } from "vitest";
import {
  CLOUD_AGENT,
  CORE_LOCAL_AGENT,
  type BackupContent,
} from "../../src/data/backup";
import {
  bulkDeleteResultCounts,
  formatMarkedTime,
  isDeleteProofError,
  summarizeDeleteProof,
} from "../../src/data/backup_delete_proof";
import { generatePlaceItems } from "../../src/dialogs/quick-bar/quick-bar-navigation";
import { planBackupDelete } from "../../src/panels/config/backup/backup-bulk-actions";

const MARK = {
  marked_at: "2026-11-18T21:58:00Z",
  marked_by: "user",
  marked_by_name: "Owner",
};

const backup = (
  id: string,
  date: string,
  options: { marked?: boolean; agents?: string[]; size?: number } = {}
): BackupContent => ({
  backup_id: id,
  date,
  name: `Backup ${id}`,
  agents: Object.fromEntries(
    (options.agents ?? [CORE_LOCAL_AGENT]).map((agent) => [
      agent,
      { size: options.size ?? 100, protected: false },
    ])
  ),
  failed_agent_ids: [],
  failed_addons: [],
  failed_folders: [],
  extra_metadata: {},
  with_automatic_settings: null,
  ...(options.marked ? { delete_proof: MARK } : {}),
});

describe("planBackupDelete with delete proof backups", () => {
  // Protects the rule that deleting several never sends a marked backup
  it("skips a delete proof backup with its own reason", () => {
    const all = [
      backup("a", "2026-01-01T10:00:00Z"),
      backup("b", "2026-02-01T10:00:00Z", { marked: true }),
      backup("c", "2026-03-01T10:00:00Z"),
    ];
    const plan = planBackupDelete(["a", "b", "c"], all);
    expect(plan.deletable.map((entry) => entry.backupId)).toEqual(["c", "a"]);
    expect(plan.skipped).toEqual([
      { backupId: "b", name: "Backup b", reason: "delete_proof" },
    ]);
  });
});

describe("bulkDeleteResultCounts", () => {
  it("counts skipped and refused delete proof backups as kept", () => {
    expect(
      bulkDeleteResultCounts(2, 1, [
        { code: "backup_delete_proof" },
        { code: "unknown" },
      ])
    ).toEqual({ deleted: 2, keptDeleteProof: 2 });
  });

  it("counts nothing kept when none is delete proof", () => {
    expect(bulkDeleteResultCounts(3, 0, [])).toEqual({
      deleted: 3,
      keptDeleteProof: 0,
    });
  });
});

describe("summarizeDeleteProof", () => {
  // Protects the space line: only marked backups count, once each
  it("adds the size of the marked backups only", () => {
    const summary = summarizeDeleteProof([
      backup("a", "2026-01-01T10:00:00Z", {
        marked: true,
        agents: [CORE_LOCAL_AGENT, CLOUD_AGENT],
        size: 400,
      }),
      backup("b", "2026-02-01T10:00:00Z", { marked: true, size: 383 }),
      backup("c", "2026-03-01T10:00:00Z", { size: 999 }),
    ]);
    expect(summary.count).toBe(2);
    expect(summary.size).toBe(783);
    expect(summary.missingIds).toEqual([]);
  });

  it("lists marks whose backup no location reports", () => {
    const summary = summarizeDeleteProof(
      [backup("a", "2026-01-01T10:00:00Z", { marked: true })],
      { a: MARK, gone: MARK }
    );
    expect(summary.missingIds).toEqual(["gone"]);
  });
});

describe("isDeleteProofError", () => {
  it("recognises the refusal and the unreadable marks", () => {
    expect(isDeleteProofError({ code: "backup_delete_proof" })).toBe(true);
    expect(
      isDeleteProofError({ code: "delete_proof_records_unreadable" })
    ).toBe(true);
    expect(isDeleteProofError({ code: "home_assistant_error" })).toBe(false);
    expect(isDeleteProofError(undefined)).toBe(false);
  });
});

describe("search of everything", () => {
  // Protects that "delete proof" can be found from the top bar search
  it("offers the delete proof backups to administrators only", () => {
    const t = (key: string) => key;
    const admin = generatePlaceItems(t, true).find(
      (item) => item.placeId === "backup_delete_proof"
    );
    expect(admin?.path).toBe("/config/backup/backups#delete_proof");
    expect(
      generatePlaceItems(t, false).some(
        (item) => item.placeId === "backup_delete_proof"
      )
    ).toBe(false);
  });
});

describe("formatMarkedTime", () => {
  // Protects the 24-hour clock the backup sheet promises
  it("uses a 24-hour clock in the given time zone", () => {
    expect(formatMarkedTime("2026-11-18T21:58:00Z", "en-GB", "UTC")).toBe(
      "18 Nov 21:58"
    );
    expect(formatMarkedTime("2026-11-18T09:05:00Z", "en-US", "UTC")).toMatch(
      /09:05$/
    );
  });

  it("returns the stored text when it is not a time", () => {
    expect(formatMarkedTime("not a time", "en-GB", "UTC")).toBe("not a time");
  });
});
