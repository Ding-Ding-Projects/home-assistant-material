import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { sha256, toHex } from "../util/sha256";
import type { LockRecord } from "./lock-credentials";
import { clampBlockedUntil, normalizeLockRecord } from "./lock-credentials";
import { waitForFailures } from "./lock-wait";

export { waitForFailures };

/**
 * Locks: a page that is locked cannot be changed until it is unlocked.
 *
 * A lock is a guard against a slip of the hand, a child, or a visitor at a
 * shared screen. It is kept in this browser, so it is not a replacement
 * for user accounts and permissions: someone who can clear the browser's
 * storage can remove it.
 *
 * Unlocking is a deliberate act: hold the unlock button, or, when a PIN is
 * set, enter it. Wrong PINs make the next try wait, longer each time.
 */

export const LOCKS_STORAGE_KEY = "elementLocks";

/** Most locks kept; the oldest is dropped after this. */
export const LOCK_LIMIT = 500;

/** How long the unlock button is held, in milliseconds. */
export const UNLOCK_HOLD_MS = 1500;

export const PIN_PATTERN = /^\d{4,12}$/;

const PIN_ROUNDS = 20000;

export interface LockPin {
  salt: string;
  hash: string;
}

export interface LockStore {
  locked: string[];
  pin?: LockPin;
  /** Wrong PINs in a row. */
  failures: number;
  /** Epoch milliseconds before which no PIN is tried. */
  blockedUntil: number;
  /**
   * Locks that have their own policy and credentials, by lock key. A lock
   * without a record is an older lock and uses the shared PIN or a hold.
   */
  records?: Record<string, LockRecord>;
}

export const emptyLockStore = (): LockStore => ({
  locked: [],
  failures: 0,
  blockedUntil: 0,
});

const isHex = (value: unknown, length: number): value is string =>
  typeof value === "string" &&
  value.length === length &&
  /^[0-9a-f]+$/.test(value);

/** Makes stored data safe to use; anything unexpected is dropped. */
export const normalizeLockStore = (raw: unknown): LockStore => {
  const store = emptyLockStore();
  if (!raw || typeof raw !== "object") {
    return store;
  }
  const value = raw as Partial<LockStore>;
  if (Array.isArray(value.locked)) {
    store.locked = Array.from(
      new Set(
        value.locked.filter(
          (key): key is string =>
            typeof key === "string" && key.length > 0 && key.length <= 500
        )
      )
    ).slice(-LOCK_LIMIT);
  }
  if (
    value.pin &&
    typeof value.pin === "object" &&
    isHex(value.pin.salt, 32) &&
    isHex(value.pin.hash, 64)
  ) {
    store.pin = { salt: value.pin.salt, hash: value.pin.hash };
  }
  if (Number.isInteger(value.failures) && value.failures! > 0) {
    store.failures = Math.min(value.failures!, 1000);
  }
  if (clampBlockedUntil(value.blockedUntil) > 0) {
    store.blockedUntil = clampBlockedUntil(value.blockedUntil);
  }
  if (value.records && typeof value.records === "object") {
    const records: Record<string, LockRecord> = {};
    Object.values(value.records).forEach((entry) => {
      const record = normalizeLockRecord(entry);
      if (record && store.locked.includes(record.key)) {
        records[record.key] = record;
      }
    });
    if (Object.keys(records).length) {
      store.records = records;
    }
  }
  return store;
};

/** The key of the lock on a whole page. */
export const pageLockKey = (path: string): string =>
  `page:${path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"}`;

export const isLocked = (store: LockStore, key: string): boolean =>
  store.locked.includes(key);

export const withLock = (
  store: LockStore,
  key: string,
  locked: boolean
): LockStore => {
  const others = store.locked.filter((item) => item !== key);
  const next: LockStore = {
    ...store,
    locked: locked ? [...others, key].slice(-LOCK_LIMIT) : others,
  };
  if (!locked && store.records?.[key]) {
    // Removing a lock removes its credentials with it.
    const { [key]: _gone, ...rest } = store.records;
    if (Object.keys(rest).length) {
      next.records = rest;
    } else {
      delete next.records;
    }
  }
  return next;
};

/** Adds a lock with its own policy and credentials, or replaces its record. */
export const withLockRecord = (
  store: LockStore,
  record: LockRecord
): LockStore => {
  const locked = withLock(store, record.key, true);
  return { ...locked, records: { ...store.records, [record.key]: record } };
};

/** Saves a changed record, such as a moved attempt budget. */
export const withUpdatedRecord = (
  store: LockStore,
  record: LockRecord
): LockStore =>
  store.records?.[record.key]
    ? { ...store, records: { ...store.records, [record.key]: record } }
    : store;

/** The stored form of a PIN: many rounds of a salted hash. */
export const derivePin = (pin: string, salt: string): string => {
  const encoder = new TextEncoder();
  let value = sha256(encoder.encode(`${salt}:${pin}`));
  const salted = new Uint8Array(32 + salt.length);
  salted.set(encoder.encode(salt), 32);
  for (let round = 1; round < PIN_ROUNDS; round++) {
    salted.set(value);
    value = sha256(salted);
  }
  return toHex(value);
};

export const newSalt = (): string =>
  toHex(crypto.getRandomValues(new Uint8Array(16)));

export const withPin = (
  store: LockStore,
  pin: string | undefined
): LockStore => {
  const next: LockStore = { ...store, failures: 0, blockedUntil: 0 };
  if (pin === undefined) {
    delete next.pin;
    return next;
  }
  const salt = newSalt();
  next.pin = { salt, hash: derivePin(pin, salt) };
  return next;
};

export type PinOutcome = "ok" | "wrong" | "wait";

/**
 * Tries a PIN. A wrong one is counted, and from the third in a row the
 * next try has to wait. The returned store has to be saved.
 */
export const tryPin = (
  store: LockStore,
  pin: string,
  now: number
): { outcome: PinOutcome; store: LockStore; waitMs: number } => {
  if (!store.pin) {
    return { outcome: "ok", store, waitMs: 0 };
  }
  if (store.blockedUntil > now) {
    return { outcome: "wait", store, waitMs: store.blockedUntil - now };
  }
  if (
    PIN_PATTERN.test(pin) &&
    derivePin(pin, store.pin.salt) === store.pin.hash
  ) {
    return {
      outcome: "ok",
      store: { ...store, failures: 0, blockedUntil: 0 },
      waitMs: 0,
    };
  }
  const failures = store.failures + 1;
  const waitMs = waitForFailures(failures);
  return {
    outcome: "wrong",
    store: { ...store, failures, blockedUntil: waitMs ? now + waitMs : 0 },
    waitMs,
  };
};

export const readLocks = (): LockStore =>
  normalizeLockStore(getStorage().getValue(LOCKS_STORAGE_KEY));

export const writeLocks = (store: LockStore): void =>
  getStorage().setValue(LOCKS_STORAGE_KEY, normalizeLockStore(store));

export const subscribeLocks = (
  callback: (store: LockStore) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(LOCKS_STORAGE_KEY, () => callback(readLocks()));

const ELEMENT_PREFIX = "element:";

/** The key of the lock on one element of a page. */
export const elementLockKey = (page: string, elementPath: string): string =>
  `${ELEMENT_PREFIX}${pageLockKey(page).slice(5)}#${elementPath}`;

/** The paths of the elements locked on a page. */
export const lockedElementPaths = (
  store: LockStore,
  page: string
): string[] => {
  const prefix = `${ELEMENT_PREFIX}${pageLockKey(page).slice(5)}#`;
  return store.locked
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
};
