import type { HomeAssistant } from "../types";

export type DefenderDirection = "cool" | "heat";

export interface DefenderGuard {
  id: string;
  family: string;
  group: string;
  safety: boolean;
  enabled: boolean;
  settings: Record<string, string | number | boolean>;
  last_acted: string | null;
  reason: string | null;
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
  } & Record<string, unknown>;
}

export interface DefenderSibling {
  role: "ac" | "heat";
  entry_id: string;
  domain: string;
  state: string;
  reason: string;
  paused: boolean;
  my_temperature: number;
  floor: number | null;
  heat_mode: string;
}

export interface DefenderInfo {
  run_mode: DefenderDirection;
  state: string;
  reason: string;
  next_check: string | null;
  my_temperature: number;
  floor: number | null;
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

/** The readable name of a guard id: `comfort_sync` becomes `Comfort sync`. */
export const guardTitle = (id: string): string => {
  const text = id.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Hours with one decimal as a short text, such as `1.5 h`. */
export const formatHours = (seconds: number): string =>
  `${(Math.round((seconds / 3600) * 10) / 10).toString()} h`;

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
