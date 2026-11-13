import type { HassEntities } from "home-assistant-js-websocket";
import type { EntityRegistryDisplayEntry } from "../../data/entity/entity_registry";
import type { KnownOption } from "./known-options";

// Reverse the integration's SENSIBO_TO_HA map, excluding off. Core switches
// power through the separate `on` key rather than sending mode="off".
// Source: core/homeassistant/components/sensibo/climate.py.
const RAW_OPERATING_MODES: Readonly<Record<string, string>> = {
  cool: "cool",
  heat: "heat",
  fan_only: "fan",
  heat_cool: "auto",
  dry: "dry",
};

/**
 * Resolve common raw operating modes from already-resolved action targets.
 * No requests are made. Missing identity or capability data establishes no
 * common choices; known non-applicable targets do not constrain the result.
 * Call again when targets, registry identity, or hvac_modes changes. This does
 * not infer mode-dependent temperature/fan/swing lists from the current state.
 */
export const sensiboClimateReactOptions = (
  action: string | undefined,
  field: string | undefined,
  entityIds: readonly string[] | undefined,
  states: HassEntities,
  entities: Readonly<
    Record<string, Pick<EntityRegistryDisplayEntry, "platform">>
  >
): KnownOption[] => {
  if (
    action !== "sensibo.enable_climate_react" ||
    (field !== "high_temperature_state" && field !== "low_temperature_state") ||
    !entityIds?.length
  ) {
    return [];
  }
  const lists: string[][] = [];
  for (const id of new Set(entityIds)) {
    if (!id.startsWith("climate.")) continue;
    const platform = entities[id]?.platform;
    if (!platform) return [];
    if (platform !== "sensibo") continue;
    const modes: unknown = states[id]?.attributes.hvac_modes;
    if (
      !Array.isArray(modes) ||
      !modes.every((mode) => typeof mode === "string")
    ) {
      return [];
    }
    lists.push([
      ...new Set(
        modes.flatMap((mode) =>
          Object.prototype.hasOwnProperty.call(RAW_OPERATING_MODES, mode)
            ? [RAW_OPERATING_MODES[mode]]
            : []
        )
      ),
    ]);
  }
  if (!lists.length) return [];
  const common = lists[0].filter((mode) =>
    lists.every((list) => list.includes(mode))
  );
  return common.length
    ? [
        {
          key: "mode",
          source: "declared",
          kind: { type: "choice", choices: common.map((value) => ({ value })) },
        },
      ]
    : [];
};
