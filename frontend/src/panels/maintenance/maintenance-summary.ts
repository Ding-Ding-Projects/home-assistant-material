import { BINARY_STATE_ON } from "../../common/const";
import type { HomeAssistant } from "../../types";

export interface MaintenanceSummary {
  /** One representative entity id per device with a low battery. */
  lowDevices: string[];
  /** One representative entity id per device whose battery entities are all unavailable. */
  offlineDevices: string[];
  /** Unavailable problem sensors, named for what they are; never counted as devices. */
  offlineSensors: string[];
  /** One representative entity id per device with a problem reported. */
  problemDevices: string[];
  /** Devices with a known battery reading that is not low. */
  fineCount: number;
  /** Devices whose battery reading is unknown; not counted as fine. */
  unknownCount: number;
}

const groupKey = (
  entities: HomeAssistant["entities"],
  entityId: string
): string => entities[entityId]?.device_id ?? `entity:${entityId}`;

const dedupeByDevice = (
  entities: HomeAssistant["entities"],
  entityIds: string[]
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entityId of entityIds) {
    const key = groupKey(entities, entityId);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entityId);
    }
  }
  return result;
};

/**
 * Counts maintenance jobs per device rather than per entity. A device with
 * several battery or problem entities yields one row. A device is counted in
 * exactly one battery bucket: low, offline, unknown or fine.
 *
 * `lowEntityIds` is the entity-level result of the low battery filter.
 */
export const summarizeMaintenance = (
  states: HomeAssistant["states"],
  entities: HomeAssistant["entities"],
  maintenanceEntityIds: string[],
  lowEntityIds: string[]
): MaintenanceSummary => {
  const lowSet = new Set(lowEntityIds);

  const batteryByDevice = new Map<string, string[]>();
  const problemIds: string[] = [];
  const unavailableProblemIds: string[] = [];

  for (const entityId of maintenanceEntityIds) {
    const stateObj = states[entityId];
    if (!stateObj) {
      continue;
    }
    const deviceClass = stateObj.attributes?.device_class;
    if (deviceClass === "battery") {
      const key = groupKey(entities, entityId);
      const list = batteryByDevice.get(key);
      if (list) {
        list.push(entityId);
      } else {
        batteryByDevice.set(key, [entityId]);
      }
    } else if (deviceClass === "problem") {
      if (stateObj.state === "unavailable") {
        unavailableProblemIds.push(entityId);
      } else if (stateObj.state === BINARY_STATE_ON) {
        problemIds.push(entityId);
      }
    }
  }

  const lowDevices: string[] = [];
  const offlineDevices: string[] = [];
  const offlineKeys = new Set<string>();
  let fineCount = 0;
  let unknownCount = 0;

  for (const [key, ids] of batteryByDevice) {
    const low = ids.find((id) => lowSet.has(id));
    if (low) {
      lowDevices.push(low);
      continue;
    }
    if (ids.every((id) => states[id].state === "unavailable")) {
      offlineDevices.push(ids[0]);
      offlineKeys.add(key);
      continue;
    }
    const known = ids.some((id) => {
      const state = states[id].state;
      return state !== "unavailable" && state !== "unknown";
    });
    if (known) {
      fineCount++;
    } else {
      unknownCount++;
    }
  }

  // A sensor of a device already reported offline adds nothing new.
  const offlineSensors = dedupeByDevice(
    entities,
    unavailableProblemIds.filter(
      (id) => !offlineKeys.has(groupKey(entities, id))
    )
  );

  return {
    lowDevices,
    offlineDevices,
    offlineSensors,
    problemDevices: dedupeByDevice(entities, problemIds),
    fineCount,
    unknownCount,
  };
};

/** Shallow array equality, used to key memoization on the states that matter. */
export const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);
