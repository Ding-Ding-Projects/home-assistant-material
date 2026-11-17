import type { AutomationEditorMap } from "../types";
import { entry, behavior, holdFor } from "../helpers";

/** Generated from the trigger descriptions of the openings integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_OPENINGS: AutomationEditorMap = {
  "cover.awning_closed": entry(
    "trigger",
    "cover.awning_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "awning" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.awning_opened": entry(
    "trigger",
    "cover.awning_opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "awning" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.blind_closed": entry(
    "trigger",
    "cover.blind_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "blind" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.blind_opened": entry(
    "trigger",
    "cover.blind_opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "blind" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.curtain_closed": entry(
    "trigger",
    "cover.curtain_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "curtain" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.curtain_opened": entry(
    "trigger",
    "cover.curtain_opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "curtain" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shade_closed": entry(
    "trigger",
    "cover.shade_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "shade" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shade_opened": entry(
    "trigger",
    "cover.shade_opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "shade" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shutter_closed": entry(
    "trigger",
    "cover.shutter_closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "shutter" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "cover.shutter_opened": entry(
    "trigger",
    "cover.shutter_opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "shutter" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "door.closed": entry(
    "trigger",
    "door.closed",
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
  "door.opened": entry(
    "trigger",
    "door.opened",
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
  "garage_door.closed": entry(
    "trigger",
    "garage_door.closed",
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
  "garage_door.opened": entry(
    "trigger",
    "garage_door.opened",
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
  "gate.closed": entry(
    "trigger",
    "gate.closed",
    "openings",
    { entity: [{ domain: "cover", device_class: "gate" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "gate.opened": entry(
    "trigger",
    "gate.opened",
    "openings",
    { entity: [{ domain: "cover", device_class: "gate" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.jammed": entry(
    "trigger",
    "lock.jammed",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.locked": entry(
    "trigger",
    "lock.locked",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.opened": entry(
    "trigger",
    "lock.opened",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lock.unlocked": entry(
    "trigger",
    "lock.unlocked",
    "openings",
    { entity: { domain: "lock" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "valve.closed": entry(
    "trigger",
    "valve.closed",
    "openings",
    { entity: { domain: "valve" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "valve.opened": entry(
    "trigger",
    "valve.opened",
    "openings",
    { entity: { domain: "valve" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "window.closed": entry(
    "trigger",
    "window.closed",
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
  "window.opened": entry(
    "trigger",
    "window.opened",
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
