import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fitSettingsBundle,
  forgetSettingsWatch,
  getDroppedSettingKeys,
  SETTINGS_TIMES_KEY,
  settingsBundleSync,
  validateSettingsData,
} from "../../../src/common/instance-sync/settings-bundle";
import { startInstanceSync } from "../../../src/common/instance-sync/start-instance-sync";
import {
  forgetClaimedOwner,
  SYNC_OWNER_KEY,
} from "../../../src/common/instance-sync/sync-owner";
import {
  SYNC_DEBOUNCE_MS,
  SYNC_MAX_BYTES,
} from "../../../src/common/instance-sync/user-data-sync";

// The settings bundle copies a person's own settings to their account on the
// instance and back. These protect: the newer copy of a key wins and a key
// only one side holds is kept; a removal is not undone by an old copy; what
// the instance sends is checked and never reaches storage unless a rule names
// the key; sign-in tokens and the sync's own bookkeeping never leave; another
// account's cache is cleared, not shown or uploaded; a bundle that is too
// large leaves out its largest optional keys instead of failing; and one
// change made in one tab is sent once. Values are neutral placeholders.

const makeConn = () => {
  const handlers: Record<string, (msg: { value: unknown }) => void> = {};
  const saved: { key: string; value: any }[] = [];
  const conn = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    subscribeMessage: vi.fn(
      async (cb: (msg: { value: unknown }) => void, msg: { key: string }) => {
        handlers[msg.key] = cb;
        return () => undefined;
      }
    ),
    sendMessagePromise: vi.fn(async (msg: { key: string; value: unknown }) => {
      saved.push({ key: msg.key, value: msg.value });
    }),
  };
  const bundles = () =>
    saved
      .filter((item) => item.key === "settings_bundle")
      .map((item) => item.value);
  return { conn, handlers, saved, bundles };
};

const envelope = (updated: number, data: unknown) => ({
  version: 1,
  updated,
  data,
});

const SETTLE = SYNC_DEBOUNCE_MS * 3;

describe("validateSettingsData", () => {
  it("keeps only registered, well-formed entries", () => {
    const result = validateSettingsData({
      elementLocks: { v: '{"a":1}', t: 5 },
      hassTokens: { v: "{}", t: 5 },
      "instanceSync.owner": { v: "x", t: 5 },
      supportTickets: { v: "not json", t: 5 },
      pageTabsOrder: { v: 12, t: 5 },
      pageTabsClosed: { v: "[]", t: -1 },
      pageTabsPinned: { v: "[]", t: Number.NaN },
      regexLibrary: "nope",
      lockKeypadShuffle: { v: "true", t: 7 },
      localHistory: { v: null, t: 9 },
    });
    expect(Object.keys(result!).sort()).toEqual([
      "elementLocks",
      "localHistory",
      "lockKeypadShuffle",
    ]);
    expect(result!.localHistory).toEqual({ v: null, t: 9 });
  });

  it("is not fooled by prototype keys and does not pollute", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"v":"x","t":1},"constructor":{"v":"x","t":1},"prototype":{"v":"x","t":1},"elementLocks":{"v":"{}","t":1}}'
    );
    const result = validateSettingsData(hostile)!;
    expect(Object.keys(result)).toEqual(["elementLocks"]);
    expect(({} as Record<string, unknown>).v).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("refuses a huge value and a wrong top-level type", () => {
    expect(
      validateSettingsData({
        pageTabsOrder: { v: JSON.stringify("x".repeat(500000)), t: 1 },
      })
    ).toEqual({});
    expect(validateSettingsData([])).toBeUndefined();
    expect(validateSettingsData("text")).toBeUndefined();
    expect(validateSettingsData(5)).toBeUndefined();
  });

  it("does not trust a time far in the future", () => {
    const result = validateSettingsData({
      elementLocks: { v: "{}", t: Date.now() + 10 * 24 * 3600 * 1000 },
    })!;
    expect(result.elementLocks.t).toBeLessThanOrEqual(Date.now());
  });
});

describe("fitSettingsBundle", () => {
  it("leaves out bulky keys first, then the largest, and keeps removals", () => {
    const big = JSON.stringify("x".repeat(300000));
    const bundle = {
      localHistory: { v: big, t: 1 },
      regexLibrary: { v: JSON.stringify("y".repeat(200000)), t: 1 },
      elementLocks: { v: "{}", t: 1 },
      pageTabsOrder: { v: null, t: 3 },
    };
    const fit = fitSettingsBundle(bundle, 150000);
    expect(fit.dropped).toEqual(["localHistory", "regexLibrary"]);
    expect(Object.keys(fit.bundle).sort()).toEqual([
      "elementLocks",
      "pageTabsOrder",
    ]);
  });

  it("changes nothing when it fits", () => {
    const bundle = { elementLocks: { v: "{}", t: 1 } };
    const fit = fitSettingsBundle(bundle);
    expect(fit.bundle).toBe(bundle);
    expect(fit.dropped).toEqual([]);
  });
});

