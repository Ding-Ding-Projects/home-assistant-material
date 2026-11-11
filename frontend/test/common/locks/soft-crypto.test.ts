/* eslint-disable no-await-in-loop */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  softDigest,
  softHmac,
  softPbkdf2,
} from "../../../src/common/locks/soft-crypto";
import {
  checkFactor,
  createLockRecord,
  hotp,
} from "../../../src/common/locks/lock-credentials";

// A lock made on a plain http page (no crypto.subtle) must open on an https
// page and the other way round, so the script versions have to give exactly
// the browser's answers. Creating a lock on plain http used to fail outright.

const bytes = (text: string) => new TextEncoder().encode(text);
const hex = (data: Uint8Array) =>
  Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");

const INPUTS = [
  "",
  "abc",
  "a".repeat(55),
  "a".repeat(56),
  "a".repeat(63),
  "a".repeat(64),
  "a".repeat(65),
  "Pack my box with five dozen liquor jugs".repeat(9),
];

describe("soft crypto matches the browser's implementation", () => {
  it.each(["SHA-1", "SHA-256"] as const)("%s digest", async (hash) => {
    for (const input of INPUTS) {
      const native = new Uint8Array(
        await crypto.subtle.digest(hash, bytes(input))
      );
      expect(hex(softDigest(hash, bytes(input)))).toBe(hex(native));
    }
  });

  it("known SHA-256 answer", () => {
    expect(hex(softDigest("SHA-256", bytes("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it.each(["SHA-1", "SHA-256"] as const)("%s HMAC", async (hash) => {
    for (const keyText of ["k", "key".repeat(30), "x".repeat(64)]) {
      for (const input of INPUTS) {
        const key = await crypto.subtle.importKey(
          "raw",
          bytes(keyText),
          { name: "HMAC", hash },
          false,
          ["sign"]
        );
        const native = new Uint8Array(
          await crypto.subtle.sign("HMAC", key, bytes(input))
        );
        expect(hex(softHmac(hash, bytes(keyText), bytes(input)))).toBe(
          hex(native)
        );
      }
    }
  });

  it("PBKDF2", async () => {
    const salt = Uint8Array.from({ length: 16 }, (_v, i) => i * 7);
    for (const rounds of [1, 2, 1000]) {
      const key = await crypto.subtle.importKey(
        "raw",
        bytes("1234"),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const native = new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
          key,
          256
        )
      );
      expect(
        hex(await softPbkdf2("SHA-256", bytes("1234"), salt, rounds, 32))
      ).toBe(hex(native));
    }
  });
});

describe("locks on a page without crypto.subtle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const withoutSubtle = () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
      subtle: undefined,
    });
  };

  const input = {
    key: "page:test",
    label: "Test",
    policy: "pin" as const,
    duration: { kind: "surface" as const },
    pin: "4821",
  };

  it("creates a lock and checks its PIN", async () => {
    withoutSubtle();
    const record = await createLockRecord(input, 1000);
    expect(record.pin?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await checkFactor(record, "pin", "4821", 2000)).outcome).toBe("ok");
    expect((await checkFactor(record, "pin", "0000", 2000)).outcome).toBe(
      "wrong"
    );
  }, 60000);

  it("a lock made without crypto.subtle opens with it, and the reverse", async () => {
    withoutSubtle();
    const soft = await createLockRecord(input, 1000);
    vi.unstubAllGlobals();
    expect((await checkFactor(soft, "pin", "4821", 2000)).outcome).toBe("ok");

    const native = await createLockRecord(input, 1000);
    withoutSubtle();
    expect((await checkFactor(native, "pin", "4821", 2000)).outcome).toBe("ok");
  }, 60000);

  it("gives the same one-time code", async () => {
    const key = bytes("12345678901234567890");
    const native = await hotp(key, 1);
    withoutSubtle();
    expect(await hotp(key, 1)).toBe(native);
    // RFC 4226 test value for counter 1
    expect(native).toBe("287082");
  });
});
