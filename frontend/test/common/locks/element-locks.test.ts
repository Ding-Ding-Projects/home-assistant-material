import { describe, expect, it } from "vitest";
import {
  derivePin,
  emptyLockStore,
  isLocked,
  normalizeLockStore,
  pageLockKey,
  tryPin,
  waitForFailures,
  withLock,
  withPin,
} from "../../../src/common/locks/element-locks";
import { sha256, toHex } from "../../../src/common/util/sha256";

// Protects the lock: the hash it rests on, the waits after wrong PINs, and
// that stored data which was tampered with cannot unlock anything.

const text = (value: string) => new TextEncoder().encode(value);

describe("sha256", () => {
  it("matches the published test vectors", () => {
    expect(toHex(sha256(text("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(toHex(sha256(text("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(
      toHex(
        sha256(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
      )
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
});

describe("page locks", () => {
  it("uses the path without query or trailing slash", () => {
    expect(pageLockKey("/config/devices/?x=1#y")).toBe("page:/config/devices");
    expect(pageLockKey("/")).toBe("page:/");
  });

  it("locks and unlocks without duplicates", () => {
    let store = withLock(emptyLockStore(), "page:/a", true);
    store = withLock(store, "page:/a", true);
    expect(store.locked).toEqual(["page:/a"]);
    expect(isLocked(store, "page:/a")).toBe(true);
    expect(isLocked(withLock(store, "page:/a", false), "page:/a")).toBe(false);
  });
});

describe("the wait after wrong PINs", () => {
  it("grows from the third wrong PIN", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(waitForFailures)).toEqual([
      0, 0, 5000, 15000, 60000, 300000, 300000,
    ]);
  });
});

describe("tryPin", () => {
  const store = withPin(emptyLockStore(), "2468");

  it("stores a salted hash, never the PIN", () => {
    expect(JSON.stringify(store)).not.toContain("2468");
    expect(store.pin?.hash).toBe(derivePin("2468", store.pin!.salt));
    expect(withPin(emptyLockStore(), "2468").pin?.hash).not.toBe(
      store.pin?.hash
    );
  });

  it("accepts the right PIN and clears the count", () => {
    const failed = tryPin(store, "0000", 1000).store;
    const result = tryPin(failed, "2468", 2000);
    expect(result.outcome).toBe("ok");
    expect(result.store.failures).toBe(0);
  });

  it("makes the third wrong PIN wait, and refuses tries while waiting", () => {
    let current = store;
    current = tryPin(current, "1111", 1000).store;
    current = tryPin(current, "1111", 1000).store;
    const third = tryPin(current, "1111", 1000);
    expect(third.outcome).toBe("wrong");
    expect(third.waitMs).toBe(5000);
    const early = tryPin(third.store, "2468", 3000);
    expect(early.outcome).toBe("wait");
    expect(early.waitMs).toBe(3000);
    expect(tryPin(third.store, "2468", 6001).outcome).toBe("ok");
  });

  it("removes the PIN", () => {
    expect(withPin(store, undefined).pin).toBeUndefined();
  });
});

describe("normalizeLockStore", () => {
  it("drops anything unexpected", () => {
    expect(
      normalizeLockStore({
        locked: ["page:/a", 5, "", "page:/a"],
        pin: { salt: "zz", hash: "nope" },
        failures: -3,
        blockedUntil: "soon",
      })
    ).toEqual({ locked: ["page:/a"], failures: 0, blockedUntil: 0 });
    expect(normalizeLockStore("locked")).toEqual(emptyLockStore());
  });
});