describe("the settings bundle sync", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    forgetSettingsWatch();
    forgetClaimedOwner();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("uploads settings that exist only in this browser once", async () => {
    window.localStorage.setItem("pageTabsPinned", '["a"]');
    window.localStorage.setItem("hassTokens", '{"access_token":"secret"}');
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE);
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(bundles()).toHaveLength(1);
    expect(Object.keys(bundles()[0].data)).toEqual(["pageTabsPinned"]);
    expect(JSON.stringify(bundles())).not.toContain("secret");
  });

  it("sends a change made in one tab once, and not a change from another tab", async () => {
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(bundles()).toHaveLength(0);

    window.localStorage.setItem("pageTabsPinned", '["a"]');
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(bundles()).toHaveLength(1);
    expect(bundles()[0].data.pageTabsPinned.v).toBe('["a"]');
    await vi.advanceTimersByTimeAsync(SETTLE * 3);
    expect(bundles()).toHaveLength(1);

    // Another tab wrote this one and tells this tab by the storage event;
    // that tab sends it, this one must not send it again.
    window.localStorage.setItem("pageTabsOrder", '["b"]');
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "pageTabsOrder",
        newValue: '["b"]',
        oldValue: null,
      })
    );
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(bundles()).toHaveLength(1);
  });

  it("puts a newer instance value in use and tells the features", async () => {
    window.localStorage.setItem("pageTabsPinned", '["old"]');
    const { conn, handlers } = makeConn();
    const events: string[] = [];
    const listener = (ev: StorageEvent) =>
      events.push(`${ev.key}=${ev.newValue}`);
    window.addEventListener("storage", listener);
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({
      value: envelope(Date.now() + 1000, {
        pageTabsPinned: { v: '["new"]', t: Date.now() + 1000 },
        pageTabsClosed: { v: '["gone"]', t: Date.now() + 1000 },
      }),
    });
    await vi.advanceTimersByTimeAsync(SETTLE);
    window.removeEventListener("storage", listener);
    expect(window.localStorage.getItem("pageTabsPinned")).toBe('["new"]');
    expect(window.localStorage.getItem("pageTabsClosed")).toBe('["gone"]');
    expect(events).toContain('pageTabsPinned=["new"]');
  });

  it("keeps a newer browser value, uploads it, and keeps keys only the instance holds", async () => {
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE);
    window.localStorage.setItem("pageTabsPinned", '["mine"]');
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    bundles().length = 0;

    handlers.settings_bundle({
      value: envelope(1, {
        pageTabsPinned: { v: '["theirs"]', t: 1 },
        pageTabsClosed: { v: '["only-there"]', t: 1 },
      }),
    });
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(window.localStorage.getItem("pageTabsPinned")).toBe('["mine"]');
    expect(window.localStorage.getItem("pageTabsClosed")).toBe(
      '["only-there"]'
    );
    const last = bundles()[bundles().length - 1];
    expect(last.data.pageTabsPinned.v).toBe('["mine"]');
    expect(last.data.pageTabsClosed.v).toBe('["only-there"]');
  });

  it("does not bring a removed setting back from an older copy", async () => {
    window.localStorage.setItem("pageTabsPinned", '["a"]');
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    window.localStorage.removeItem("pageTabsPinned");
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(bundles()[bundles().length - 1].data.pageTabsPinned).toEqual({
      v: null,
      t: expect.any(Number),
    });
    handlers.settings_bundle({
      value: envelope(1, { pageTabsPinned: { v: '["a"]', t: 1 } }),
    });
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(window.localStorage.getItem("pageTabsPinned")).toBeNull();
  });

  it("never lets the instance write a key that no rule names", async () => {
    window.localStorage.setItem("hassTokens", '{"mine":true}');
    const { conn, handlers } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({
      value: envelope(
        Date.now() + 1000,
        JSON.parse(
          JSON.stringify({
            hassTokens: { v: '{"stolen":true}', t: Date.now() + 1000 },
            "instanceSync.owner": { v: "someone-else", t: Date.now() + 1000 },
            elementAppearance: { v: "{}", t: Date.now() + 1000 },
            supportTickets: { v: "{{{", t: Date.now() + 1000 },
            pageTabsClosed: { v: 7, t: Date.now() + 1000 },
          })
        )
      ),
    });
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(window.localStorage.getItem("hassTokens")).toBe('{"mine":true}');
    expect(window.localStorage.getItem("instanceSync.owner")).toBeNull();
    expect(window.localStorage.getItem("elementAppearance")).toBeNull();
    expect(window.localStorage.getItem("supportTickets")).toBeNull();
    expect(window.localStorage.getItem("pageTabsClosed")).toBeNull();
  });

  it("leaves large optional keys in the browser and says which", async () => {
    const chunk = JSON.stringify("x".repeat(380000));
    window.localStorage.setItem("localHistory", chunk);
    window.localStorage.setItem("regexLibrary", chunk);
    window.localStorage.setItem("supportTickets", chunk);
    window.localStorage.setItem("elementLocks", '{"small":true}');
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    const sent = bundles();
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0]).length).toBeLessThan(SYNC_MAX_BYTES);
    expect(sent[0].data.localHistory).toBeUndefined();
    expect(sent[0].data.elementLocks).toBeDefined();
    expect(getDroppedSettingKeys()).toContain("localHistory");
    // Nothing was removed from the browser.
    expect(window.localStorage.getItem("localHistory")).toBe(chunk);
  });
});

