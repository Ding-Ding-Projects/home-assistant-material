import type {
  LockDuration,
  LockFactor,
  LockPolicy,
  NewLockInput,
} from "../../common/locks/lock-credentials";
import {
  checkAll,
  createLockRecord,
  POLICY_FACTORS,
} from "../../common/locks/lock-credentials";

/**
 * Pure helpers for the lock wizard: the live password rules, the summary that
 * is safe to show, and the trial of a lock that is not saved. None of them
 * returns, stores or labels a PIN, a password or a one-time secret.
 */

export interface PasswordRules {
  lengthOk: boolean;
  /** False until the repeat has something typed in it. */
  repeatTyped: boolean;
  matchOk: boolean;
  /** Both rules hold. */
  ok: boolean;
}

/** The rules the wizard shows live while a password is chosen. */
export const passwordRules = (
  password: string,
  repeat: string,
  min: number,
  max: number
): PasswordRules => {
  const lengthOk = password.length >= min && password.length <= max;
  const repeatTyped = repeat.length > 0;
  const matchOk = repeatTyped && repeat === password;
  return { lengthOk, repeatTyped, matchOk, ok: lengthOk && matchOk };
};

export interface LockSummary {
  factors: LockFactor[];
  duration: LockDuration;
  onStart: boolean;
}

/** What the lock will ask for and for how long. Built from non-secret choices. */
export const buildLockSummary = (choices: {
  policy: LockPolicy;
  duration: LockDuration;
  onStart: boolean;
}): LockSummary => ({
  factors: [...POLICY_FACTORS[choices.policy]],
  duration: choices.duration,
  onStart: choices.onStart,
});

export type TryOutcome = "ok" | "wrong" | "invalid";

/**
 * Runs the real unlock check against a record built in memory from the new
 * lock's input. Nothing is written to storage, and a wrong try spends only
 * the attempt budget of that throw-away record.
 */
export const tryNewLock = async (
  input: NewLockInput,
  typed: Partial<Record<LockFactor, string>>,
  now: number
): Promise<TryOutcome> => {
  try {
    const record = await createLockRecord(input, now);
    const result = await checkAll(record, typed, now);
    return result.outcome === "ok" ? "ok" : "wrong";
  } catch (_err) {
    return "invalid";
  }
};
