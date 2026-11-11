/* eslint-disable no-bitwise, no-await-in-loop -- RFC 4226 and base32 are bit arithmetic, and each check has to run in order */
import { MAX_LOCK_WAIT_MS, waitForFailures } from "./lock-wait";
import { hasNativeCrypto, softHmac, softPbkdf2 } from "./soft-crypto";

/**
 * Credentials of one lock.
 *
 * Every lock has its own policy and its own credentials; nothing is shared
 * between locks. A PIN or a password is kept only as a salted PBKDF2 hash.
 * A one-time code follows RFC 6238 (TOTP) and is computed here, in the
 * browser, with no network. The secret behind a one-time code cannot be
 * hashed, because a code has to be computed from it, so it is kept as
 * written next to the lock in this browser's storage.
 *
 * A lock is a speed bump for a slip of the hand, not security.
 */

export type LockFactor = "pin" | "password" | "totp";

export const LOCK_POLICIES = [
  "pin",
  "password",
  "pin_password",
  "password_totp",
  "pin_totp",
  "password_pin_totp",
] as const;

export type LockPolicy = (typeof LOCK_POLICIES)[number];

/** The factors a policy asks for, in the order they are asked. */
export const POLICY_FACTORS: Record<LockPolicy, LockFactor[]> = {
  pin: ["pin"],
  password: ["password"],
  pin_password: ["pin", "password"],
  password_totp: ["password", "totp"],
  pin_totp: ["pin", "totp"],
  password_pin_totp: ["password", "pin", "totp"],
};

export type LockDuration =
  /** Until another page is opened. */
  | { kind: "surface" }
  /** For a number of minutes. */
  | { kind: "minutes"; minutes: number }
  /** Until the app is closed or reloaded. */
  | { kind: "session" };

export const MINUTES_LIMIT = 1440;

export const PIN_PATTERN = /^\d{4,12}$/;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 200;

/** Rounds of PBKDF2 for new credentials. Stored with each hash. */
export const PBKDF2_ROUNDS = 150000;

/** Most rounds a stored lock may ask for; more would freeze the page. */
export const MAX_PBKDF2_ROUNDS = 1000000;

/**
 * A stored wait-until time is never believed beyond the longest wait the code
 * sets, so wrong data (or a fast clock) cannot block an unlock for days.
 */
export const clampBlockedUntil = (value: unknown, now = Date.now()): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, now + MAX_LOCK_WAIT_MS)
    : 0;

export interface HashedSecret {
  salt: string;
  hash: string;
  rounds: number;
}

export interface TotpSecret {
  /** The secret in base32, as an authenticator app takes it. */
  secret: string;
}

export interface LockRecord {
  key: string;
  /** What is locked, in words, written when the lock was made. */
  label: string;
  policy: LockPolicy;
  pin?: HashedSecret;
  password?: HashedSecret;
  totp?: TotpSecret;
  duration: LockDuration;
  /** Wrong tries in a row, shared by every factor of this lock. */
  failures: number;
  /** Epoch milliseconds before which nothing is tried. */
  blockedUntil: number;
  created: number;
  /** The title of the page the lock was made on, written when it was made. */
  page?: string;
  /** Covers the interface when the app starts until this lock is opened. */
  onStart?: boolean;
}

/** Longest page title kept next to a lock. */
export const PAGE_TITLE_LIMIT = 120;

/** Tidies a page title for the list of locks; undefined when nothing is left. */
export const cleanPageTitle = (title: unknown): string | undefined => {
  if (typeof title !== "string") {
    return undefined;
  }
  const text = title.replace(/\s+/g, " ").trim().slice(0, PAGE_TITLE_LIMIT);
  return text || undefined;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const isHex = (value: unknown, length: number): value is string =>
  typeof value === "string" &&
  value.length === length &&
  /^[0-9a-f]+$/.test(value);

/** Compares two hex strings of equal length without stopping early. */
const sameHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const deriveHash = async (
  value: string,
  salt: string,
  rounds: number
): Promise<string> => {
  if (!hasNativeCrypto()) {
    // A page opened over plain http has no crypto.subtle; see soft-crypto.
    return toHex(
      await softPbkdf2(
        "SHA-256",
        new TextEncoder().encode(value),
        fromHex(salt),
        rounds,
        32
      )
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(fromHex(salt)),
      iterations: rounds,
    },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
};

export const hashSecret = async (
  value: string,
  rounds = PBKDF2_ROUNDS
): Promise<HashedSecret> => {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await deriveHash(value, salt, rounds), rounds };
};

export const secretMatches = async (
  secret: HashedSecret,
  value: string
): Promise<boolean> =>
  sameHex(await deriveHash(value, secret.salt, secret.rounds), secret.hash);

// ---- TOTP (RFC 6238 over RFC 4226) ----

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let out = "";
  bytes.forEach((byte) => {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  });
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
};

