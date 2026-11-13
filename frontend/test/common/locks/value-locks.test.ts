import { describe, expect, it } from "vitest";
import {
  elementLockKey,
  emptyLockStore,
  lockedElementPaths,
  withLock,
} from "../../../src/common/locks/element-locks";
import {
  isValueLockKey,
  parseValueLockKey,
  valueLockKey,
} from "../../../src/common/locks/value-locks";

// Protects the key of a lock on one appearance value: it belongs to one page,
// one subject and one field, it can be read back, and it is never mistaken for
// the lock of an element.

describe("value lock keys", () => {
  const target = { page: "/config/devices/", subject: "/a>b:2", field: "zoom" };

  it("names the page, the field and the subject, and reads back", () => {
    const key = valueLockKey(target)!;
    expect(isValueLockKey(key)).toBe(true);
    expect(parseValueLockKey(key)).toEqual({
      page: "/config/devices",
      field: "zoom",
      subject: "/a>b:2",
    });
  });

  it("differs per field, subject and page", () => {
    const base = valueLockKey(target);
    expect(valueLockKey({ ...target, field: "opacity" })).not.toBe(base);
    expect(valueLockKey({ ...target, subject: "/a>c" })).not.toBe(base);
    expect(valueLockKey({ ...target, page: "/config" })).not.toBe(base);
  });

  it("is not the lock of an element on the same page", () => {
    let store = emptyLockStore();
    store = withLock(store, valueLockKey(target)!, true);
    store = withLock(store, elementLockKey("/config/devices", "/a>b:2"), true);
    expect(lockedElementPaths(store, "/config/devices")).toEqual(["/a>b:2"]);
  });

  it("offers no key when it would be too long", () => {
    expect(valueLockKey({ ...target, subject: "x".repeat(600) })).toBe(
      undefined
    );
  });

  it("ignores keys of another form", () => {
    expect(parseValueLockKey("page:/config")).toBe(undefined);
    expect(parseValueLockKey("value:/config")).toBe(undefined);
  });
});
