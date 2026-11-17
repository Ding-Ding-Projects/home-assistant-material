/**
 * Device health, worked out only from data the interface already holds: the
 * device and entity registries, the area registry and the current states.
 * Nothing here calls the server and nothing is guessed: a device that gives no
 * evidence either way is reported as "does not report health".
 */

export type HealthFilter = "low_battery" | "silent" | "weak_signal" | "healthy";

export const HEALTH_FILTERS: readonly HealthFilter[] = [
  "low_battery",
  "silent",
  "weak_signal",
  "healthy",
];

/** A battery at or under this percentage counts as low. */
export const LOW_BATTERY_PERCENT = 20;

/** A device with no fresh reading for this long counts as silent. */
export const SILENT_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Signal thresholds, per unit. A signal is weak at or under the limit.
 *
 * - dBm and dB (Wi-Fi, Bluetooth and radio RSSI): -80 is the point where
 *   links start to drop packets; -70 is still usable, so it is not flagged.
 * - lqi (Zigbee style link quality, 0 to 255): 50 is about a fifth of the
 *   range, where messages are regularly retried.
 * - percent (a signal or link quality given as a percentage): 25 percent.
 */
export const WEAK_SIGNAL_DBM = -80;
export const WEAK_SIGNAL_LQI = 50;
export const WEAK_SIGNAL_PERCENT = 25;

export interface HealthStateObject {
  state: string;
  last_changed?: string;
  last_updated: string;
  attributes: Record<string, unknown>;
}

export interface HealthDevice {
  id: string;
  name: string | null;
  name_by_user?: string | null;
  area_id: string | null;
  disabled_by?: string | null;
}

export interface HealthEntity {
  entity_id: string;
  device_id?: string | null;
  entity_category?: string | null;
}

export interface HealthInput {
  devices: Record<string, HealthDevice>;
  entities: Record<string, HealthEntity>;
  states: Record<string, HealthStateObject | undefined>;
  areas: Record<string, { name: string } | undefined>;
  now: number;
  /** The name to show for a device without a name of its own. */
  fallbackName?: string;
}

export type SignalKind = "dbm" | "lqi" | "percent";

export interface DeviceHealth {
  deviceId: string;
  name: string;
  area?: string;
  lowBattery: boolean;
  silent: boolean;
  weakSignal: boolean;
  /** Healthy: some evidence of health exists and nothing is wrong. */
  healthy: boolean;
  /** No source of health at all; never guessed at. */
  noHealth: boolean;
  /** The lowest battery percentage, when a battery sensor reports one. */
  batteryLevel?: number;
  /** The entity whose statistics can estimate the battery life. */
  batteryEntityId?: string;
  /** The battery says it is low without giving a level. */
  batteryFlagOnly: boolean;
  /** The time of the newest reading while silent, in milliseconds. */
  silentSince?: number;
  signalValue?: number;
  signalKind?: SignalKind;
}

const numeric = (state: string | undefined): number | undefined => {
  if (state === undefined || state === "" || state === "unknown") {
    return undefined;
  }
  const value = Number(state);
  return Number.isFinite(value) ? value : undefined;
};

const isUnavailable = (state: HealthStateObject | undefined): boolean =>
  !state || state.state === "unavailable";

const attr = (state: HealthStateObject, key: string): unknown =>
  state.attributes?.[key];

const domainOf = (entityId: string): string => entityId.split(".")[0];

const LINK_QUALITY_ID = /(link_?quality|_lqi$)/;

/** The kind of signal reading an entity gives, when it gives one at all. */
const signalKindOf = (
  entityId: string,
  state: HealthStateObject
): SignalKind | undefined => {
  if (domainOf(entityId) !== "sensor") {
    return undefined;
  }
  const deviceClass = attr(state, "device_class");
  const unit = String(attr(state, "unit_of_measurement") ?? "").toLowerCase();
  const looksLikeLink = LINK_QUALITY_ID.test(entityId);
  if (deviceClass !== "signal_strength" && !looksLikeLink) {
    return undefined;
  }
  if (unit === "dbm" || unit === "db") {
    return "dbm";
  }
  if (unit === "lqi") {
    return "lqi";
  }
  if (unit === "%") {
    return "percent";
  }
  // A link quality sensor without a unit is the 0 to 255 scale.
  return looksLikeLink ? "lqi" : undefined;
};

