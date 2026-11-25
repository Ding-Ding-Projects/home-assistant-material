import { describe, expect, it } from "vitest";
import { parseSshKeysInfo } from "../../../../src/data/hassio/ssh-keys";
import {
  checkKeyInput,
  connectHost,
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

  it("refuses a key body that is cut off, junk, or of another type", () => {
    const [algorithm, blob] = ED25519.split(" ");
    expect(
      parsePublicKey(`${algorithm} ${blob.slice(0, -12)}`)
    ).toBeUndefined();
    expect(
      parsePublicKey("ssh-ed25519 AAAAAAAAAAAAAAAAAAAAAAAA t")
    ).toBeUndefined();
    expect(parsePublicKey(`ssh-rsa ${blob}`)).toBeUndefined();
  });

  it("does not take a key hidden in an options prefix for the key the server uses", () => {
    const decoy = `command="exec sh # ${ED25519}" ${ECDSA}`;
    // A line the page writes has no options at all.
    expect(parsePublicKey(decoy)).toBeUndefined();
    // A line written elsewhere is read the way the server reads it.
    expect(parsePublicKey(decoy, true)).toMatchObject({
      algorithm: "ecdsa-sha2-nistp256",
      comment: "second@example",
    });
  });

  it.each(["\u2028", "\u2029", "\u0085"])(
    "refuses a line separator the server does not split on (%j)",
    (separator) => {
      expect(parsePublicKey(`${ED25519}${separator}${ECDSA}`)).toBeUndefined();
      expect(checkKeyInput(`${ED25519}${separator}${ECDSA}`)).toMatchObject({
        problem: "multiple",
      });
    }
  );
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

  it("recognises a PuTTY private key file", () => {
    expect(
      checkKeyInput(
        "PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\nPrivate-Lines: 1"
      )
    ).toMatchObject({ problem: "private_key" });
  });

  it("holds the message back for a key that is cut off", () => {
    expect(
      checkKeyInput(ED25519.split(" ").slice(0, 2).join(" ").slice(0, -12))
    ).toMatchObject({ problem: "not_a_key", partial: true });
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
    expect(parseSshKeysInfo(null)).toEqual({
      keys: [],
      mode: "os",
      port: 22222,
    });
    expect(
      parseSshKeysInfo({ keys: [ED25519, 4], mode: "container", port: 2222 })
    ).toEqual({ keys: [ED25519], mode: "container", port: 2222 });
  });

  it("reports an install without SSH as a mode, not an error", () => {
    expect(parseSshKeysInfo({ keys: [], mode: "unsupported" }).mode).toBe(
      "unsupported"
    );
    expect(parseSshKeysInfo({ keys: [], port: 70000 }).port).toBe(22222);
  });
});

// Built from parts so that no address is written out in the repository.
const ip = (...octets: number[]) => octets.join(".");

describe("connectHost", () => {
  it.each([
    [ip(192, 168, 1, 20), ip(192, 168, 1, 20)],
    [ip(10, 0, 0, 5), ip(10, 0, 0, 5)],
    [ip(172, 20, 1, 1), ip(172, 20, 1, 1)],
    ["homeassistant.local", "homeassistant.local"],
    ["homeassistant", "homeassistant"],
    [ip(203, 0, 113, 9), "homeassistant.local"],
    [ip(172, 40, 0, 1), "homeassistant.local"],
    ["home.example.org", "homeassistant.local"],
  ])("%s is shown as %s", (hostname, host) => {
    expect(connectHost(hostname)).toBe(host);
  });
});
