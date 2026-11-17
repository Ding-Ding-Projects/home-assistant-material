import type { AutomationEditorMap } from "../types";
import {
  entry,
  L,
  behavior,
  holdFor,
  threshold,
  stateChoice,
  textField,
} from "../helpers";
import * as T from "../thresholds";

/** Generated from the condition descriptions of the home integrations: one entry per `domain.condition`. */
export const CONDITION_EDITORS_HOME: AutomationEditorMap = {
  "alarm_control_panel.is_armed": entry(
    "condition",
    "alarm_control_panel.is_armed",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.is_armed_away": entry(
    "condition",
    "alarm_control_panel.is_armed_away",
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
  "alarm_control_panel.is_armed_home": entry(
    "condition",
    "alarm_control_panel.is_armed_home",
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
  "alarm_control_panel.is_armed_night": entry(
    "condition",
    "alarm_control_panel.is_armed_night",
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
  "alarm_control_panel.is_armed_vacation": entry(
    "condition",
    "alarm_control_panel.is_armed_vacation",
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
  "alarm_control_panel.is_disarmed": entry(
    "condition",
    "alarm_control_panel.is_disarmed",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "alarm_control_panel.is_triggered": entry(
    "condition",
    "alarm_control_panel.is_triggered",
    "home",
    { entity: { domain: "alarm_control_panel" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "calendar.is_event_active": entry(
    "condition",
    "calendar.is_event_active",
    "home",
    { entity: [{ domain: "calendar" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "counter.is_value": entry(
    "condition",
    "counter.is_value",
    "home",
    { entity: [{ domain: "counter" }] },
    (ctx) => [behavior(ctx), threshold(ctx, T.counterNumberIs), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_docked": entry(
    "condition",
    "lawn_mower.is_docked",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_encountering_an_error": entry(
    "condition",
    "lawn_mower.is_encountering_an_error",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_idle": entry(
    "condition",
    "lawn_mower.is_idle",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_mowing": entry(
    "condition",
    "lawn_mower.is_mowing",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_paused": entry(
    "condition",
    "lawn_mower.is_paused",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "lawn_mower.is_returning": entry(
    "condition",
    "lawn_mower.is_returning",
    "home",
    { entity: { domain: "lawn_mower" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.is_off": entry(
    "condition",
    "light.is_off",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.is_on": entry(
    "condition",
    "light.is_on",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "light.is_brightness": entry(
    "condition",
    "light.is_brightness",
    "home",
    { entity: { domain: "light" } },
    (ctx) => [behavior(ctx), threshold(ctx, T.lightNumberIs), holdFor(ctx)],
    ["for"]
  ),
  "schedule.is_off": entry(
    "condition",
    "schedule.is_off",
    "home",
    { entity: { domain: "schedule" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "schedule.is_on": entry(
    "condition",
    "schedule.is_on",
    "home",
    { entity: { domain: "schedule" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "select.is_option_selected": entry(
    "condition",
    "select.is_option_selected",
    "home",
    { entity: [{ domain: "select" }, { domain: "input_select" }] },
    (ctx) => [
      behavior(ctx),
      stateChoice(ctx, "option", L("select__option")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "siren.is_off": entry(
    "condition",
    "siren.is_off",
    "home",
    { entity: { domain: "siren" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "siren.is_on": entry(
    "condition",
    "siren.is_on",
    "home",
    { entity: { domain: "siren" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "switch.is_off": entry(
    "condition",
    "switch.is_off",
    "home",
    { entity: [{ domain: "switch" }, { domain: "input_boolean" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "switch.is_on": entry(
    "condition",
    "switch.is_on",
    "home",
    { entity: [{ domain: "switch" }, { domain: "input_boolean" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "text.is_equal_to": entry(
    "condition",
    "text.is_equal_to",
    "home",
    { entity: [{ domain: "text" }, { domain: "input_text" }] },
    (ctx) => [
      behavior(ctx),
      textField(ctx, "value", L("text__value")),
      holdFor(ctx),
    ],
    ["for"]
  ),
  "timer.is_active": entry(
    "condition",
    "timer.is_active",
    "home",
    { entity: [{ domain: "timer" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.is_paused": entry(
    "condition",
    "timer.is_paused",
    "home",
    { entity: [{ domain: "timer" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "timer.is_idle": entry(
    "condition",
    "timer.is_idle",
    "home",
    { entity: [{ domain: "timer" }] },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "todo.all_completed": entry(
    "condition",
    "todo.all_completed",
    "home",
    { entity: { domain: "todo" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "todo.incomplete": entry(
    "condition",
    "todo.incomplete",
    "home",
    { entity: { domain: "todo" } },
    (ctx) => [behavior(ctx), threshold(ctx, T.todoNumberIs), holdFor(ctx)],
    ["for"]
  ),
  "update.is_available": entry(
    "condition",
    "update.is_available",
    "home",
    { entity: { domain: "update" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "update.is_not_available": entry(
    "condition",
    "update.is_not_available",
    "home",
    { entity: { domain: "update" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.is_cleaning": entry(
    "condition",
    "vacuum.is_cleaning",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.is_docked": entry(
    "condition",
    "vacuum.is_docked",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.is_encountering_an_error": entry(
    "condition",
    "vacuum.is_encountering_an_error",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.is_paused": entry(
    "condition",
    "vacuum.is_paused",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
  "vacuum.is_returning": entry(
    "condition",
    "vacuum.is_returning",
    "home",
    { entity: { domain: "vacuum" } },
    (ctx) => [behavior(ctx), holdFor(ctx)],
    ["for"]
  ),
};
