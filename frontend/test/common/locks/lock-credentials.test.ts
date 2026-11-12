/* eslint-disable no-await-in-loop -- each step depends on the last */
import { describe, expect, it } from "vitest";
import {
  emptyLockStore,
  normalizeLockStore,
  withLock,
  withLockRecord,
  withUpdatedRecord,
} from "../../../src/common/locks/element-locks";
import type { LockPolicy } from "../../../src/common/locks/lock-credentials";
import {
  base32Decode,
  base32Encode,
  checkAll,
  checkFactor,
  createLockRecord,
  EITHER_POLICIES,
  finishAttempt,
  LOCK_POLICIES,
  nfcTagIdentity,
  POLICY_FACTORS,
  totpAt,
  totpMatches,
} from "../../../src/common/locks/lock-credentials";

// Protects the per-lock credentials: that each of the seven policies asks for
// exactly its factors, that nothing readable is stored, that one-time codes
// follow RFC 6238, that every factor spends one shared attempt budget and
// that one lock never answers for another.

const NOW = 1_700_000_000_000;
const duration = { kind: "surface" } as const;
// "12345678901234567890", the secret of the RFC 6238 test vectors.
const RFC_KEY = new TextEncoder().encode("12345678901234567890");
const RFC_SECRET = base32Encode(RFC_KEY);

const make = (key: string, policy: LockPolicy, extra = {}) =>
  createLockRecord(
    {
      key,
      label: key,
      policy,
      duration,
      pin: "2468",
      password: "correct horse",
      totpSecret: RFC_SECRET,
      nfcTag: TAG,
      ...extra,
    },
    NOW
  );

const TAG = nfcTagIdentity("serial", "04:A1:B2:C3");

/** Policies that ask for every factor, one after another. */
const ALL_OF = LOCK_POLICIES.filter((policy) => !EITHER_POLICIES.has(policy));

const code = async (secret: string, time: number) =>
  totpAt(base32Decode(secret)!, time);

describe("the seven policies", () => {
  it("ask for exactly their factors, in order", () => {
    expect(LOCK_POLICIES).toHaveLength(7);
    expect(POLICY_FACTORS).toEqual({
      pin: ["pin"],
      password: ["password"],
      pin_password: ["pin", "password"],
      password_totp: ["password", "totp"],
      pin_totp: ["pin", "totp"],
      password_pin_totp: ["password", "pin", "totp"],
      password_nfc: ["password", "nfc"],
    });
  });

  it.each(LOCK_POLICIES)(
    "%s keeps only its own credentials",
    async (policy) => {
      const record = await make(`element:/#${policy}`, policy);
      const factors = POLICY_FACTORS[policy];
      expect(!!record.pin).toBe(factors.includes("pin"));
      expect(!!record.password).toBe(factors.includes("password"));
      expect(!!record.totp).toBe(factors.includes("totp"));
      expect(!!record.nfc).toBe(factors.includes("nfc"));
    }
  );

  it.each(ALL_OF)("%s unlocks only with every factor", async (policy) => {
    const record = await make("element:/#a", policy);
    const factors = POLICY_FACTORS[policy];
    const right = {
      pin: "2468",
      password: "correct horse",
      totp: await code(RFC_SECRET, NOW),
    };
    expect((await checkAll(record, right, NOW)).outcome).toBe("ok");
    for (const factor of factors) {
      const wrong = {
        ...right,
        [factor]: factor === "totp" ? "000000" : "9999x",
      };
      const result = await checkAll(record, wrong, NOW);
      expect(result.outcome).toBe("wrong");
    }
  });

  it("opens an NFC lock with the tag alone or the password alone", async () => {
    const record = await make("element:/#nfc", "password_nfc");
    expect(record.nfc?.hash).not.toContain("04:a1");
    expect((await checkAll(record, { nfc: TAG }, NOW)).outcome).toBe("ok");
    expect(
      (await checkAll(record, { password: "correct horse" }, NOW)).outcome
    ).toBe("ok");
    // The same tag read the other way is a different identity.
    expect(
      (
        await checkAll(
          record,
          { nfc: nfcTagIdentity("tag", "04:A1:B2:C3") },
          NOW
        )
      ).outcome
    ).toBe("wrong");
    expect(
      (await checkAll(record, { nfc: nfcTagIdentity("serial", "ff") }, NOW))
        .outcome
    ).toBe("wrong");
    expect((await checkAll(record, {}, NOW)).outcome).toBe("wrong");
  });

  it("will not make an NFC lock without the backup password or a tag", async () => {
    await expect(
      make("k", "password_nfc", { password: undefined })
    ).rejects.toThrow();
    await expect(make("k", "password_nfc", { nfcTag: "" })).rejects.toThrow();
    await expect(
      make("k", "password_nfc", { nfcTag: "no prefix" })
    ).rejects.toThrow();
  });

  it("refuses a policy whose credential is missing", async () => {
    await expect(
      createLockRecord(
        {
          key: "k",
          label: "k",
          policy: "password_totp",
          duration,
          password: "abcd",
        },
        NOW
      )
    ).rejects.toThrow();
    await expect(make("k", "pin", { pin: "12" })).rejects.toThrow();
  });
});

