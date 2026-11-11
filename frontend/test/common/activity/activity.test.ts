import { describe, expect, it } from "vitest";
import {
  ACTIVITY_HISTORY_LIMIT,
  ActivityStore,
  activityPercent,
  sanitizeProgress,
} from "../../../src/common/activity/activity-store";
import {
  REDACTED,
  redactDetails,
} from "../../../src/common/activity/redact-details";

// Protects two promises: the activity list never shows a percentage that was
// not measured, and copied failure details never carry a credential.

describe("progress is only what was measured", () => {
  it("drops values that are not a real count", () => {
    expect(sanitizeProgress({ completed: 5, total: 0 })).toBeUndefined();
    expect(sanitizeProgress({ completed: NaN, total: 10 })).toBeUndefined();
    expect(sanitizeProgress({ completed: -1, total: 10 })).toBeUndefined();
    expect(sanitizeProgress({ completed: 1, total: Infinity })).toBeUndefined();
  });

  it("never reports more than the total", () => {
    expect(sanitizeProgress({ completed: 12, total: 10 })).toEqual({
      completed: 10,
      total: 10,
    });
  });

  it("gives no percentage while the total is unknown", () => {
    const store = new ActivityStore();
    const id = store.start({ title: "t" });
    expect(activityPercent(store.get(id)!)).toBeUndefined();
    store.update(id, { progress: { completed: 1, total: 4 } });
    expect(activityPercent(store.get(id)!)).toBe(25);
    store.update(id, { progress: { completed: 1, total: 0 } });
    expect(activityPercent(store.get(id)!)).toBeUndefined();
  });
});

describe("activity lifecycle", () => {
  it("finishes once and ignores later changes", () => {
    const store = new ActivityStore();
    const id = store.start({ title: "t", cancel: () => undefined });
    store.finish(id, "failed", { message: "first" });
    store.finish(id, "done", { message: "second" });
    store.update(id, { status: "late" });
    const item = store.get(id)!;
    expect(item.state).toBe("failed");
    expect(item.message).toBe("first");
    expect(item.cancel).toBeUndefined();
    expect(store.runningCount).toBe(0);
  });

  it("keeps a bounded history but never drops a running activity", () => {
    const store = new ActivityStore();
    const running = store.start({ title: "long" });
    for (let i = 0; i < ACTIVITY_HISTORY_LIMIT + 5; i++) {
      store.finish(store.start({ title: `n${i}` }), "done");
    }
    expect(store.get(running)?.state).toBe("running");
    expect(store.activities.length).toBe(ACTIVITY_HISTORY_LIMIT + 1);
  });

  it("tells a subscriber about each change", () => {
    const store = new ActivityStore();
    const seen: number[] = [];
    const unsub = store.subscribe((items) => seen.push(items.length));
    const id = store.start({ title: "t" });
    store.dismiss(id);
    unsub();
    store.start({ title: "after" });
    expect(seen).toEqual([0, 1, 0]);
  });
});

describe("redaction of copied details", () => {
  it("hides credentials in addresses", () => {
    expect(redactDetails("GET http://admin:hunter2@10.0.0.2:8123/x")).toBe(
      `GET http://${REDACTED}@10.0.0.2:8123/x`
    );
  });

  it("hides authorization headers and bearer tokens", () => {
    expect(redactDetails("Authorization: Bearer abcdefghijkl")).toBe(
      `Authorization: ${REDACTED}`
    );
    expect(redactDetails("sent Bearer abcdefghijkl.mnop")).toBe(
      `sent Bearer ${REDACTED}`
    );
  });

  it("hides values of secret-looking keys, in text and in query strings", () => {
    expect(redactDetails('{"api_key": "abc123"}')).toContain(REDACTED);
    expect(redactDetails('{"api_key": "abc123"}')).not.toContain("abc123");
    expect(redactDetails("url?access_token=zzz&page=2")).toBe(
      `url?access_token=${REDACTED}&page=2`
    );
  });

  it("hides signed tokens and long key-like strings", () => {
    const jwt = "eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl";
    expect(redactDetails(`token was ${jwt}`)).not.toContain("eyJ");
    expect(redactDetails("key a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6")).toContain(
      REDACTED
    );
  });

  it("leaves ordinary text alone", () => {
    const text = "Could not reach the registry: status 403 for llama3";
    expect(redactDetails(text)).toBe(text);
  });
});
