import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { LOCAL_TIME_ZONE } from "../datetime/resolve-time-zone";
import {
  evaluateSchedules,
  isKnownZone,
  sanitizeSchedules,
  type ScheduleEvaluation,
  type ScheduleRule,
} from "./preference-schedule";
import { safeGetStored, safeSetStored } from "./safe-storage";

/**
 * Where the schedule rules live in this browser, which time zone they are read
 * in, and the clock that makes them take effect without a reload.
 */
export const SCHEDULE_STORAGE_KEY = "preferenceSchedules";

interface StoredSchedules {
  rules?: unknown;
  timeZone?: unknown;
}

const readStored = (): StoredSchedules => {
  const value = safeGetStored<StoredSchedules>(SCHEDULE_STORAGE_KEY);
  return value && typeof value === "object" ? value : {};
};

/** The rules, in the order they are checked. */
export const getSchedules = (): ScheduleRule[] =>
  sanitizeSchedules(readStored().rules);

/**
 * The time zone the rules are read in: the one the page last set from the
 * profile settings, or this browser's own zone.
 */
export const getScheduleTimeZone = (): string => {
  const zone = readStored().timeZone;
  return typeof zone === "string" && isKnownZone(zone) ? zone : LOCAL_TIME_ZONE;
};

/** True when the browser now holds exactly this value. */
const storedAs = (value: unknown): boolean => {
  try {
    return (
      getStorage().storage.getItem(SCHEDULE_STORAGE_KEY) ===
      JSON.stringify(value)
    );
  } catch (_err) {
    return false;
  }
};

/** Saves the rules. False when browser storage could not keep them. */
export const saveSchedules = (rules: ScheduleRule[]): boolean => {
  const next = {
    rules: sanitizeSchedules(rules),
    timeZone: getScheduleTimeZone(),
  };
  return safeSetStored(SCHEDULE_STORAGE_KEY, next) && storedAs(next);
};

/** Remembers the zone the profile reads times in, so rules follow it. */
export const setScheduleTimeZone = (zone: string): void => {
  if (!isKnownZone(zone) || zone === readStored().timeZone) {
    return;
  }
  safeSetStored(SCHEDULE_STORAGE_KEY, {
    rules: getSchedules(),
    timeZone: zone,
  });
};

/** What the stored rules give now, for the fields School mode leaves free. */
export const currentScheduleEvaluation = (
  held: ReadonlySet<string> = new Set(),
  now: Date = new Date()
): ScheduleEvaluation =>
  evaluateSchedules(getSchedules(), now, getScheduleTimeZone(), held);

const tickListeners = new Set<() => void>();
let clockStarted = false;

const tick = () => {
  tickListeners.forEach((listener) => listener());
};

/** Re-checks the rules every half minute and when the page comes back. */
const startClock = () => {
  if (clockStarted || typeof window === "undefined") {
    return;
  }
  clockStarted = true;
  window.setInterval(tick, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tick();
    }
  });
};

/**
 * Calls back when the rules change, in this tab or another, and on each clock
 * tick. The callback decides whether anything it shows has changed.
 */
export const subscribeScheduleClock = (
  callback: () => void
): UnsubscribeFunc => {
  startClock();
  tickListeners.add(callback);
  const unsubStorage = getStorage().subscribeChanges(
    SCHEDULE_STORAGE_KEY,
    callback
  );
  return () => {
    tickListeners.delete(callback);
    unsubStorage();
  };
};