/** Decodes base32; returns undefined when it holds anything else. */
export const base32Decode = (text: string): Uint8Array | undefined => {
  const clean = text.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) {
    return undefined;
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
};

export const newTotpSecret = (): string =>
  base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps either side of now that are still accepted. */
export const TOTP_SKEW_STEPS = 1;

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

/** The code of one counter value (RFC 4226 truncation). */
export const hotp = async (
  key: Uint8Array,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: TotpAlgorithm = "SHA-1"
): Promise<string> => {
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  let mac: Uint8Array;
  if (hasNativeCrypto()) {
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(key),
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"]
    );
    mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, message));
  } else if (algorithm === "SHA-512") {
    // Not written out in script; codes made here always use SHA-1.
    throw new Error("SHA-512 codes need a secure page");
  } else {
    mac = softHmac(algorithm, key, message);
  }
  const offset = mac[mac.length - 1] & 15;
  const binary =
    ((mac[offset] & 127) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
};

/** The code for a moment in time, in epoch milliseconds. */
export const totpAt = async (
  key: Uint8Array,
  time: number,
  digits = TOTP_DIGITS,
  algorithm: TotpAlgorithm = "SHA-1"
): Promise<string> =>
  hotp(key, Math.floor(time / 1000 / TOTP_STEP_SECONDS), digits, algorithm);

/** Whether a code is right for the moment, within the skew window. */
export const totpMatches = async (
  secret: string,
  code: string,
  now: number,
  skew = TOTP_SKEW_STEPS
): Promise<boolean> => {
  const key = base32Decode(secret);
  if (!key || !/^\d{6}$/.test(code)) {
    return false;
  }
  let ok = false;
  for (let step = -skew; step <= skew; step++) {
    const expected = await totpAt(key, now + step * TOTP_STEP_SECONDS * 1000);
    if (sameHex(expected, code)) {
      ok = true;
    }
  }
  return ok;
};