describe("stored credentials", () => {
  it("are salted hashes, never the PIN or the password", async () => {
    const record = await make("element:/#a", "password_pin_totp");
    const text = JSON.stringify(record);
    expect(text).not.toContain("2468");
    expect(text).not.toContain("correct horse");
    expect(record.pin!.salt).not.toBe(record.password!.salt);
    const again = await make("element:/#a", "pin");
    expect(again.pin!.hash).not.toBe(record.pin!.hash);
  });

  it("survive storage, and a tampered record is dropped", async () => {
    const record = await make("element:/#a", "pin_password");
    const store = withLockRecord(emptyLockStore(), record);
    const back = normalizeLockStore(JSON.parse(JSON.stringify(store)));
    expect(back.records?.["element:/#a"]?.pin).toEqual(record.pin);
    const broken = JSON.parse(JSON.stringify(store));
    delete broken.records["element:/#a"].password;
    expect(normalizeLockStore(broken).records).toBeUndefined();
  });
});

describe("one-time codes (RFC 6238)", () => {
  it("match the published SHA-1 test vectors", async () => {
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ];
    for (const [seconds, expected] of vectors) {
      expect(await totpAt(RFC_KEY, seconds * 1000, 8)).toBe(expected);
    }
  });

  it("round-trips base32", () => {
    expect(Array.from(base32Decode(RFC_SECRET)!)).toEqual(Array.from(RFC_KEY));
    expect(base32Decode("not base32!")).toBeUndefined();
  });

  it("accepts one step either side and nothing beyond", async () => {
    const at = 59_000;
    const current = "287082";
    expect(await totpMatches(RFC_SECRET, current, at)).toBe(true);
    expect(await totpMatches(RFC_SECRET, current, at + 30_000)).toBe(true);
    expect(await totpMatches(RFC_SECRET, current, at - 30_000)).toBe(true);
    expect(await totpMatches(RFC_SECRET, current, at + 90_000)).toBe(false);
    expect(await totpMatches(RFC_SECRET, "28708", at)).toBe(false);
  });
});

describe("the shared attempt budget", () => {
  it("is spent by every factor and makes the third miss wait", async () => {
    let record = await make("element:/#a", "password_pin_totp");
    record = (await checkFactor(record, "password", "nope", NOW)).record;
    record = (await checkFactor(record, "pin", "0000", NOW)).record;
    expect(record.failures).toBe(2);
    const third = await checkFactor(record, "totp", "000000", NOW);
    expect(third.outcome).toBe("wrong");
    expect(third.waitMs).toBe(5000);
    const early = await checkFactor(third.record, "pin", "2468", NOW + 1000);
    expect(early.outcome).toBe("wait");
    const later = await checkFactor(third.record, "pin", "2468", NOW + 6000);
    expect(later.outcome).toBe("ok");
    expect(finishAttempt(later.record).failures).toBe(0);
  });

  it("is the same for a PIN from the keypad and from the field", async () => {
    // Both routes end in checkFactor with a digit string.
    const record = await make("element:/#a", "pin");
    const wrong = await checkFactor(record, "pin", "1111", NOW);
    const again = await checkFactor(wrong.record, "pin", "2222", NOW);
    expect(again.record.failures).toBe(2);
  });

  it("does not let a factor outside the policy through", async () => {
    const record = await make("element:/#a", "pin");
    const result = await checkFactor(record, "password", "correct horse", NOW);
    expect(result.outcome).toBe("wrong");
  });
});

describe("one lock never answers for another", () => {
  it("keeps its own credentials and its own budget", async () => {
    const a = await make("element:/#a", "pin", { pin: "1111" });
    const b = await make("element:/#b", "pin", { pin: "2222" });
    let store = withLockRecord(withLockRecord(emptyLockStore(), a), b);
    expect((await checkFactor(a, "pin", "2222", NOW)).outcome).toBe("wrong");
    expect((await checkFactor(b, "pin", "1111", NOW)).outcome).toBe("wrong");
    const missed = await checkFactor(a, "pin", "0000", NOW);
    store = withUpdatedRecord(store, missed.record);
    expect(store.records!["element:/#a"].failures).toBe(1);
    expect(store.records!["element:/#b"].failures).toBe(0);
  });

  it("removes a lock together with its credentials, and only that lock", async () => {
    const a = await make("element:/#a", "pin");
    const b = await make("element:/#b", "password");
    const store = withLockRecord(withLockRecord(emptyLockStore(), a), b);
    const after = withLock(store, "element:/#a", false);
    expect(after.locked).toEqual(["element:/#b"]);
    expect(Object.keys(after.records!)).toEqual(["element:/#b"]);
  });
});
