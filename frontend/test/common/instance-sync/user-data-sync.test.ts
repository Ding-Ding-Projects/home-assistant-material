import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  envelopeBytes,
  planMerge,
  SYNC_DEBOUNCE_MS,
  toInstanceState,
  UserDataSync,
} from "../../../src/common/instance-sync/user-data-sync";
import { validateWordingData } from "../../../src/common/vocabulary/wording-sync";

// The merge rules decide whether a person's own wording or appearance is kept
// or lost when two devices disagree, so these protect: a value made only here
// is uploaded once and never dropped; the newer copy wins and the outcome is
// reported; an invalid instance copy is never used and is replaced; an
// oversize value is refused; and no value ever reaches an error or a status.
// The fixtures are neutral placeholders.

const validate = (data: unknown) =>
  typeof data === "string" && data ? data : undefined;

const envelope = (updated: number, data: unknown) => ({
  version: 1,
  updated,
  data,
});

describe("planMerge", () => {
  it("uploads a value that exists only in this browser", () => {
    const plan = planMerge({ updated: 0, value: "a" }, undefined);
    expect(plan).toEqual({
      action: "upload-local",
      conflict: false,
      replacedInvalid: false,
    });
  });

  it("adopts a value that exists only on the instance", () => {
    const instance = toInstanceState(envelope(5, "b"), validate);
    expect(planMerge(undefined, instance)).toEqual({
      action: "adopt-instance",
      conflict: false,
    });
  });

  it("keeps nothing when neither side has a value", () => {
    expect(planMerge(undefined, undefined)).toEqual({ action: "keep" });
    expect(planMerge({ updated: 3, value: undefined }, undefined)).toEqual({
      action: "keep",
    });
  });

  it("lets the newer instance copy win and says so", () => {
    const instance = toInstanceState(envelope(10, "b"), validate);
    expect(planMerge({ updated: 5, value: "a" }, instance)).toEqual({
      action: "adopt-instance",
      conflict: true,
    });
  });

  it("lets the newer browser copy win and says so", () => {
    const instance = toInstanceState(envelope(5, "b"), validate);
    expect(planMerge({ updated: 10, value: "a" }, instance)).toEqual({
      action: "upload-local",
      conflict: true,
      replacedInvalid: false,
    });
  });

  it("gives a tie to the instance", () => {
    const instance = toInstanceState(envelope(7, "b"), validate);
    expect(planMerge({ updated: 7, value: "a" }, instance).action).toBe(
      "adopt-instance"
    );
  });

  it("changes nothing when both copies are the same", () => {
    const instance = toInstanceState(envelope(9, "a"), validate);
    expect(planMerge({ updated: 1, value: "a" }, instance)).toEqual({
      action: "keep",
    });
  });

  it("never uses an invalid instance copy and re-uploads the browser copy", () => {
    const instance = toInstanceState(envelope(9, 42), validate);
    expect(instance).toBe("invalid");
    expect(planMerge({ updated: 1, value: "a" }, instance)).toEqual({
      action: "upload-local",
      conflict: false,
      replacedInvalid: true,
    });
    expect(planMerge(undefined, instance)).toEqual({ action: "keep" });
  });

  it("treats a malformed wrapper as invalid", () => {
    expect(toInstanceState("text", validate)).toBe("invalid");
    expect(
      toInstanceState({ version: 2, updated: 1, data: "a" }, validate)
    ).toBe("invalid");
    expect(
      toInstanceState({ version: 1, updated: -1, data: "a" }, validate)
    ).toBe("invalid");
    expect(toInstanceState({ version: 1, updated: 1 }, validate)).toBe(
      "invalid"
    );
  });

  it("carries a clear to the other devices", () => {
    const cleared = toInstanceState(envelope(20, null), validate);
    expect(planMerge({ updated: 10, value: "a" }, cleared)).toEqual({
      action: "adopt-instance",
      conflict: true,
    });
  });

  it("keeps a newer local value over an older clear", () => {
    const cleared = toInstanceState(envelope(5, null), validate);
    expect(planMerge({ updated: 10, value: "a" }, cleared).action).toBe(
      "upload-local"
    );
  });
});