/** The address an authenticator app reads from a QR code. */
export const totpUri = (secret: string, label: string): string =>
  `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

// ---- creating and checking a lock ----

export interface NewLockInput {
  key: string;
  label: string;
  policy: LockPolicy;
  duration: LockDuration;
  pin?: string;
  password?: string;
  /** The base32 secret the user has set up in an authenticator. */
  totpSecret?: string;
  /** The title of the page the lock is made on. */
  page?: string;
  /** Locked on start. On unless said otherwise. */
  onStart?: boolean;
}

/** What is wrong with the input, or undefined when it can be used. */
export const validateNewLock = (input: NewLockInput): string | undefined => {
  const factors = POLICY_FACTORS[input.policy];
  if (!factors) {
    return "policy";
  }
  if (factors.includes("pin") && !PIN_PATTERN.test(input.pin ?? "")) {
    return "pin";
  }
  if (
    factors.includes("password") &&
    ((input.password ?? "").length < PASSWORD_MIN ||
      (input.password ?? "").length > PASSWORD_MAX)
  ) {
    return "password";
  }
  if (
    factors.includes("totp") &&
    !(input.totpSecret && base32Decode(input.totpSecret))
  ) {
    return "totp";
  }
  if (
    input.duration.kind === "minutes" &&
    !(
      Number.isInteger(input.duration.minutes) &&
      input.duration.minutes >= 1 &&
      input.duration.minutes <= MINUTES_LIMIT
    )
  ) {
    return "duration";
  }
  return undefined;
};

/** Builds the record of a lock; only the factors its policy asks for are kept. */
export const createLockRecord = async (
  input: NewLockInput,
  now: number
): Promise<LockRecord> => {
  const problem = validateNewLock(input);
  if (problem) {
    throw new Error(`Invalid lock: ${problem}`);
  }
  const factors = POLICY_FACTORS[input.policy];
  const record: LockRecord = {
    key: input.key,
    label: input.label.slice(0, 200),
    policy: input.policy,
    duration: input.duration,
    failures: 0,
    blockedUntil: 0,
    created: now,
    onStart: input.onStart !== false,
  };
  const page = cleanPageTitle(input.page);
  if (page) {
    record.page = page;
  }
  if (factors.includes("pin")) {
    record.pin = await hashSecret(input.pin!);
  }
  if (factors.includes("password")) {
    record.password = await hashSecret(input.password!);
  }
  if (factors.includes("totp")) {
    record.totp = {
      secret: input.totpSecret!.replace(/[\s-]/g, "").toUpperCase(),
    };
  }
  return record;
};

export type FactorOutcome = "ok" | "wrong" | "wait";

export interface FactorResult {
  outcome: FactorOutcome;
  /** The record to save: its attempt budget moved on. */
  record: LockRecord;
  waitMs: number;
}

/**
 * Checks one factor of a lock. Every factor of a lock, typed or entered on
 * a keypad, passes through here and spends the same budget: a wrong try is
 * counted, and from the third in a row the next try has to wait. A right
 * factor does not clear the count until the whole policy is met; see
 * `finishAttempt`.
 */
export const checkFactor = async (
  record: LockRecord,
  factor: LockFactor,
  value: string,
  now: number
): Promise<FactorResult> => {
  if (record.blockedUntil > now) {
    return { outcome: "wait", record, waitMs: record.blockedUntil - now };
  }
  let ok = false;
  if (POLICY_FACTORS[record.policy].includes(factor)) {
    if (factor === "pin" && record.pin && PIN_PATTERN.test(value)) {
      ok = await secretMatches(record.pin, value);
    } else if (
      factor === "password" &&
      record.password &&
      value.length <= PASSWORD_MAX
    ) {
      ok = await secretMatches(record.password, value);
    } else if (factor === "totp" && record.totp) {
      ok = await totpMatches(record.totp.secret, value, now);
    }
  }
  if (ok) {
    return { outcome: "ok", record, waitMs: 0 };
  }
  const failures = record.failures + 1;
  const waitMs = waitForFailures(failures);
  return {
    outcome: "wrong",
    record: { ...record, failures, blockedUntil: waitMs ? now + waitMs : 0 },
    waitMs,
  };
};

/** Clears the budget once every factor of the policy has been met. */
export const finishAttempt = (record: LockRecord): LockRecord => ({
  ...record,
  failures: 0,
  blockedUntil: 0,
});

/** Checks every factor in order, as one attempt. Stops at the first miss. */
export const checkAll = async (
  record: LockRecord,
  values: Partial<Record<LockFactor, string>>,
  now: number
): Promise<FactorResult> => {
  let current = record;
  for (const factor of POLICY_FACTORS[record.policy]) {
    const result = await checkFactor(
      current,
      factor,
      values[factor] ?? "",
      now
    );
    if (result.outcome !== "ok") {
      return result;
    }
    current = result.record;
  }
  return { outcome: "ok", record: finishAttempt(current), waitMs: 0 };
};

const normalizeSecret = (raw: unknown): HashedSecret | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Partial<HashedSecret>;
  if (
    isHex(value.salt, 32) &&
    isHex(value.hash, 64) &&
    Number.isInteger(value.rounds) &&
    value.rounds! >= 1000 &&
    value.rounds! <= MAX_PBKDF2_ROUNDS
  ) {
    return { salt: value.salt, hash: value.hash, rounds: value.rounds! };
  }
  return undefined;
};

const normalizeDuration = (raw: unknown): LockDuration => {
  const value = (raw ?? {}) as { kind?: unknown; minutes?: unknown };
  if (value.kind === "session") {
    return { kind: "session" };
  }
  if (
    value.kind === "minutes" &&
    Number.isInteger(value.minutes) &&
    (value.minutes as number) >= 1 &&
    (value.minutes as number) <= MINUTES_LIMIT
  ) {
    return { kind: "minutes", minutes: value.minutes as number };
  }
  return { kind: "surface" };
};

/**
 * Makes a stored record safe to use. A record that no longer holds every
 * credential its policy asks for is dropped, never weakened to a smaller
 * policy.
 */
export const normalizeLockRecord = (raw: unknown): LockRecord | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Partial<LockRecord>;
  if (
    typeof value.key !== "string" ||
    !value.key ||
    value.key.length > 500 ||
    !LOCK_POLICIES.includes(value.policy as LockPolicy)
  ) {
    return undefined;
  }
  const policy = value.policy as LockPolicy;
  const factors = POLICY_FACTORS[policy];
  const record: LockRecord = {
    key: value.key,
    label: typeof value.label === "string" ? value.label.slice(0, 200) : "",
    policy,
    duration: normalizeDuration(value.duration),
    failures:
      Number.isInteger(value.failures) && value.failures! > 0
        ? Math.min(value.failures!, 1000)
        : 0,
    blockedUntil: clampBlockedUntil(value.blockedUntil),
    created:
      Number.isFinite(value.created) && value.created! > 0 ? value.created! : 0,
    // Locks made before this choice existed keep behaving as they did.
    onStart: value.onStart === true,
  };
  const page = cleanPageTitle(value.page);
  if (page) {
    record.page = page;
  }
  if (factors.includes("pin")) {
    record.pin = normalizeSecret(value.pin);
    if (!record.pin) {
      return undefined;
    }
  }
  if (factors.includes("password")) {
    record.password = normalizeSecret(value.password);
    if (!record.password) {
      return undefined;
    }
  }
  if (factors.includes("totp")) {
    const secret = value.totp?.secret;
    if (typeof secret !== "string" || !base32Decode(secret)) {
      return undefined;
    }
    record.totp = { secret: secret.replace(/[\s-]/g, "").toUpperCase() };
  }
  return record;
};
