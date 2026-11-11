import { describe, expect, it } from "vitest";
import { normalizeLockStore } from "../../../src/common/locks/element-locks";
import {
  clampBlockedUntil,
  MAX_PBKDF2_ROUNDS,
  normalizeLockRecord,
} from "../../../src/common/locks/lock-credentials";
import { MAX_LOCK_WAIT_MS } from "../../../src/common/locks/lock-wait";

// Lock records are now saved on the instance and read back on every device, so
// what comes back is input. These protect two promises: a stored wait is never
// longer than the longest wait the code itself sets (a wrong copy or a fast
// clock cannot block an unlock for days), and a stored lock cannot ask for so
// many hashing rounds that checking it freezes the page.

const secret = (rounds: number) => ({
  salt: "a".repeat(32),
  hash: "b".repeat(64),
  rounds,
});

const stored = (extra: Record<string, unknown>) => ({
  key: "page:/x",
  label: "x",
  policy: "pin",
  pin: secret(150000),
  duration: { kind: "surface" },
  failures: 1,
  blockedUntil: 0,
  created: 1,
  ...extra,
});

describe("stored wait times", () => {
  it("clamps a far-future time to the longest wait", () => {
    const now = 1_700_000_000_000;
    expect(clampBlockedUntil(now + 10 * 24 * 3600 * 1000, now)).toBe(
      now + MAX_LOCK_WAIT_MS
    );
    expect(clampBlockedUntil(now + 1000, now)).toBe(now + 1000);
    expect(clampBlockedUntil(-5, now)).toBe(0);
    expect(clampBlockedUntil("soon", now)).toBe(0);
    expect(clampBlockedUntil(Number.POSITIVE_INFINITY, now)).toBe(0);
  });

  it("clamps the wait of a lock record and of the whole store", () => {
    const far = Date.now() + 10 * 24 * 3600 * 1000;
    const record = normalizeLockRecord(stored({ blockedUntil: far }))!;
    expect(record.blockedUntil).toBeLessThanOrEqual(
      Date.now() + MAX_LOCK_WAIT_MS
    );
    expect(record.blockedUntil).toBeGreaterThan(0);
    const store = normalizeLockStore({ locked: ["a"], blockedUntil: far });
    expect(store.blockedUntil).toBeLessThanOrEqual(
      Date.now() + MAX_LOCK_WAIT_MS
    );
  });
});

describe("stored hashing rounds", () => {
  it("accepts a sane count and refuses one that is too high or too low", () => {
    expect(
      normalizeLockRecord(stored({ pin: secret(150000) }))?.pin
    ).toBeDefined();
    expect(
      normalizeLockRecord(stored({ pin: secret(MAX_PBKDF2_ROUNDS) }))?.pin
    ).toBeDefined();
    expect(
      normalizeLockRecord(stored({ pin: secret(MAX_PBKDF2_ROUNDS + 1) }))?.pin
    ).toBeUndefined();
    expect(
      normalizeLockRecord(stored({ pin: secret(5_000_000) }))?.pin
    ).toBeUndefined();
    expect(
      normalizeLockRecord(stored({ pin: secret(10) }))?.pin
    ).toBeUndefined();
  });
});