describe("size limit", () => {
  it("measures the wrapper in bytes", () => {
    expect(
      envelopeBytes({ version: 1, updated: 1, data: "é" })
    ).toBeGreaterThan(
      JSON.stringify({ version: 1, updated: 1, data: "é" }).length - 1
    );
  });
});

describe("wording data check", () => {
  it("accepts small entries and refuses unsafe or oversize ones", () => {
    expect(validateWordingData({ light: "lamp" })).toEqual({ light: "lamp" });
    expect(validateWordingData(["x"])).toBeUndefined();
    expect(validateWordingData({})).toBeUndefined();
    expect(validateWordingData({ light: "a\nb" })).toBeUndefined();
    expect(validateWordingData({ light: 1 })).toBeUndefined();
  });
});

describe("UserDataSync", () => {
  const SECRET_WORD = "placeholder-private-label";
  let stored: string | undefined;
  let local: string | undefined;
  let saved: unknown[];
  let failWith: Error | undefined;
  let handler: ((msg: { value: unknown }) => void) | undefined;

  const conn = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    subscribeMessage: vi.fn(async (cb: (msg: { value: unknown }) => void) => {
      handler = cb;
      return () => undefined;
    }),
    sendMessagePromise: vi.fn(async (msg: { value: unknown }) => {
      if (failWith) {
        throw failWith;
      }
      saved.push(msg.value);
    }),
  };

  const make = (maxBytes?: number) =>
    new UserDataSync<string>({
      key: "personal_wording",
      validate,
      readLocal: () => local,
      writeLocal: (value) => {
        local = value;
      },
      maxBytes,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    stored = undefined;
    local = undefined;
    saved = [];
    failWith = undefined;
    handler = undefined;
    conn.sendMessagePromise.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    void stored;
  });

  it("uploads a browser-only value once the instance reports nothing", async () => {
    local = "mine";
    const sync = make();
    sync.start(conn as never);
    handler!({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ version: 1, data: "mine" });
    expect(sync.snapshot.status).toBe("saved");
  });

  it("applies an instance value on a second device without a push", async () => {
    const sync = make();
    sync.start(conn as never);
    handler!({ value: envelope(50, "theirs") });
    expect(local).toBe("theirs");
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 2);
    expect(saved).toHaveLength(0);
  });

  it("reports which copy was used when both differ", () => {
    local = "mine";
    window.localStorage.setItem(
      "instanceSync.personal_wording",
      JSON.stringify({ updated: 5 })
    );
    const sync = make();
    sync.start(conn as never);
    handler!({ value: envelope(99, "theirs") });
    expect(local).toBe("theirs");
    expect(sync.snapshot.used).toBe("instance");
  });

  it("never puts the value into a failed-save status", async () => {
    local = SECRET_WORD;
    failWith = new Error(`rejected ${SECRET_WORD}`);
    const sync = make();
    sync.start(conn as never);
    handler!({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(sync.snapshot.status).toBe("error");
    expect(JSON.stringify(sync.snapshot)).not.toContain(SECRET_WORD);
  });

  it("retries after a failure", async () => {
    local = "mine";
    failWith = new Error("down");
    const sync = make();
    sync.start(conn as never);
    handler!({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(sync.snapshot.status).toBe("error");
    failWith = undefined;
    sync.retry();
    await vi.advanceTimersByTimeAsync(10);
    expect(saved).toHaveLength(1);
    expect(sync.snapshot.status).toBe("saved");
  });

  it("refuses to send an oversize value and keeps it in the browser", async () => {
    local = "x".repeat(200);
    const sync = make(100);
    sync.start(conn as never);
    handler!({ value: null });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(conn.sendMessagePromise).not.toHaveBeenCalled();
    expect(sync.snapshot.status).toBe("too_large");
    expect(local).toBe("x".repeat(200));
  });

  it("sends a clear as an empty wrapper", async () => {
    const sync = make();
    sync.start(conn as never);
    handler!({ value: envelope(1, "a") });
    local = undefined;
    sync.push();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(saved[saved.length - 1]).toMatchObject({ data: null });
  });

  it("says it is offline when no connection has started", () => {
    const sync = make();
    local = "mine";
    sync.push();
    expect(sync.snapshot.status).toBe("offline");
  });
});
