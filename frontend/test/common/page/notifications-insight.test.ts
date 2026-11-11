import { describe, expect, it } from "vitest";
import {
  DISMISSED_KEEP_DAYS,
  forgetDismissed,
  loadDismissed,
  rememberDismissed,
} from "../../../src/panels/config/notifications/dismissed-notifications";
import {
  notificationActions,
  notificationSeverity,
} from "../../../src/panels/config/notifications/notification-insight";

// Protects the notification centre: severity colours must not paint an
// ordinary notice as an error, a link must never become a script address,
// and a dismissed notification must be kept for exactly 30 days.

describe("notificationSeverity", () => {
  it("reads errors, warnings and the rest from id and title", () => {
    expect(
      notificationSeverity({ notification_id: "x", title: "Sign in failed" })
    ).toBe("error");
    expect(
      notificationSeverity({ notification_id: "invalid_config", title: null })
    ).toBe("error");
    expect(
      notificationSeverity({
        notification_id: "y",
        title: "2 batteries are low",
      })
    ).toBe("warning");
    expect(
      notificationSeverity({ notification_id: "z", title: "Update installed" })
    ).toBe("info");
  });
});

describe("notificationActions", () => {
  it("turns links into at most two buttons and drops unsafe ones", () => {
    const actions = notificationActions(
      "[Open](/config/integrations) [Bad](javascript:alert(1)) " +
        "[Docs](https://example.com/a) [Third](/third) [Dup](/config/integrations) " +
        "[Proto](//evil.example)"
    );
    expect(actions).toEqual([
      { label: "Open", href: "/config/integrations" },
      { label: "Docs", href: "https://example.com/a" },
    ]);
  });
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

const item = (id: string) => ({
  notification_id: id,
  title: `Title ${id}`,
  message: "Message",
  created_at: "2026-11-01T10:00:00+00:00",
});

describe("dismissed notifications", () => {
  const day = 86400000;
  const now = Date.parse("2026-11-10T12:00:00Z");

  it("keeps a dismissed notification and lists the newest first", () => {
    const storage = memoryStorage();
    rememberDismissed([item("a")], storage, now - 1000);
    rememberDismissed([item("b")], storage, now);
    expect(loadDismissed(storage, now).map((n) => n.notification_id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("drops entries after 30 days and keeps those just inside", () => {
    const storage = memoryStorage();
    rememberDismissed([item("old")], storage, now - DISMISSED_KEEP_DAYS * day);
    rememberDismissed(
      [item("recent")],
      storage,
      now - (DISMISSED_KEEP_DAYS - 1) * day
    );
    expect(loadDismissed(storage, now).map((n) => n.notification_id)).toEqual([
      "recent",
    ]);
  });

  it("does not keep the same id twice, forgets one or all, ignores bad data", () => {
    const storage = memoryStorage();
    rememberDismissed([item("a")], storage, now - 5);
    rememberDismissed([item("a"), item("b")], storage, now);
    expect(loadDismissed(storage, now)).toHaveLength(2);
    expect(
      forgetDismissed("a", storage, now).map((n) => n.notification_id)
    ).toEqual(["b"]);
    expect(forgetDismissed(undefined, storage, now)).toEqual([]);
    storage.setItem("ha-dismissed-notifications", "{not json");
    expect(loadDismissed(storage, now)).toEqual([]);
  });
});
