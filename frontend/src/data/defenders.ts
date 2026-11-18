import type { HomeAssistant } from "../types";

export type DefenderDirection = "cool" | "heat";

/** A reason as a code plus values, so the page can word it in any language. */
export interface DefenderReasonParts {
  code: string;
  params: Record<string, string | number | DefenderReasonParts>;
}

export interface DefenderGuard {
  id: string;
  family: string;
  group: string;
  safety: boolean;
  enabled: boolean;
  settings: Record<string, string | number | boolean>;
  last_acted: string | null;
  reason: string | null;
  reason_parts?: DefenderReasonParts | null;
}

export interface DefenderLogEntry {
  time: string;
  kind: string;
  guard: string;
  message: string;
  values: {
    code?: string;
    who?: string;
    to?: string;
    plain?: boolean;
    values?: { room?: number; low?: number; high?: number };
    reason_parts?: DefenderReasonParts | null;
  } & Record<string, unknown>;
}

export interface DefenderSibling {
  role: "ac" | "heat";
  entry_id: string;
  domain: string;
  state: string;
  reason: string;
  reason_parts?: DefenderReasonParts | null;
  paused: boolean;
  my_temperature: number;
  floor: number | null;
  safety_temperature?: number;
  heat_mode: string;
}

export interface DefenderDay {
  day: string;
  seconds: number;
  cost: number | null;
}

export interface DefenderInfo {
  run_mode: DefenderDirection;
  climate_entity_id: string;
  paused_until: string | null;
  state: string;
  reason: string;
  reason_parts?: DefenderReasonParts | null;
  next_check: string | null;
  my_temperature: number;
  floor: number | null;
  safety_temperature?: number;
  heat_mode: string;
  effective_floor: number | null;
  holder: string;
  gated: boolean;
  sibling: DefenderSibling | null;
  band: { low: number; high: number } | null;
  plain_log: boolean;
  guards: DefenderGuard[];
  log: DefenderLogEntry[];
  cost: {
    seconds_today: number;
    seconds_month: number;
    cost_today: number | null;
    cost_month: number | null;
    days: DefenderDay[];
  };
}

export type DefenderControl = "pause" | "stop" | "resume";

export const DEFENDER_DOMAINS: Record<DefenderDirection, string> = {
  cool: "ac_defender",
  heat: "heat_defender",
};

export const fetchDefenderInfo = (
  hass: HomeAssistant,
  entryId: string
): Promise<DefenderInfo> =>
  hass.callWS({ type: "ac_defender/info", entry_id: entryId });

export const setDefenderGuard = (
  hass: HomeAssistant,
  entryId: string,
  guard: string,
  enabled: boolean,
  confirmed = false
): Promise<{ guard: string; enabled: boolean }> =>
  hass.callWS({
    type: "ac_defender/set_guard",
    entry_id: entryId,
    guard,
    enabled,
    confirmed,
  });

export const setDefenderTemperature = (
  hass: HomeAssistant,
  entryId: string,
  value: number
): Promise<{ value: number }> =>
  hass.callWS({
    type: "ac_defender/set_temperature",
    entry_id: entryId,
    value,
  });

export const setDefenderFloor = (
  hass: HomeAssistant,
  entryId: string,
  value: number
): Promise<{ value: number }> =>
  hass.callWS({ type: "ac_defender/set_floor", entry_id: entryId, value });

export const controlDefender = (
  hass: HomeAssistant,
  entryId: string,
  action: DefenderControl,
  options: { hours?: number; alsoSibling?: boolean } = {}
): Promise<void> =>
  hass.callWS({
    type: "ac_defender/control",
    entry_id: entryId,
    action,
    hours: options.hours,
    also_sibling: options.alsoSibling ?? false,
  });

export interface GuardGroup {
  group: string;
  guards: DefenderGuard[];
}

const GROUP_ORDER = ["safety", "people", "timing", "money"];

/** Groups guards for the list, the safety group first, filtered by a plain text. */
export const groupGuards = (
  guards: DefenderGuard[],
  matches: (guard: DefenderGuard) => boolean = () => true
): GuardGroup[] => {
  const groups = new Map<string, DefenderGuard[]>();
  for (const guard of guards) {
    if (!matches(guard)) {
      continue;
    }
    const key = guard.safety ? "safety" : guard.group;
    groups.set(key, [...(groups.get(key) ?? []), guard]);
  }
  const rank = (key: string) => {
    const index = GROUP_ORDER.indexOf(key);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([group, list]) => ({
      group,
      guards: [...list].sort((a, b) => a.id.localeCompare(b.id)),
    }));
};

const HEAT_GUARD_TITLES: Record<string, string> = {
  cool_mode_restore: "Mode restore",
  cooler_intent_fast_lane: "Intent fast lane",
  cooling_runway: "Warm-up runway",
};

/** The readable name of a guard id: `comfort_sync` becomes `Comfort sync`. */
export const guardTitle = (
  id: string,
  direction: DefenderDirection = "cool"
): string => {
  if (direction === "heat" && HEAT_GUARD_TITLES[id]) {
    return HEAT_GUARD_TITLES[id];
  }
  return readableName(id);
};

/**
 * A raw engine name as a tidy sentence-case phrase: separators and camel case
 * become spaces, and the first letter is a capital. `comfort_sync`,
 * `comfort-sync` and `comfortSync` all become `Comfort sync`.
 */