const isWeak = (kind: SignalKind, value: number): boolean => {
  switch (kind) {
    case "dbm":
      return value <= WEAK_SIGNAL_DBM;
    case "lqi":
      return value <= WEAK_SIGNAL_LQI;
    default:
      return value <= WEAK_SIGNAL_PERCENT;
  }
};

/** How far a weak signal is below its limit, as a 0 to 1 badness, for sorting. */
const signalBadness = (kind: SignalKind, value: number): number => {
  switch (kind) {
    case "dbm":
      return (WEAK_SIGNAL_DBM - value) / 40;
    case "lqi":
      return (WEAK_SIGNAL_LQI - value) / 255;
    default:
      return (WEAK_SIGNAL_PERCENT - value) / 100;
  }
};

export const classifyDevices = (input: HealthInput): DeviceHealth[] => {
  const byDevice = new Map<string, HealthEntity[]>();
  for (const entity of Object.values(input.entities)) {
    if (!entity.device_id) {
      continue;
    }
    const list = byDevice.get(entity.device_id) ?? [];
    list.push(entity);
    byDevice.set(entity.device_id, list);
  }

  const result: DeviceHealth[] = [];
  for (const device of Object.values(input.devices)) {
    if (device.disabled_by) {
      continue;
    }
    const entities = byDevice.get(device.id) ?? [];

    let batteryLevel: number | undefined;
    let batteryEntityId: string | undefined;
    let batteryFlagOnly = false;
    let batteryKnown = false;
    let signalValue: number | undefined;
    let signalKind: SignalKind | undefined;
    // Entities that carry the device's own readings (not diagnostics).
    let primaryCount = 0;
    let primaryAvailable = 0;
    let newestPrimary = 0;
    // Sensors that normally update, for the "no fresh reading" rule.
    let updatingCount = 0;
    let newestUpdating = 0;

    for (const entity of entities) {
      const state = input.states[entity.entity_id];
      if (!state) {
        continue;
      }
      const domain = domainOf(entity.entity_id);
      const deviceClass = attr(state, "device_class");

      if (domain === "sensor" && deviceClass === "battery") {
        const value = numeric(state.state);
        if (value !== undefined) {
          batteryKnown = true;
          if (batteryLevel === undefined || value < batteryLevel) {
            batteryLevel = value;
            batteryEntityId = entity.entity_id;
          }
        }
      } else if (domain === "binary_sensor" && deviceClass === "battery") {
        if (state.state === "on") {
          batteryKnown = true;
          batteryFlagOnly = true;
        } else if (state.state === "off") {
          batteryKnown = true;
        }
      }

      const kind = signalKindOf(entity.entity_id, state);
      if (kind) {
        const value = numeric(state.state);
        if (value !== undefined) {
          const worse =
            signalValue === undefined ||
            signalKind === undefined ||
            signalBadness(kind, value) > signalBadness(signalKind, signalValue);
          if (worse) {
            signalValue = value;
            signalKind = kind;
          }
        }
      }

      if (entity.entity_category) {
        continue;
      }
      primaryCount++;
      const updated = Date.parse(state.last_updated) || 0;
      newestPrimary = Math.max(newestPrimary, updated);
      if (!isUnavailable(state)) {
        primaryAvailable++;
      }
      if (
        domain === "sensor" &&
        deviceClass !== "battery" &&
        attr(state, "state_class") === "measurement"
      ) {
        updatingCount++;
        newestUpdating = Math.max(newestUpdating, updated);
      }
    }

    const lowBattery =
      (batteryLevel !== undefined && batteryLevel <= LOW_BATTERY_PERCENT) ||
      batteryFlagOnly;
    const weakSignal =
      signalValue !== undefined &&
      signalKind !== undefined &&
      isWeak(signalKind, signalValue);

    let silent = false;
    let silentSince: number | undefined;
    if (primaryCount > 0 && primaryAvailable === 0) {
      silent = true;
      silentSince = newestPrimary || undefined;
    } else if (
      updatingCount > 0 &&
      input.now - newestUpdating > SILENT_AFTER_MS
    ) {
      silent = true;
      silentSince = newestUpdating;
    }

    const hasSource =
      batteryKnown || signalValue !== undefined || primaryCount > 0;
    const anyIssue = lowBattery || silent || weakSignal;

    result.push({
      deviceId: device.id,
      name:
        (device.name_by_user || device.name || "").trim() ||
        input.fallbackName ||
        device.id,
      area: device.area_id ? input.areas[device.area_id]?.name : undefined,
      lowBattery,
      silent,
      weakSignal,
      healthy: hasSource && !anyIssue,
      noHealth: !hasSource,
      batteryLevel,
      batteryEntityId,
      batteryFlagOnly: batteryFlagOnly && batteryLevel === undefined,
      silentSince,
      signalValue,
      signalKind,
    });
  }
  return sortWorstFirst(result);
};

