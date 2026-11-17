import type { AutomationEditorMap } from "../types";
import { entry, L, behavior, holdFor, zoneField } from "../helpers";

/** Generated from the trigger descriptions of the presence integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_PRESENCE: AutomationEditorMap = {
  "doorbell.rang": entry(
    "trigger",
    "doorbell.rang",
    "presence",
    { entity: { domain: "event", device_class: "doorbell" } },
    (_ctx) => [],
    []
  ),
  "motion.detected": entry(
    "trigger",
    "motion.detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "motion" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "motion.cleared": entry(
    "trigger",
    "motion.cleared",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "motion" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "occupancy.detected": entry(
    "trigger",
    "occupancy.detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "occupancy" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "occupancy.cleared": entry(
    "trigger",
    "occupancy.cleared",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "occupancy" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vibration.detected": entry(
    "trigger",
    "vibration.detected",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "vibration" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vibration.cleared": entry(
    "trigger",
    "vibration.cleared",
    "presence",
    { entity: [{ domain: "binary_sensor", device_class: "vibration" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "zone.entered": entry(
    "trigger",
    "zone.entered",
    "presence",
    { entity: { domain: ["person", "device_tracker"] } },
    (ctx) => [
      behavior(ctx),
      zoneField(ctx, "zone", L("zone__zone")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "zone.left": entry(
    "trigger",
    "zone.left",
    "presence",
    { entity: { domain: ["person", "device_tracker"] } },
    (ctx) => [
      behavior(ctx),
      zoneField(ctx, "zone", L("zone__zone")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "zone.occupancy_detected": entry(
    "trigger",
    "zone.occupancy_detected",
    "presence",
    null,
    (ctx) => [zoneField(ctx, "zone", L("zone__zone")), holdFor(ctx)],
    ["for"]
  ),
  "zone.occupancy_cleared": entry(
    "trigger",
    "zone.occupancy_cleared",
    "presence",
    null,
    (ctx) => [zoneField(ctx, "zone", L("zone__zone")), holdFor(ctx)],
    ["for"]
  ),
};
