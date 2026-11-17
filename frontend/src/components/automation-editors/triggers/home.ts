import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  offset,
  threshold,
  stateChoice,
  durationField,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the trigger descriptions of the home integrations: one entry per `domain.trigger`. */
export const TRIGGER_EDITORS_HOME: AutomationEditorMap = {
  "alarm_control_panel.armed": entry(
    "trigger",
    "alarm_control_panel.armed",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.armed_away": entry(
    "trigger",
    "alarm_control_panel.armed_away",
    "home",
    {
      entity: {
        domain: "alarm_control_panel",
        supported_features: [
          "alarm_control_panel.AlarmControlPanelEntityFeature.ARM_AWAY",
        ],
      },
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.armed_home": entry(
    "trigger",
    "alarm_control_panel.armed_home",
    "home",
    {
      entity: {
        domain: "alarm_control_panel",
        supported_features: [
          "alarm_control_panel.AlarmControlPanelEntityFeature.ARM_HOME",
        ],
      },
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.armed_night": entry(
    "trigger",
    "alarm_control_panel.armed_night",
    "home",
    {
      entity: {
        domain: "alarm_control_panel",
        supported_features: [
          "alarm_control_panel.AlarmControlPanelEntityFeature.ARM_NIGHT",
        ],
      },
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.armed_vacation": entry(
    "trigger",
    "alarm_control_panel.armed_vacation",
    "home",
    {
      entity: {
        domain: "alarm_control_panel",
        supported_features: [
          "alarm_control_panel.AlarmControlPanelEntityFeature.ARM_VACATION",
        ],
      },
    },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.disarmed": entry(
    "trigger",
    "alarm_control_panel.disarmed",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.triggered": entry(
    "trigger",
    "alarm_control_panel.triggered",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "button.pressed": entry(
    "trigger",
    "button.pressed",
    "home",
    { entity: [{ domain: "button" }, { domain: "input_button" }] },
    (_ctx) => [],
    []
  ),
  "calendar.event_started": entry(
    "trigger",
    "calendar.event_started",
    "home",
    { entity: { domain: "calendar" } },
    (ctx) => [offset(ctx)],
    []
  ),
  "calendar.event_ended": entry(
    "trigger",
    "calendar.event_ended",
    "home",
    { entity: { domain: "calendar" } },
    (ctx) => [offset(ctx)],
    []
  ),
  "counter.incremented": entry(
    "trigger",
    "counter.incremented",
    "home",
    { entity: { domain: "counter" } },
    (_ctx) => [],
    []
  ),
  "counter.decremented": entry(
    "trigger",
    "counter.decremented",
    "home",
    { entity: { domain: "counter" } },
    (_ctx) => [],
    []
  ),
  "counter.maximum_reached": entry(
    "trigger",
    "counter.maximum_reached",
    "home",
    { entity: { domain: "counter" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "counter.minimum_reached": entry(
    "trigger",
    "counter.minimum_reached",
    "home",
    { entity: { domain: "counter" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "counter.reset": entry(
    "trigger",
    "counter.reset",
    "home",
    { entity: { domain: "counter" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "event.received": entry(
    "trigger",
    "event.received",
    "home",
    { entity: { domain: "event" } },
    (ctx) => [
      stateChoice(ctx, "event_type", L("event__event_type"), "event_type"),
    ],
    []
  ),
  "lawn_mower.returned_to_dock": entry(
    "trigger",
    "lawn_mower.returned_to_dock",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.errored": entry(
    "trigger",
    "lawn_mower.errored",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.paused_mowing": entry(
    "trigger",
    "lawn_mower.paused_mowing",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.started_mowing": entry(
    "trigger",
    "lawn_mower.started_mowing",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.started_returning": entry(
    "trigger",
    "lawn_mower.started_returning",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.became_idle": entry(
    "trigger",
    "lawn_mower.became_idle",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.turned_on": entry(
    "trigger",
    "light.turned_on",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.turned_off": entry(
    "trigger",
    "light.turned_off",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.brightness_changed": entry(
    "trigger",
    "light.brightness_changed",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [threshold(ctx, T.lightNumberChanged)],
    []
  ),
  "light.brightness_crossed_threshold": entry(
    "trigger",
    "light.brightness_crossed_threshold",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [
      behavior(ctx),
      threshold(ctx, T.lightNumberCrossed),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "scene.activated": entry(
    "trigger",
    "scene.activated",
    "home",
    { entity: { domain: "scene" } },
    (_ctx) => [],
    []
  ),
  "schedule.block_ended": entry(
    "trigger",
    "schedule.block_ended",
    "home",
    { entity: { domain: "schedule" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "schedule.block_started": entry(
    "trigger",
    "schedule.block_started",
    "home",
    { entity: { domain: "schedule" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "select.selection_changed": entry(
    "trigger",
    "select.selection_changed",
    "home",
    { entity: [{ domain: "select" }, { domain: "input_select" }] },
    (_ctx) => [],
    []
  ),
  "siren.turned_off": entry(
    "trigger",
    "siren.turned_off",
    "home",
    { entity: { domain: "siren" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "siren.turned_on": entry(
    "trigger",
    "siren.turned_on",
    "home",
    { entity: { domain: "siren" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "switch.turned_off": entry(
    "trigger",
    "switch.turned_off",
    "home",
    { entity: [{ domain: "switch" }, { domain: "input_boolean" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "switch.turned_on": entry(
    "trigger",
    "switch.turned_on",
    "home",
    { entity: [{ domain: "switch" }, { domain: "input_boolean" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "text.changed": entry(
    "trigger",
    "text.changed",
    "home",
    { entity: { domain: ["text", "input_text"] } },
    (_ctx) => [],
    []
  ),
  "timer.cancelled": entry(
    "trigger",
    "timer.cancelled",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.finished": entry(
    "trigger",
    "timer.finished",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.paused": entry(
    "trigger",
    "timer.paused",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.restarted": entry(
    "trigger",
    "timer.restarted",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.started": entry(
    "trigger",
    "timer.started",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.remaining_time_reached": entry(
    "trigger",
    "timer.remaining_time_reached",
    "home",
    { entity: { domain: "timer" } },
    (ctx) => [durationField(ctx, "remaining", L("timer__remaining"))],
    []
  ),
  "todo.item_added": entry(
    "trigger",
    "todo.item_added",
    "home",
    { entity: { domain: "todo" } },
    (_ctx) => [],
    []
  ),
  "todo.item_completed": entry(
    "trigger",
    "todo.item_completed",
    "home",
    { entity: { domain: "todo" } },
    (_ctx) => [],
    []
  ),
  "todo.item_removed": entry(
    "trigger",
    "todo.item_removed",
    "home",
    { entity: { domain: "todo" } },
    (_ctx) => [],
    []
  ),
  "update.became_available": entry(
    "trigger",
    "update.became_available",
    "home",
    { entity: { domain: "update" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.returned_to_dock": entry(
    "trigger",
    "vacuum.returned_to_dock",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.errored": entry(
    "trigger",
    "vacuum.errored",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.paused_cleaning": entry(
    "trigger",
    "vacuum.paused_cleaning",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.started_cleaning": entry(
    "trigger",
    "vacuum.started_cleaning",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.started_returning": entry(
    "trigger",
    "vacuum.started_returning",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
};