/** Lower numbers are worse. */
const rank = (item: DeviceHealth): number => {
  if (item.silent) {
    return 0;
  }
  if (item.lowBattery) {
    return 1;
  }
  if (item.weakSignal) {
    return 2;
  }
  if (item.healthy) {
    return 3;
  }
  return 4;
};

const detail = (item: DeviceHealth): number => {
  switch (rank(item)) {
    case 0:
      // Silent the longest comes first.
      return item.silentSince ?? 0;
    case 1:
      return item.batteryLevel ?? -1;
    case 2:
      return item.signalValue !== undefined && item.signalKind
        ? -signalBadness(item.signalKind, item.signalValue)
        : 0;
    default:
      return 0;
  }
};

export const sortWorstFirst = (items: DeviceHealth[]): DeviceHealth[] =>
  items
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        detail(a) - detail(b) ||
        a.name.localeCompare(b.name)
    );

export interface HealthCounts {
  low_battery: number;
  silent: number;
  weak_signal: number;
  healthy: number;
  /** Devices with at least one problem. */
  attention: number;
  noHealth: number;
}

export const countHealth = (items: DeviceHealth[]): HealthCounts => {
  const counts: HealthCounts = {
    low_battery: 0,
    silent: 0,
    weak_signal: 0,
    healthy: 0,
    attention: 0,
    noHealth: 0,
  };
  for (const item of items) {
    if (item.lowBattery) {
      counts.low_battery++;
    }
    if (item.silent) {
      counts.silent++;
    }
    if (item.weakSignal) {
      counts.weak_signal++;
    }
    if (item.healthy) {
      counts.healthy++;
    }
    if (item.lowBattery || item.silent || item.weakSignal) {
      counts.attention++;
    }
    if (item.noHealth) {
      counts.noHealth++;
    }
  }
  return counts;
};

export const matchesFilter = (
  item: DeviceHealth,
  filter: HealthFilter | undefined
): boolean => {
  switch (filter) {
    case "low_battery":
      return item.lowBattery;
    case "silent":
      return item.silent;
    case "weak_signal":
      return item.weakSignal;
    case "healthy":
      return item.healthy;
    default:
      return true;
  }
};

export const filterDevices = (
  items: DeviceHealth[],
  filter: HealthFilter | undefined
): DeviceHealth[] => items.filter((item) => matchesFilter(item, filter));

/** Pressing the active tile again clears the filter. */
export const toggleFilter = (
  current: HealthFilter | undefined,
  pressed: HealthFilter
): HealthFilter | undefined => (current === pressed ? undefined : pressed);

export interface DailyPoint {
  /** Start of the day, in milliseconds. */
  start: number;
  mean: number | null | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days of battery left, from daily average levels that were already recorded.
 * Returns undefined unless the record shows a steady fall over at least three
 * days; a flat, rising or too short record gives no estimate.
 */
export const estimateDaysLeft = (
  points: DailyPoint[],
  currentLevel: number
): number | undefined => {
  const usable = points
    .filter((point) => typeof point.mean === "number")
    .sort((a, b) => a.start - b.start) as { start: number; mean: number }[];
  if (usable.length < 3) {
    return undefined;
  }
  const first = usable[0];
  const last = usable[usable.length - 1];
  const days = (last.start - first.start) / DAY_MS;
  if (days < 3) {
    return undefined;
  }
  const fallPerDay = (first.mean - last.mean) / days;
  // Under a tenth of a percent a day is noise, not a trend.
  if (fallPerDay < 0.1 || currentLevel <= 0) {
    return undefined;
  }
  const left = currentLevel / fallPerDay;
  if (!Number.isFinite(left) || left > 365) {
    return undefined;
  }
  return Math.max(1, Math.round(left));
};
