import { describe, expect, it } from "vitest";
import { parseSshKeysInfo } from "../../../../src/data/hassio/ssh-keys";
import {
  checkKeyInput,
  describeKeys,
  fingerprintOf,
  parsePublicKey,
  toPathFingerprint,
} from "../../../../src/panels/config/ssh-access/ssh-access";

// Protects the SSH access page: the fingerprints are the ones OpenSSH prints
// (the Supervisor matches keys to remove by them), a private key is refused
// before anything is sent, and a line only counts as an error once it can no
// longer become a key.

const ED25519 =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDXD8u9KB94/l1YukYflKOsO7KzoSEQD4dNNlWY9zaQP test@example.com";
const ED25519_FP = "SHA256:XtqCfiQl+C/yppPd4+0+mdScwPJe3sqxe1TozjBSA20";
const ECDSA =
  "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBIOixE/C4G8nvrwWVvN6ru4PFCKt7Ktq5otWPgLSZFII2iwhMVEcxkBJLDLoi08D0SAZMuJphT9BW9ItvBzFgNM= second@example";
const ECDSA_FP = "SHA256:uqOm7IdgiJrNcZ5UzDzboIQmCOkT1yVarnj8XzzAqlc";

describe("parsePublicKey", () => {
  it("reads the type and comment", () => {
    expect(parsePublicKey(ED25519)).toMatchObject({
      type: "ED25519",
      comment: "test@example.com",
    });
    expect(parsePublicKey(ECDSA)).toMatchObject({
      type: "ECDSA",
      comment: "second@example",
    });
  });

  it("reads the bit length of an RSA key from its modulus", () => {
    const part = (bytes: number[]) => [
      0,
      0,
      Math.floor(bytes.length / 256),
      bytes.length % 256,
      ...bytes,
    ];
    const name = [...new TextEncoder().encode("ssh-rsa")];
    // A 2048 bit modulus has a leading zero byte in the encoding.
    const modulus = [0, 0x80, ...new Array(255).fill(1)];
    const body = new Uint8Array([
      ...part(name),
      ...part([1, 0, 1]),
      ...part(modulus),
    ]);
    const line = `ssh-rsa ${btoa(String.fromCharCode(...body))} rsa@example`;
    expect(parsePublicKey(line)?.type).toBe("RSA 2048");
  });

  it("refuses text that is not a key", () => {
    expect(parsePublicKey("hello world")).toBeUndefined();
    expect(parsePublicKey("ssh-ed25519 short")).toBeUndefined();
  });
});

describe("fingerprintOf", () => {
  it("matches what OpenSSH prints", async () => {
    expect(await fingerprintOf(parsePublicKey(ED25519)!.bytes)).toBe(
      ED25519_FP
    );
    expect(await fingerprintOf(parsePublicKey(ECDSA)!.bytes)).toBe(ECDSA_FP);
  });

  it("is sent in a form that fits in one path segment", () => {
    const path = toPathFingerprint(ED25519_FP);
    expect(path).toBe("XtqCfiQl-C_yppPd4-0-mdScwPJe3sqxe1TozjBSA20");
    expect(path).not.toMatch(/[+/:]/);
  });
});

describe("checkKeyInput", () => {
  it("accepts one key", () => {
    expect(checkKeyInput(`${ED25519}\n`).state).toBe("ok");
  });

  it("recognises a private key before anything else", () => {
    expect(
      checkKeyInput(
        "-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn\n-----END OPENSSH PRIVATE KEY-----"
      )
    ).toEqual({ state: "problem", problem: "private_key", partial: false });
  });

  it("refuses two keys pasted together", () => {
    expect(checkKeyInput(`${ED25519}\n${ECDSA}`)).toEqual({
      state: "problem",
      problem: "multiple",
      partial: false,
    });
  });

  it.each([
    ["s", true],
    ["ssh-ed", true],
    ["ssh-ed25519", true],
    ["ssh-ed25519 AAAA", true],
    ["hello world", false],
    ["ssh-ed25519 AAAA!!!!", false],
  ])("a line of %j that could still become a key: %s", (text, partial) => {
    expect(checkKeyInput(text)).toEqual({
      state: "problem",
      problem: "not_a_key",
      partial,
    });
  });

  it("is empty for blank text", () => {
    expect(checkKeyInput("  \n ")).toEqual({ state: "empty" });
  });
});

describe("describeKeys", () => {
  it("gives every listed key its fingerprint, and leaves an unreadable line without one", async () => {
    const keys = await describeKeys([ED25519, "not a key"]);
    expect(keys[0]).toMatchObject({
      name: "test@example.com",
      fingerprint: ED25519_FP,
    });
    expect(keys[1].fingerprint).toBe("");
  });
});

describe("parseSshKeysInfo", () => {
  it("falls back to the operating system mode and no keys", () => {
    expect(parseSshKeysInfo(null)).toEqual({ keys: [], mode: "os" });
    expect(parseSshKeysInfo({ keys: [ED25519, 4], mode: "container" })).toEqual(
      {
        keys: [ED25519],
        mode: "container",
      }
    );
  });
});
