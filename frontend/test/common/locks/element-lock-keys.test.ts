import { describe, expect, it } from "vitest";
import {
  elementLockKey,
  emptyLockStore,
  lockedElementPaths,
  withLock,
} from "../../../src/common/locks/element-locks";

// Protects locks on single elements: a lock belongs to one page, and the
// lock of a page is not mistaken for the lock of an element on it.

describe("element locks", () => {
  it("lists the elements locked on a page and on no other", () => {
    let store = emptyLockStore();
    store = withLock(store, elementLockKey("/config/devices/", "/a>b:2"), true);
    store = withLock(store, elementLockKey("/config/devices", "/a>c"), true);
    store = withLock(store, elementLockKey("/config/entities", "/a>b:2"), true);
    store = withLock(store, "page:/config/devices", true);
    expect(lockedElementPaths(store, "/config/devices?x=1")).toEqual([
      "/a>b:2",
      "/a>c",
    ]);
    expect(lockedElementPaths(store, "/config")).toEqual([]);
  });

  it("unlocks one element and leaves the rest", () => {
    let store = withLock(emptyLockStore(), elementLockKey("/p", "/a"), true);
    store = withLock(store, elementLockKey("/p", "/b"), true);
    store = withLock(store, elementLockKey("/p", "/a"), false);
    expect(lockedElementPaths(store, "/p")).toEqual(["/b"]);
  });
});
