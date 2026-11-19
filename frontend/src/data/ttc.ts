import type { HomeAssistant } from "../types";

/** The short route status the integration derives from the agency's alerts. */
export type TtcRouteStatus =
  "regular" | "slow" | "delay" | "detour" | "reduced_service" | "no_service";

export type TtcAlertKind = "route" | "elevator" | "escalator" | "general";

/** One alert, with the agency's own text in `text`, as written. */
export interface TtcAlert {
  id: string;
  kind: TtcAlertKind;
  routes: string[];
  route_type: string | null;
  status: TtcRouteStatus | null;
  effect: string | null;
  effect_description: string | null;
  severity: string | null;
  alert_type: string | null;
  cause: string | null;
  text: string;
  direction: string | null;
  stop_start: string | null;
  stop_end: string | null;
  station: string | null;
  equipment: string | null;
  last_updated: string | null;
  start: string | null;
  end: string | null;
}

/** One predicted arrival or departure. Always a prediction, never a timetable. */
export interface TtcDeparture {
  route: string;
  route_title: string;
  direction: string;
  time: string;
  seconds: number;
  trip: string | null;
  vehicle: string | null;
  is_departure: boolean;
  affected_by_layover: boolean;
}

export interface TtcFeedState {
  read_at: string | null;
  fresh: boolean;
  last_error: "refused" | "malformed" | "unreachable" | null;
  failures: number;
  next_attempt: string | null;
}

export interface TtcRoute {
  route: string;
  name: string;
  subway: boolean;
  status: TtcRouteStatus | null;
  alerts: TtcAlert[];
}

export interface TtcStation {
  station: string;
  known: boolean;
  step_free: boolean | null;
  elevators: TtcAlert[];
  escalators: TtcAlert[];
}

export interface TtcStop {
  stop: string;
  title: string | null;
  read_at: string | null;
  fresh: boolean;
  departures: TtcDeparture[];
  idle_routes: string[];
}

export interface TtcOverview {
  entry_id: string;
  attribution: string;
  now: string;
  watch: { alerts: boolean; lifts: boolean; departures: boolean };
  feeds: Partial<Record<"alerts" | "lifts" | "departures", TtcFeedState>>;
  routes: TtcRoute[];
  stations: TtcStation[];
  stops: TtcStop[];
  alerts: TtcAlert[];
  alerts_read_at: string | null;
}

export const fetchTtcOverview = (hass: HomeAssistant) =>
  hass.callWS<TtcOverview>({ type: "ttc/overview" });

/** Line colours the agency uses on its maps; surface routes are red. */
export const TTC_LINE_COLORS: Record<string, { bg: string; fg: string }> = {
  "1": { bg: "#FFCC29", fg: "#14161B" },
  "2": { bg: "#00A54F", fg: "#FFFFFF" },
  "4": { bg: "#A21A68", fg: "#FFFFFF" },
  "5": { bg: "#F37021", fg: "#FFFFFF" },
  "6": { bg: "#969594", fg: "#14161B" },
};

export const TTC_SURFACE_COLOR = { bg: "#D5281E", fg: "#FFFFFF" };

export const ttcRouteColor = (route: string) =>
  TTC_LINE_COLORS[route] ?? TTC_SURFACE_COLOR;

/** Ordered from least to most severe, matching the integration. */
export const TTC_STATUS_ORDER: TtcRouteStatus[] = [
  "regular",
  "slow",
  "delay",
  "detour",
  "reduced_service",
  "no_service",
];

export const ttcStatusTone = (
  status: TtcRouteStatus | null
): "good" | "warn" | "bad" | "unknown" => {
  if (!status) {
    return "unknown";
  }
  if (status === "regular") {
    return "good";
  }
  if (status === "slow" || status === "detour") {
    return "warn";
  }
  return "bad";
};

/** Upcoming departures at a stop, in time order, optionally for one route. */
export const ttcUpcoming = (
  stop: TtcStop,
  now: number,
  route?: string
): TtcDeparture[] =>
  stop.departures
    .filter(
      (item) =>
        new Date(item.time).getTime() >= now && (!route || item.route === route)
    )
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

/** Whole minutes from `now` until `time`, never below zero. */
export const ttcMinutesUntil = (time: string, now: number): number =>
  Math.max(0, Math.floor((new Date(time).getTime() - now) / 60000));

/** A 24-hour clock time, as the boards draw every time. */
export const ttcClock = (
  iso: string | null,
  locale: string,
  timeZone?: string,
  seconds = false
): string => {
  if (!iso) {
    return "";
  }
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hourCycle: "h23",
    timeZone,
  });
};
