import { describe, expect, it } from "vitest";
import {
  filterBySeverity,
  notificationSeverity,
  sortBySeverity,
} from "../../../../src/panels/config/notifications/notification-insight";

const note = (notification_id: string, created_at: string) => ({
  notification_id,
  created_at,
});

describe("notificationSeverity", () => {
  it("is neutral by default, whatever the words say", () => {
    expect(notificationSeverity("backup_done")).toBe("neutral");
    expect(notificationSeverity("critical_error_happened")).toBe("neutral");
    expect(notificationSeverity("")).toBe("neutral");
  });

  it("reads known sources from the id", () => {
    expect(notificationSeverity("update_failed_core")).toBe("error");
    expect(notificationSeverity("repairs_disk")).toBe("warning");
    expect(notificationSeverity("system_restart")).toBe("info");
  });

  it("lets an explicit level win over a source", () => {
    expect(notificationSeverity("error.repairs_disk")).toBe("error");
    expect(notificationSeverity("Warning-update_failed")).toBe("warning");
    expect(notificationSeverity("info:system_boom")).toBe("info");
  });
});

describe("sortBySeverity", () => {
  it("sorts by severity, then newest first", () => {
    const sorted = sortBySeverity([
      note("plain_new", "2026-01-05T00:00:00Z"),
      note("repairs_old", "2026-01-01T00:00:00Z"),
      note("error.a", "2026-01-02T00:00:00Z"),
      note("repairs_new", "2026-01-04T00:00:00Z"),
      note("plain_old", "2026-01-03T00:00:00Z"),
    ]);
    expect(sorted.map((item) => item.notification_id)).toEqual([
      "error.a",
      "repairs_new",
      "repairs_old",
      "plain_new",
      "plain_old",
    ]);
  });

  it("does not change the list it is given", () => {
    const input = [
      note("b", "2026-01-01T00:00:00Z"),
      note("error.a", "2026-01-01T00:00:00Z"),
    ];
    sortBySeverity(input);
    expect(input[0].notification_id).toBe("b");
  });
});

describe("filterBySeverity", () => {
  const items = [
    note("error.a", "2026-01-01T00:00:00Z"),
    note("repairs_b", "2026-01-01T00:00:00Z"),
    note("plain", "2026-01-01T00:00:00Z"),
  ];

  it("keeps everything when nothing is chosen", () => {
    expect(filterBySeverity(items, [])).toHaveLength(3);
  });

  it("keeps only the chosen severities", () => {
    expect(
      filterBySeverity(items, ["error", "neutral"]).map(
        (item) => item.notification_id
      )
    ).toEqual(["error.a", "plain"]);
  });
});
