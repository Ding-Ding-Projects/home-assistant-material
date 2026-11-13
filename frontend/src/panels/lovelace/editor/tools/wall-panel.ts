/**
 * Wall panel settings: a screensaver after idle time, rotation between views
 * on a timer, and dimming at night. Everything is stored in this browser
 * only and is off until switched on. It works by drawing over the page and
 * by navigating between views; it never keeps the screen awake and never
 * touches the device it runs on. The only exception is the optional screen
 * wake lock of wall tablet mode, which asks the browser to keep the screen on.
 */

export const WALL_PANEL_KEY = "wallPanelSettings";

export interface WallPanelSettings {
  /** `shift` moves the screensaver content slowly so no pixel stays lit. */
  screensaver: { enabled: boolean; minutes: number; shift: boolean };
  rotation: { enabled: boolean; seconds: number; views: string[] };
  night: { enabled: boolean; from: string; to: string; darkness: number };
  /**
   * Wall tablet mode: hides the navigation until a PIN or hold, wakes when a
   * motion entity turns on, keeps the screen on where the browser allows it
   * and listens for commands sent from elsewhere in the home.
   */
  kiosk: {
    enabled: boolean;
    /** The name shown in the tablets list; the tablet is reachable when set. */
    name: string;
    lockdown: boolean;
    /** Entity id of a motion or occupancy entity; empty for none. */
    motionEntity: string;
    keepAwake: boolean;
  };
}

export const DEFAULT_WALL_PANEL: WallPanelSettings = {
  screensaver: { enabled: false, minutes: 2, shift: true },
  rotation: { enabled: false, seconds: 30, views: [] },
  night: { enabled: false, from: "22:00", to: "07:00", darkness: 60 },
  kiosk: {
    enabled: false,
    name: "",
    lockdown: false,
    motionEntity: "",
    keepAwake: false,
  },
};

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** A tablet identifier made of the name: lower case letters, digits and dashes. */
export const tabletIdFromName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const normalizeWallPanel = (raw: unknown): WallPanelSettings => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const d = DEFAULT_WALL_PANEL;
  return {
    screensaver: {
      enabled: r.screensaver?.enabled === true,
      minutes: clampNumber(
        r.screensaver?.minutes,
        1,
        120,
        d.screensaver.minutes
      ),
      shift: r.screensaver?.shift !== false,
    },
    rotation: {
      enabled: r.rotation?.enabled === true,
      seconds: clampNumber(r.rotation?.seconds, 5, 3600, d.rotation.seconds),
      views: Array.isArray(r.rotation?.views)
        ? r.rotation.views
            .filter((v: unknown) => typeof v === "string")
            .slice(0, 100)
        : [],
    },
    night: {
      enabled: r.night?.enabled === true,
      from: TIME.test(r.night?.from) ? r.night.from : d.night.from,
      to: TIME.test(r.night?.to) ? r.night.to : d.night.to,
      darkness: clampNumber(r.night?.darkness, 0, 90, d.night.darkness),
    },
    kiosk: {
      enabled: r.kiosk?.enabled === true,
      name:
        typeof r.kiosk?.name === "string"
          ? r.kiosk.name.trim().slice(0, 60)
          : "",
      lockdown: r.kiosk?.lockdown === true,
      motionEntity:
        typeof r.kiosk?.motionEntity === "string" &&
        ENTITY_ID.test(r.kiosk.motionEntity)
          ? r.kiosk.motionEntity
          : "",
      keepAwake: r.kiosk?.keepAwake === true,
    },
  };
};

export const readWallPanel = (): WallPanelSettings => {
  try {
    return normalizeWallPanel(
      JSON.parse(window.localStorage.getItem(WALL_PANEL_KEY) || "null")
    );
  } catch (_err) {
    return normalizeWallPanel(null);
  }
};

export const writeWallPanel = (settings: WallPanelSettings): void => {
  window.localStorage.setItem(WALL_PANEL_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("wall-panel-changed"));
};

export const clearWallPanel = (): void => {
  try {
    window.localStorage.removeItem(WALL_PANEL_KEY);
  } catch (_err) {
    // Nothing was stored.
  }
  window.dispatchEvent(new CustomEvent("wall-panel-changed"));
};

/** Minutes after midnight for "HH:MM". */
export const minutesOfDay = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Whether a time of day falls in the window from `from` to `to`, which may cross midnight. */
export const inNightWindow = (
  minutes: number,
  from: string,
  to: string
): boolean => {
  const start = minutesOfDay(from);
  const end = minutesOfDay(to);
  if (start === end) {
    return false;
  }
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
};

/** The view key to show after `current`, going round the list; undefined when there is nothing to rotate. */
export const nextViewKey = (
  keys: string[],
  current: string | undefined
): string | undefined => {
  if (keys.length < 2) {
    return undefined;
  }
  const index = current === undefined ? -1 : keys.indexOf(current);
  return keys[(index + 1) % keys.length];
};
