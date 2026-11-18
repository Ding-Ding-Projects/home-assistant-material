import { describe, expect, it } from "vitest";
import type {
  BackupContent,
  BackupSelfCheck,
} from "../../../../src/data/backup";
import {
  latestSelfChecked,
  readableReason,
  selfCheckReasonText,
  summarizeSelfCheck,
} from "../../../../src/panels/config/backup/helper/backup-self-check";

const selfCheck = (
  statuses: Record<
    string,
    "passed" | "failed" | "not_applicable" | "could_not_check"
  >,
  checkedAt = "2026-01-02T03:00:00+00:00"
): BackupSelfCheck => ({
  status: "passed",
  checked_at: checkedAt,
  checks: Object.entries(statuses).map(([check, status]) => ({
    check,
    status,
  })),
});

const backup = (id: string, check?: BackupSelfCheck): BackupContent =>
  ({ backup_id: id, self_check: check }) as BackupContent;

describe("summarizeSelfCheck", () => {
  it("shows nothing when there is no result", () => {
    expect(summarizeSelfCheck(undefined)).toBeUndefined();
  });

  it("counts only checks that apply", () => {
    const summary = summarizeSelfCheck(
      selfCheck({ a: "passed", b: "passed", c: "not_applicable" })
    )!;
    expect(summary.state).toBe("passed");
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.checks.map((c) => c.check)).toEqual(["a", "b"]);
  });

  it("names the failed checks and prefers failed over could not check", () => {
    const summary = summarizeSelfCheck(
      selfCheck({ a: "passed", b: "failed", c: "could_not_check" })
    )!;
    expect(summary.state).toBe("failed");
    expect(summary.failed.map((c) => c.check)).toEqual(["b"]);
    expect(summary.couldNotCheck.map((c) => c.check)).toEqual(["c"]);
    expect(summary.passed).toBe(1);
    expect(summary.total).toBe(3);
  });

  it("is partial when something could not be checked and nothing failed", () => {
    expect(
      summarizeSelfCheck(selfCheck({ a: "passed", c: "could_not_check" }))!
        .state
    ).toBe("partial");
  });
});

describe("latestSelfChecked", () => {
  it("picks the backup that was checked last and skips unchecked ones", () => {
    const result = latestSelfChecked([
      backup("none"),
      backup("old", selfCheck({ a: "passed" }, "2026-01-01T00:00:00+00:00")),
      backup("new", selfCheck({ a: "failed" }, "2026-01-03T00:00:00+00:00")),
    ])!;
    expect(result.backup.backup_id).toBe("new");
    expect(result.summary.state).toBe("failed");
  });

  it("returns nothing when no backup has a result", () => {
    expect(latestSelfChecked([backup("a")])).toBeUndefined();
  });
});

describe("self-check reason wording", () => {
  it("makes a readable sentence of a code with no wording, never the raw code", () => {
    expect(readableReason("remote_copy_not_downloaded")).toBe(
      "Remote copy not downloaded."
    );
    expect(readableReason("")).toBe("");
  });

  it("uses the written wording when there is one and the sentence when not", () => {
    const hass = {
      localize: (key: string) =>
        key.endsWith(".reasons.timeout")
          ? "The place did not answer in time"
          : "",
    };
    expect(selfCheckReasonText(hass, "timeout")).toBe(
      "The place did not answer in time"
    );
    expect(selfCheckReasonText(hass, "some_new_reason")).toBe(
      "Some new reason."
    );
  });
});
