import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import {
  HAS_RESOLVED_IANA_TIME_ZONE,
  LOCAL_TIME_ZONE,
  resolveTimeZone,
} from "../datetime/resolve-time-zone";
import { TimeZone } from "../../data/translation";
import {
  evaluateSchedules,
  isKnownZone,
  sanitizeSchedules,
  watchedEntityIds,
  zoneParts,
  type EntityStateLookup,
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
  /** The last zone that was resolved; only a fallback for older data. */
  timeZone?: unknown;
  /** Which profile option the zone follows: this browser or the server. */
  zoneSource?: unknown;
  /** The server zone, for when the source is the server or the browser has none. */
  serverZone?: unknown;
}

const readStored = (): StoredSchedules => {
  const value = safeGetStored<StoredSchedules>(SCHEDULE_STORAGE_KEY);
  return value && typeof value === "object" ? value : {};
};

const knownZone = (zone: unknown): string | undefined =>
  typeof zone === "string" && isKnownZone(zone) ? zone : undefined;

/** The rules, in the order they are checked. */
export const getSchedules = (): ScheduleRule[] =>
  sanitizeSchedules(readStored().rules);

/**
 * The time zone the rules are read in, resolved now. A profile that follows
 * this browser gets the browser zone, read at evaluation, not a copy kept
 * from the last time the page was open; one that follows the server gets the
 * server zone. A browser that cannot name its zone falls back to the server
 * zone, and to UTC when even that is not known.
 */
export const getScheduleTimeZone = (): string => {
  const stored = readStored();
  const server = knownZone(stored.serverZone);
  if (stored.zoneSource === TimeZone.server) {
    return server ?? knownZone(stored.timeZone) ?? LOCAL_TIME_ZONE;
  }
  if (stored.zoneSource === TimeZone.local) {
    return HAS_RESOLVED_IANA_TIME_ZONE ? LOCAL_TIME_ZONE : (server ?? "UTC");
  }
  return knownZone(stored.timeZone) ?? LOCAL_TIME_ZONE;
};

/** True when the rules read times in UTC only because no zone is known. */
export const isScheduleZoneFallback = (): boolean => {
  const stored = readStored();
  return (
    getScheduleTimeZone() === "UTC" &&
    !HAS_RESOLVED_IANA_TIME_ZONE &&
    !knownZone(stored.serverZone) &&
    stored.zoneSource !== TimeZone.server
  );
};

/**
 * A date whose local clock reads the wall time in the schedule zone, so a
 * check written against local getters (quiet hours) uses the same zone as
 * the rules.
 */
export const scheduleZoneNow = (now: Date = new Date()): Date => {
  const parts = zoneParts(now, getScheduleTimeZone());
  const wall = new Date(now);
  wall.setHours(Math.floor(parts.minute / 60), parts.minute % 60, 0, 0);
  // Move to the weekday the zone shows, by the shortest way round the week.
  wall.setDate(wall.getDate() + (((parts.day - wall.getDay() + 10) % 7) - 3));
  return wall;
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
  const next = { ...readStored(), rules: sanitizeSchedules(rules) };
  const ok = safeSetStored(SCHEDULE_STORAGE_KEY, next) && storedAs(next);
  armClock();
  return ok;
};

/**
 * Records which profile option the zone follows and the server zone. Call it
 * from somewhere that is always mounted, where the profile is read, so the
 * zone stays right while the schedules page is closed.
 */
export const setScheduleZoneSetting = (
  option: TimeZone,
  serverZone: string
): void => {
  const stored = readStored();
  if (
    !isKnownZone(serverZone) ||
    (stored.zoneSource === option && stored.serverZone === serverZone)
  ) {
    return;
  }
  safeSetStored(SCHEDULE_STORAGE_KEY, {
    ...stored,
    zoneSource: option,
    serverZone,
    timeZone: resolveTimeZone(option, serverZone),
  });
};

type EntityStates = Record<string, { state: string } | undefined>;

/** The states the app already holds in `hass.states`; nothing is requested. */
let entityStates: EntityStates | undefined;
let watchedCache: { raw: string | null; ids: string[] } | undefined;
let watchedSignature: string | undefined;

/** Looks an entity up in the states last given to `setScheduleEntityStates`. */
export const scheduleEntityLookup: EntityStateLookup = (entityId) =>
  Object.prototype.hasOwnProperty.call(entityStates ?? {}, entityId)
    ? entityStates![entityId]?.state
    : undefined;

/**
 * The entities the enabled rules depend on. Read again only when the stored
 * text changed, because this runs on every state change of the instance.
 */
export const getWatchedEntityIds = (): string[] => {
  let raw: string | null;
  try {
    raw = getStorage().storage.getItem(SCHEDULE_STORAGE_KEY);
  } catch (_err) {
    raw = null;
  }
  if (!watchedCache || watchedCache.raw !== raw) {
    watchedCache = { raw, ids: watchedEntityIds(getSchedules()) };
  }
  return watchedCache.ids;
};

/**
 * Gives the schedules the entity states the app already has. Call it whenever
 * `hass.states` changes. Listeners are woken only when the state of an entity
 * that a rule names changed (or the first time states arrive), so the rest
 * of the instance's traffic costs one lookup per named entity.
 */
export const setScheduleEntityStates = (states: EntityStates): void => {
  entityStates = states;
  const ids = getWatchedEntityIds();
  if (!ids.length) {
    watchedSignature = undefined;
    return;
  }
  const signature = ids
    .map((id) => `${id}=${scheduleEntityLookup(id) ?? "\u0000"}`)
    .join("\u0001");
  if (signature !== watchedSignature) {
    watchedSignature = signature;
    tick();
  }
};

/** What the stored rules give now, for the fields School mode leaves free. */
export const currentScheduleEvaluation = (
  held: ReadonlySet<string> = new Set(),
  now: Date = new Date()
): ScheduleEvaluation =>
  evaluateSchedules(
    getSchedules(),
    now,
    getScheduleTimeZone(),
    held,
    scheduleEntityLookup
  );

const tickListeners = new Set<() => void>();
let timer: number | undefined;
let visibilityHooked = false;

const hasEnabledRule = (): boolean =>
  getSchedules().some((rule) => rule.enabled);

const tick = () => {
  if (hasEnabledRule()) {
    tickListeners.forEach((listener) => listener());
  }
};

/**
 * Re-checks the rules at the start of each minute while a listener is waiting
 * and at least one enabled rule exists. With no enabled rule nothing is
 * scheduled at all; saving a rule or subscribing arms it again.
 */
function armClock() {
  if (
    timer !== undefined ||
    typeof window === "undefined" ||
    !tickListeners.size ||
    !hasEnabledRule()
  ) {
    return;
  }
  timer = window.setTimeout(
    () => {
      timer = undefined;
      tick();
      armClock();
    },
    60_000 - (Date.now() % 60_000) + 50
  );
}

const startClock = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (!visibilityHooked) {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        tick();
        armClock();
      }
    });
  }
  armClock();
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
    () => {
      armClock();
      callback();
    }
  );
  return () => {
    tickListeners.delete(callback);
    if (!tickListeners.size && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    unsubStorage();
  };
};
