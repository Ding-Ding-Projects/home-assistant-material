import { pageLockKey } from "./element-locks";

/**
 * A lock on one appearance value: the text size of a card, the colour of a
 * badge. The editor shows the value and refuses to change it until the lock is
 * opened. Like every lock it is kept in this browser and protects against a
 * slip of the hand, not against someone who clears the browser's data.
 *
 * The key names the page, the thing the appearance applies to, and the value.
 */

const VALUE_PREFIX = "value:";

/** Locks keep keys up to this many characters. */
const MAX_KEY_LENGTH = 500;

export interface ValueLockTarget {
  /** The address of the page the editor is open on. */
  page: string;
  /**
   * What the appearance applies to: the path of one element, or the kind of
   * element when the choice is for every element of that kind.
   */
  subject: string;
  /** The name of the appearance value, such as `zoom` or `textColor`. */
  field: string;
}

/** The key of the lock on one value, or undefined when it would be too long. */
export const valueLockKey = (target: ValueLockTarget): string | undefined => {
  const page = pageLockKey(target.page).slice("page:".length);
  const key = `${VALUE_PREFIX}${page}#${target.field}@${target.subject}`;
  return key.length <= MAX_KEY_LENGTH ? key : undefined;
};

export const isValueLockKey = (key: string): boolean =>
  key.startsWith(VALUE_PREFIX);

/** The parts of a value lock key, or undefined for a key of another form. */
export const parseValueLockKey = (key: string): ValueLockTarget | undefined => {
  if (!isValueLockKey(key)) {
    return undefined;
  }
  const rest = key.slice(VALUE_PREFIX.length);
  const hash = rest.indexOf("#");
  if (hash === -1) {
    return undefined;
  }
  const afterHash = rest.slice(hash + 1);
  const at = afterHash.indexOf("@");
  if (at <= 0) {
    return undefined;
  }
  return {
    page: rest.slice(0, hash) || "/",
    field: afterHash.slice(0, at),
    subject: afterHash.slice(at + 1),
  };
};
