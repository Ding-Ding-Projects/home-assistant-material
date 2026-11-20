import { describe, expect, it } from "vitest";
import { CORE_LOCAL_AGENT, type BackupContent } from "../../src/data/backup";
import {
  canRestore,
  isCheckProblem,
  keptReason,
  passResult,
  pointerErrorReason,
  pointerRisk,
  pointerRows,
  rowsOnThisSystem,
  transferPercent,
  type BackupPointer,
} from "../../src/data/backup_pointer";

const REGISTRY = "registry_storage.entry1";

const backup = (
  id: string,
  date: string,
  agents: Record<string, number>
): BackupContent => ({
  backup_id: id,
  date,
  name: `Backup ${id}`,
  agents: Object.fromEntries(
    Object.entries(agents).map(([agentId, size]) => [
      agentId,
      { size, protected: true },
    ])
  ),
  failed_agent_ids: [],
  failed_addons: [],
  failed_folders: [],
  extra_metadata: {},
  with_automatic_settings: true,
});

const pointer = (
  id: string,
  date: string,
  check_state: BackupPointer["check_state"] = "present"
): BackupPointer => ({
  backup_id: id,
  name: `Backup ${id}`,
  date,
  agent_id: REGISTRY,
  place_name: "Registry",
  repository: "owner/backups",
  local_agent_id: CORE_LOCAL_AGENT,
  filename: `${id}.tar`,
  size: 400,
  check_value: "sha256:00",
  parts: 1,
  part_size: 1048576,
  made_at: date,
  verified_at: date,
  checked_at: date,
  check_state,
  check_reason: null,
  stored_size: 2,
  restorable: check_state !== "missing",
});

const places = [{ agent_id: REGISTRY, name: "Registry" }];

