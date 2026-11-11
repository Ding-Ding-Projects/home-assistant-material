import { describe, expect, it } from "vitest";
import {
  DISMISSED_KEEP_DAYS,
  forgetDismissed,
  loadDismissed,
  rememberDismissed,
} from "../../../src/panels/config/notifications/dismissed-notifications";
import {
  hasDotSegments,
  notificationActions,
} from "../../../src/panels/config/notifications/notification-insight";

// Protects the notification centre: a link must never become a script address,
// and a dismissed notification must be kept for exactly 30 days.

describe("notificationActions addresses", () => {
  it("drops addresses a browser could read as another site", () => {
    expect(
      notificationActions("[A](/\\host) [B](/a\\b) [C](/ok/path?x=1#y)")
    ).toEqual([{ label: "C", href: "/ok/path?x=1#y", host: "" }]);
  });

  it("does not turn an image into a button", () => {
    expect(notificationActions("![Chart](/x) [Open](/y)")).toEqual([
      { label: "Open", href: "/y", host: "" },
    ]);
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
      { label: "Open", href: "/config/integrations", host: "" },
      { label: "Docs", href: "https://example.com/a", host: "example.com" },
    ]);
  });
});

describe("notificationActions hosts and paths", () => {
  it("names the host of an outside link and not of an inside one", () => {
    expect(
      notificationActions("[Docs](https://Docs.Example.com/a) [In](/x)").map(
        (action) => action.host
      )
    ).toEqual(["docs.example.com", ""]);
  });

  it.each(["/a/../b", "/..", "/a/%2e%2e/b", "/a/.%2E/b", "/../x?y=1"])(
    "rejects the app path %j with a dot segment",
    (path) => {
      expect(notificationActions(`[X](${path})`)).toEqual([]);
      expect(hasDotSegments(path)).toBe(true);
    }
  );

  it("keeps a path whose query only contains dots", () => {
    expect(hasDotSegments("/a/b?x=../y")).toBe(false);
    expect(hasDotSegments("/a/file..txt")).toBe(false);
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
