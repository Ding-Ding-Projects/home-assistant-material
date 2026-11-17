import type { AutomationEditorMap } from "../types";
import { entry, L, behavior, holdFor, zoneField } from "../helpers";

/** Generated from the condition descriptions of the presence integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_PRESENCE: AutomationEditorMap = {
  "motion.is_detected": entry(
    "condition",
    "motion.is_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "motion" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "motion.is_not_detected": entry(
    "condition",
    "motion.is_not_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "motion" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "occupancy.is_detected": entry(
    "condition",
    "occupancy.is_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "occupancy" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "occupancy.is_not_detected": entry(
    "condition",
    "occupancy.is_not_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "occupancy" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vibration.is_detected": entry(
    "condition",
    "vibration.is_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "vibration" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vibration.is_not_detected": entry(
    "condition",
    "vibration.is_not_detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "vibration" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "zone.in_zone": entry(
    "condition",
    "zone.in_zone",
    "presence",
    { entity: { domain: ["person", "device_tracker"] } },
    (ctx) => [
      behavior(ctx),
      zoneField(ctx, "zone", L("zone__zone")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "zone.not_in_zone": entry(
    "condition",
    "zone.not_in_zone",
    "presence",
    { entity: { domain: ["person", "device_tracker"] } },
    (ctx) => [
      behavior(ctx),
      zoneField(ctx, "zone", L("zone__zone")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "zone.occupancy_is_detected": entry(
    "condition",
    "zone.occupancy_is_detected",
    "presence",
    null,
    (ctx) => [zoneField(ctx, "zone", L("zone__zone")), holdFor(ctx)],
    ["for"]
  ),
  "zone.occupancy_is_not_detected": entry(
    "condition",
    "zone.occupancy_is_not_detected",
    "presence",
    null,
    (ctx) => [zoneField(ctx, "zone", L("zone__zone")), holdFor(ctx)],
    ["for"]
  ),
};