describe("pointerRows", () => {
  it("counts a copy here as whole and a pointer apart, newest first", () => {
    const rows = pointerRows(
      [
        backup("old", "2026-11-18T04:45:00Z", { [REGISTRY]: 400 }),
        backup("new", "2026-11-19T04:45:00Z", {
          [CORE_LOCAL_AGENT]: 402,
          [REGISTRY]: 402,
        }),
      ],
      {
        pointers: { old: pointer("old", "2026-11-18T04:45:00Z") },
        kept: {},
        places,
      }
    );
    expect(rows.map((row) => [row.backup_id, row.state, row.size])).toEqual([
      ["new", "whole", 402],
      ["old", "pointer", 400],
    ]);
    expect(rows[0].in_registry).toBe(true);
    expect(rows[0].pointer).toBeUndefined();
  });

  it("keeps a pointer whose backup no place lists, as missing", () => {
    const rows = pointerRows([], {
      pointers: { gone: pointer("gone", "2026-11-11T04:45:00Z") },
      kept: {},
      places,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("missing");
    expect(canRestore(rows[0])).toBe(false);
  });

  it("calls an unlisted pointer unknown when its registry did not answer", () => {
    const rows = pointerRows([], {
      pointers: { gone: pointer("gone", "2026-11-11T04:45:00Z") },
      kept: {},
      places,
      unreachable: [REGISTRY],
    });
    expect(rows[0].state).toBe("unknown");
    expect(canRestore(rows[0])).toBe(true);
    expect(rowsOnThisSystem(rows)).toHaveLength(1);
  });

  it("calls an unlisted pointer unknown when its registry is not loaded", () => {
    const rows = pointerRows([], {
      pointers: { gone: pointer("gone", "2026-11-11T04:45:00Z") },
      kept: {},
      places: [],
    });
    expect(rows[0].state).toBe("unknown");
    expect(canRestore(rows[0])).toBe(true);
  });

  it("keeps a pointer the check found missing as missing, reached or not", () => {
    const rows = pointerRows([], {
      pointers: {
        gone: pointer("gone", "2026-11-11T04:45:00Z", "missing"),
      },
      kept: {},
      places,
      unreachable: [REGISTRY],
    });
    expect(rows[0].state).toBe("missing");
    expect(canRestore(rows[0])).toBe(false);
  });

  it("marks a pointer the daily check found missing, and never offers a restore", () => {
    const rows = pointerRows(
      [backup("b", "2026-11-11T04:45:00Z", { [REGISTRY]: 400 })],
      {
        pointers: { b: pointer("b", "2026-11-11T04:45:00Z", "missing") },
        kept: {},
        places,
      }
    );
    expect(rows[0].state).toBe("missing");
    expect(canRestore(rows[0])).toBe(false);
  });

  it("shows only backups on this system: whole or a pointer", () => {
    const rows = pointerRows(
      [
        backup("remote", "2026-11-10T00:00:00Z", { [REGISTRY]: 1 }),
        backup("here", "2026-11-11T00:00:00Z", { [CORE_LOCAL_AGENT]: 1 }),
      ],
      { pointers: {}, kept: {}, places }
    );
    expect(rowsOnThisSystem(rows).map((row) => row.backup_id)).toEqual([
      "here",
    ]);
  });

  it("attaches why a whole copy was kept", () => {
    const kept = {
      reason: "no_answer",
      at: "2026-11-19T05:10:00Z",
      detail: null,
    };
    const rows = pointerRows(
      [backup("a", "2026-11-19T04:45:00Z", { [CORE_LOCAL_AGENT]: 1 })],
      { pointers: {}, kept: { a: kept }, places }
    );
    expect(rows[0].kept).toEqual(kept);
  });
});

describe("reasons", () => {
  it("maps unknown codes to unknown", () => {
    expect(keptReason("no_answer")).toBe("no_answer");
    expect(keptReason("something_new")).toBe("unknown");
    expect(keptReason(undefined)).toBe("unknown");
  });

  it("does not call a choice a problem", () => {
    expect(isCheckProblem("newest_kept_whole")).toBe(false);
    expect(isCheckProblem("going_back_not_finished")).toBe(false);
    expect(isCheckProblem("failed")).toBe(true);
  });

  it("reads the code of a refused call", () => {
    expect(pointerErrorReason({ code: "registry_copy_missing" })).toBe(
      "registry_copy_missing"
    );
    expect(pointerErrorReason(new Error("x"))).toBe("unknown");
  });

  it("knows the disk and registry reasons a bring back can end with", () => {
    for (const code of [
      "disk_full",
      "disk_refused",
      "disk_error",
      "registry_refused",
      "not_local",
    ]) {
      expect(pointerErrorReason({ code })).toBe(code);
    }
  });
});

// The result line after "Save space now" must say why nothing changed, so the
// counts per reason have to add up whichever form the result arrives in.
describe("passResult", () => {
  it("counts one outcome per backup from a pass run from the page", () => {
    expect(
      passResult({
        a: "pointer",
        b: "newest_kept_whole",
        c: "no_registry_copy",
        d: "no_registry_copy",
        e: "something_new",
      })
    ).toEqual({
      made: 1,
      kept: [
        { reason: "no_registry_copy", count: 2 },
        { reason: "newest_kept_whole", count: 1 },
        { reason: "unknown", count: 1 },
      ],
    });
  });

  it("reads the counts the subscription sends", () => {
    expect(passResult({ pointer: 2, timed_out: 1 })).toEqual({
      made: 2,
      kept: [{ reason: "timed_out", count: 1 }],
    });
  });

  it("is empty when there was nothing to try", () => {
    expect(passResult({})).toEqual({ made: 0, kept: [] });
  });
});

describe("transferPercent", () => {
  it("stays within 0 and 100", () => {
    expect(transferPercent({ bytes_done: 146, bytes_total: 398 })).toBe(36);
    expect(transferPercent({ bytes_done: 500, bytes_total: 398 })).toBe(100);
    expect(transferPercent({ bytes_done: 5, bytes_total: 0 })).toBe(0);
  });
});

describe("pointerRisk", () => {
  it("says plainly when every backup is only a pointer", () => {
    expect(pointerRisk({ pointers: 0, whole_here: 2 })).toBe("none");
    expect(pointerRisk({ pointers: 5, whole_here: 1 })).toBe("some");
    expect(pointerRisk({ pointers: 5, whole_here: 0 })).toBe("all");
  });
});
