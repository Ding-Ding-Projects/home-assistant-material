import type { AutomationEditorMap } from "../types";
import { entry, behavior, holdFor } from "../helpers";

/** Generated from the condition descriptions of the openings integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_OPENINGS: AutomationEditorMap = {
  "cover.awning_is_closed": entry(
    "condition",
    "cover.awning_is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "awning" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.awning_is_open": entry(
    "condition",
    "cover.awning_is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "awning" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.blind_is_closed": entry(
    "condition",
    "cover.blind_is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "blind" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.blind_is_open": entry(
    "condition",
    "cover.blind_is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "blind" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.curtain_is_closed": entry(
    "condition",
    "cover.curtain_is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "curtain" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.curtain_is_open": entry(
    "condition",
    "cover.curtain_is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "curtain" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shade_is_closed": entry(
    "condition",
    "cover.shade_is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "shade" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shade_is_open": entry(
    "condition",
    "cover.shade_is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "shade" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shutter_is_closed": entry(
    "condition",
    "cover.shutter_is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "shutter" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shutter_is_open": entry(
    "condition",
    "cover.shutter_is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "shutter" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "door.is_closed": entry(
    "condition",
    "door.is_closed",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "door" },
        { domain: "cover", device_class: "door" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "door.is_open": entry(
    "condition",
    "door.is_open",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "door" },
        { domain: "cover", device_class: "door" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "garage_door.is_closed": entry(
    "condition",
    "garage_door.is_closed",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "garage_door" },
        { domain: "cover", device_class: "garage" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "garage_door.is_open": entry(
    "condition",
    "garage_door.is_open",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "garage_door" },
        { domain: "cover", device_class: "garage" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "gate.is_closed": entry(
    "condition",
    "gate.is_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "gate" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "gate.is_open": entry(
    "condition",
    "gate.is_open",
    "openings",
    { entity: [{ domain: "cover", device_class: "gate" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.is_jammed": entry(
    "condition",
    "lock.is_jammed",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.is_locked": entry(
    "condition",
    "lock.is_locked",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.is_open": entry(
    "condition",
    "lock.is_open",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.is_unlocked": entry(
    "condition",
    "lock.is_unlocked",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "valve.is_open": entry(
    "condition",
    "valve.is_open",
    "openings",
    { entity: [{ domain: "valve" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "valve.is_closed": entry(
    "condition",
    "valve.is_closed",
    "openings",
    { entity: [{ domain: "valve" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "window.is_closed": entry(
    "condition",
    "window.is_closed",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "window" },
        { domain: "cover", device_class: "window" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "window.is_open": entry(
    "condition",
    "window.is_open",
    "openings",
    {
      entity: [
        { domain: "binary_sensor", device_class: "window" },
        { domain: "cover", device_class: "window" },
      ],
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
};
