/** The user and port the page tells people to connect with. */
export const SSH_PORT = 22222;
export const SSH_USER = "root";

const KEY_ALGORITHMS = [
  "ssh-ed25519",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
] as const;

// Same shape the Supervisor accepts, with an optional options prefix.
const RE_KEY_LINE = new RegExp(
  `(?:^|\\s)(${KEY_ALGORITHMS.map((a) => a.replace(/[.]/g, "\\.")).join(
    "|"
  )})\\s+([A-Za-z0-9+/]{16,}={0,2})(?:\\s+(.*))?$`
);

/** The most the SSH server reads from one authorized_keys line. */
export const MAX_KEY_LENGTH = 3000;

export interface PublicKey {
  algorithm: string;
  /** A short label for the key type, such as ED25519 or RSA 4096. */
  type: string;
  comment: string;
  /** The decoded key body, which the fingerprint is made from. */
  bytes: Uint8Array;
}

const decodeBase64 = (value: string): Uint8Array | undefined => {
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const text = atob(padded);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    return bytes.length ? bytes : undefined;
  } catch (_err) {
    return undefined;
  }
};

/** The bit length of an RSA key, read from the modulus in the key body. */
const rsaBits = (bytes: Uint8Array): number | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const skip = (): number | undefined => {
    if (offset + 4 > bytes.length) {
      return undefined;
    }
    const length = view.getUint32(offset);
    const start = offset + 4;
    offset = start + length;
    return offset <= bytes.length ? start : undefined;
  };
  // algorithm name, exponent, modulus
  if (skip() === undefined || skip() === undefined) {
    return undefined;
  }
  const lengthAt = offset;
  const start = skip();
  if (start === undefined) {
    return undefined;
  }
  const length = view.getUint32(lengthAt);
  let first = start;
  let size = length;
  while (size > 0 && bytes[first] === 0) {
    first++;
    size--;
  }
  return size ? (size - 1) * 8 + (32 - Math.clz32(bytes[first])) : undefined;
};

const keyTypeLabel = (algorithm: string, bytes: Uint8Array): string => {
  if (algorithm === "ssh-ed25519") {
    return "ED25519";
  }
  if (algorithm === "ssh-rsa") {
    const bits = rsaBits(bytes);
    return bits ? `RSA ${bits}` : "RSA";
  }
  if (algorithm.startsWith("sk-")) {
    return "Security key";
  }
  return "ECDSA";
};

/** Take a public key line apart, or return undefined when it is not one. */
export const parsePublicKey = (line: string): PublicKey | undefined => {
  const match = RE_KEY_LINE.exec(line.trim());
  if (!match) {
    return undefined;
  }
  const bytes = decodeBase64(match[2]);
  if (!bytes) {
    return undefined;
  }
  return {
    algorithm: match[1],
    type: keyTypeLabel(match[1], bytes),
    comment: (match[3] ?? "").trim(),
    bytes,
  };
};

/** The SHA256 fingerprint as OpenSSH prints it. */
export const fingerprintOf = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  );
  let text = "";
  for (const byte of digest) {
    text += String.fromCharCode(byte);
  }
  return `SHA256:${btoa(text).replace(/=+$/, "")}`;
};

/** A fingerprint made safe for one path segment: no "+" or "/". */
export const toPathFingerprint = (fingerprint: string): string =>
  fingerprint
    .replace(/^SHA256:/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export type KeyInputProblem =
  "private_key" | "multiple" | "too_long" | "not_a_key";

export type KeyInputCheck =
  | { state: "empty" }
  | { state: "ok"; key: PublicKey; line: string }
  | {
      state: "problem";
      problem: KeyInputProblem;
      /** The line could still turn into a key, so the message can wait. */
      partial: boolean;
    };

const RE_PARTIAL_ALGORITHM = new RegExp(
  `^(?:${KEY_ALGORITHMS.map((a) => a.replace(/[.]/g, "\\.")).join("|")})$`
);

/** Whether what was typed so far is a prefix of an algorithm name. */
const couldBecomeKey = (line: string): boolean => {
  const parts = line.split(/\s+/);
  if (parts.length === 1) {
    return KEY_ALGORITHMS.some((algorithm) => algorithm.startsWith(parts[0]));
  }
  return (
    parts.length === 2 &&
    RE_PARTIAL_ALGORITHM.test(parts[0]) &&
    /^[A-Za-z0-9+/]{0,15}$/.test(parts[1])
  );
};

/**
 * Check what was typed or pasted into the key field. A private key is
 * recognised before anything else so the page can clear it at once.
 */
export const checkKeyInput = (text: string): KeyInputCheck => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { state: "empty" };
  }
  if (/PRIVATE KEY/i.test(trimmed)) {
    return { state: "problem", problem: "private_key", partial: false };
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line);
  if (lines.length > 1) {
    return { state: "problem", problem: "multiple", partial: false };
  }
  const [line] = lines;
  if (new TextEncoder().encode(line).length > MAX_KEY_LENGTH) {
    return { state: "problem", problem: "too_long", partial: false };
  }
  const key = parsePublicKey(line);
  if (!key) {
    return {
      state: "problem",
      problem: "not_a_key",
      partial: couldBecomeKey(line),
    };
  }
  return { state: "ok", key, line };
};

export interface ListedKey {
  line: string;
  name: string;
  type: string;
  fingerprint: string;
}

/** The keys the Supervisor listed, with their types and fingerprints. */
export const describeKeys = async (lines: string[]): Promise<ListedKey[]> =>
  Promise.all(
    lines.map(async (line) => {
      const key = parsePublicKey(line);
      return {
        line,
        name: key?.comment ?? "",
        type: key?.type ?? "",
        fingerprint: key ? await fingerprintOf(key.bytes) : "",
      };
    })
  );

export const connectCommand = (host: string, port = SSH_PORT): string =>
  `ssh ${SSH_USER}@${host} -p ${port}`;