export const readableName = (raw: string): string => {
  const text = String(raw ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.\s]+/g, " ")
    .trim()
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** What a logged command set, as text: a number as written, a word tidied. */
export const commandValueText = (value: unknown): string => {
  if (typeof value === "number") {
    return String(value);
  }
  const text = String(value ?? "");
  return /^-?\d+(\.\d+)?$/.test(text) ? text : readableName(text).toLowerCase();
};

/** Hours with one decimal as a short text, such as `1.5 h`. */
export const formatHours = (seconds: number): string =>
  `${(Math.round((seconds / 3600) * 10) / 10).toString()} h`;

/** Whole hours and minutes of a duration in seconds. */
export const splitDuration = (
  seconds: number
): { hours: number; minutes: number } => {
  const total = Math.max(0, Math.round(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
};

/** True while the defender stands down because of a pause or a stop. */
export const isStandingDown = (state: string): boolean =>
  state === "paused" || state === "stopped";

/** The reason after the colon-free guard prefix of a logged command line. */
export const commandReason = (message: string): string => {
  const match = /\((.*)\)\s*$/.exec(message);
  const text = match ? match[1] : message;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The label of the logged action, such as `set hvac mode off`. */
export const commandAction = (entry: DefenderLogEntry): string => {
  const action = readableName(String(entry.values.action ?? ""));
  const value = entry.values.value;
  return value === undefined || value === null
    ? action
    : `${action} ${commandValueText(value)}`;
};

export interface DefenderLogLine {
  key: string;
  values: Record<string, string>;
}

const SAFETY_CODES = new Set(["floor_reached", "too_hot"]);

/**
 * The translation key and values of one shared log line. Safety lines and the
 * Plain log option use the plain wording, everything else the sibling voices.
 */
export const defenderLogLine = (
  entry: DefenderLogEntry,
  plain: boolean
): DefenderLogLine | undefined => {
  const code = entry.values.code;
  if (entry.kind !== "handover" || !code) {
    return undefined;
  }
  const numbers = entry.values.values ?? {};
  const fmt = (value?: number) =>
    value === undefined ? "?" : value.toFixed(1);
  const voice = plain || SAFETY_CODES.has(code) || entry.values.plain === true;
  return {
    key: `ui.panel.config.defenders.log.${voice ? "plain" : "voice"}.${code}`,
    values: {
      room: fmt(numbers.room),
      low: fmt(numbers.low),
      high: fmt(numbers.high),
    },
  };
};

/** True when turning a guard off needs the two-key confirmation. */
export const needsConfirmationToDisable = (guard: DefenderGuard): boolean =>
  guard.safety && guard.enabled;

const BAND_CODES = ["band_crossed", "band_too_narrow", "band_under_floor"];

/**
 * The block key, under `ui.panel.config.defenders.`, of the plain message for a
 * rejected temperature or floor, or `undefined` when the error is not about the
 * shared band.
 */
export const bandErrorKey = (
  message: string | undefined
): string | undefined => {
  const code = BAND_CODES.find((candidate) => message?.includes(candidate));
  return code ? `band.${code.slice("band_".length)}` : undefined;
};

export interface SiblingRow {
  /** Block key of the sibling's name. */
  nameKey: string;
  /** Block key of its state word. */
  stateKey: string;
  paused: boolean;
  /** The temperature it holds, or `undefined` when it keeps the heat off. */
  temperature: number | undefined;
}

/** What the compact row for the other defender shows. */
export const siblingRow = (sibling: DefenderSibling): SiblingRow => ({
  nameKey: `sibling.${sibling.role}`,
  stateKey: `state.${sibling.state}`,
  paused: sibling.paused,
  temperature:
    sibling.role === "ac" || sibling.heat_mode === "cap"
      ? sibling.my_temperature
      : undefined,
});

type ReasonTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

const upperFirst = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The reason in the viewer's language from its code and values, with the plain
 * English text of the engine as the fallback for a code the page cannot word.
 * `translate` takes a key under `ui.panel.config.defenders.reason.` and returns
 * an empty string when the key is missing.
 */
export const describeReason = (
  parts: DefenderReasonParts | null | undefined,
  fallback: string,
  translate: ReasonTranslate
): string => {
  if (!parts) {
    return fallback;
  }
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(parts.params)) {
    values[name] =
      typeof value === "object"
        ? describeReason(value, "", translate)
        : typeof value === "number"
          ? value.toFixed(1)
          : value;
  }
  const text = translate(`reason.${parts.code}`, values);
  return text || fallback;
};

/** A sentence with a capital first letter, as the page shows reasons. */
export const sentenceCase = upperFirst;

/** Guards whose one-line description differs for the heating direction. */
export const HEAT_GUARD_DESCRIPTIONS: ReadonlySet<string> = new Set([
  "hot_room_override",
  "cool_mode_restore",
  "cooler_intent_fast_lane",
  "cooling_runway",
]);

/** The block key, under `ui.panel.config.defenders.`, of a guard's description. */
export const guardDescriptionKey = (
  id: string,
  direction: DefenderDirection
): string =>
  direction === "heat" && HEAT_GUARD_DESCRIPTIONS.has(id)
    ? `guard_desc_heat.${id}`
    : `guard_desc.${id}`;

/** The page of the other defender for the same unit, with its entry selected. */
export const siblingPath = (sibling: DefenderSibling): string =>
  `${sibling.role === "ac" ? "/config/ac-defender" : "/config/heat-defender"}?entry=${sibling.entry_id}`;

/** The block key of the label of the third tab, which is not about savings. */
export const usageTabKey = (direction: DefenderDirection): string =>
  `tabs.usage_${direction}`;