describe("another account on the same browser", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    forgetSettingsWatch();
    forgetClaimedOwner();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("clears mirrored settings, keeps the sign-in, and uploads nothing of the first account", async () => {
    window.localStorage.setItem(SYNC_OWNER_KEY, "user-a");
    window.localStorage.setItem("elementLocks", '{"locks":["a"]}');
    window.localStorage.setItem("pageTabsPinned", '["a"]');
    window.localStorage.setItem("hassTokens", '{"access_token":"kept"}');
    window.localStorage.setItem(SETTINGS_TIMES_KEY, "{}");
    window.localStorage.setItem(
      "instanceSync.settings_bundle",
      JSON.stringify({ updated: 5 })
    );
    const { conn, handlers, saved } = makeConn();
    stop = startInstanceSync(conn as never, "user-b");
    handlers.settings_bundle({ value: null });
    handlers.personal_wording({ value: null });
    handlers.appearance({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE * 3);
    expect(saved).toEqual([]);
    expect(window.localStorage.getItem("elementLocks")).toBeNull();
    expect(window.localStorage.getItem("pageTabsPinned")).toBeNull();
    expect(window.localStorage.getItem(SETTINGS_TIMES_KEY)).toBeNull();
    expect(window.localStorage.getItem("hassTokens")).toBe(
      '{"access_token":"kept"}'
    );
    expect(window.localStorage.getItem(SYNC_OWNER_KEY)).toBe("user-b");
  });

  it("restores locks on a browser whose data was cleared", async () => {
    const { conn, handlers } = makeConn();
    stop = startInstanceSync(conn as never, "user-a");
    handlers.settings_bundle({
      value: envelope(Date.now(), {
        elementLocks: { v: '{"locks":["a"]}', t: Date.now() },
      }),
    });
    await vi.advanceTimersByTimeAsync(SETTLE);
    expect(window.localStorage.getItem("elementLocks")).toBe('{"locks":["a"]}');
  });
});

describe("upload loops and removal notices", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    forgetSettingsWatch();
    forgetClaimedOwner();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("does not upload again for a key that can never be in the bundle", async () => {
    window.localStorage.setItem("pageTabsPinned", '["a"]');
    window.localStorage.setItem("pageTabsOrder", "plain text not json");
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(bundles()).toHaveLength(1);
    expect(Object.keys(bundles()[0].data)).toEqual(["pageTabsPinned"]);
    for (let i = 0; i < 3; i++) {
      handlers.settings_bundle({ value: bundles()[0] });
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(SETTLE * 2);
    }
    expect(bundles()).toHaveLength(1);
  });

  it("removes a lock on a device that still holds it, from exactly the removal notice, without uploading it back", async () => {
    window.localStorage.setItem("elementLocks", '{"locked":["a"]}');
    const { conn, handlers, bundles } = makeConn();
    stop = settingsBundleSync.start(conn as never);
    handlers.settings_bundle({ value: null });
    await vi.advanceTimersByTimeAsync(SETTLE * 2);
    expect(bundles()).toHaveLength(1);
    const notice = JSON.parse(
      `{"v": null, "t": ${Date.now() + 60000}}`
    ) as unknown;
    const data = { ...bundles()[0].data, elementLocks: notice };
    handlers.settings_bundle({ value: envelope(Date.now() + 60000, data) });
    await vi.advanceTimersByTimeAsync(SETTLE * 3);
    expect(window.localStorage.getItem("elementLocks")).toBeNull();
    expect(bundles()).toHaveLength(1);
  });
});
