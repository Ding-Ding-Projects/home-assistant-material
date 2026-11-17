import type { DeviceEditorMap } from "../types";
import {
  dFor,
  dFromAttribute,
  dInteger,
  dNumber,
  dObject,
  dSlider,
  dText,
  dTiles,
  device,
} from "./shared";

const TOGGLE = { types: ["is_on", "is_off"], extra: [dFor()] };

/** Device conditions of every integration that ships `device_condition.py`. */
export const DEVICE_CONDITION_EDITORS: DeviceEditorMap = Object.fromEntries([
  device("alarm_control_panel", "condition", {
    entityDomain: "alarm_control_panel",
    types: [
      "is_triggered",
      "is_disarmed",
      "is_armed_home",
      "is_armed_away",
      "is_armed_night",
      "is_armed_vacation",
      "is_armed_custom_bypass",
    ],
  }),
  device("binary_sensor", "condition", {
    entityDomain: "binary_sensor",
    extra: [dFor()],
  }),
  device("climate", "condition", {
    entityDomain: "climate",
    types: ["is_hvac_mode", "is_preset_mode"],
    extra: [
      dTiles(
        "hvac_mode",
        ["off", "heat", "cool", "heat_cool", "auto", "dry", "fan_only"],
        ["is_hvac_mode"]
      ),
      dFromAttribute("preset_mode", "preset_modes", ["is_preset_mode"]),
    ],
  }),
  device("cover", "condition", {
    entityDomain: "cover",
    types: [
      "is_position",
      "is_tilt_position",
      "is_open",
      "is_closed",
      "is_opening",
      "is_closing",
    ],
    extra: [
      dSlider("above", 0, 100, ["is_position", "is_tilt_position"], "%"),
      dSlider("below", 0, 100, ["is_position", "is_tilt_position"], "%"),
    ],
  }),
  device("device_tracker", "condition", {
    entityDomain: "device_tracker",
    types: ["is_home", "is_not_home"],
  }),
  device("fan", "condition", { entityDomain: "fan", ...TOGGLE }),
  device("humidifier", "condition", {
    entityDomain: "humidifier",
    types: ["is_mode", "is_on", "is_off"],
    extra: [dFromAttribute("mode", "available_modes", ["is_mode"])],
  }),
  device("light", "condition", { entityDomain: "light", ...TOGGLE }),
  device("lock", "condition", {
    entityDomain: "lock",
    types: [
      "is_jammed",
      "is_locked",
      "is_locking",
      "is_open",
      "is_opening",
      "is_unlocked",
      "is_unlocking",
    ],
  }),
  device("media_player", "condition", {
    entityDomain: "media_player",
    types: [
      "is_on",
      "is_off",
      "is_buffering",
      "is_idle",
      "is_paused",
      "is_playing",
    ],
  }),
  device("remote", "condition", { entityDomain: "remote", ...TOGGLE }),
  device("select", "condition", {
    entityDomain: "select",
    types: ["selected_option"],
    extra: [dFromAttribute("option", "options"), dFor()],
  }),
  device("sensor", "condition", {
    entityDomain: "sensor",
    extra: [dNumber("above"), dNumber("below")],
  }),
  device("switch", "condition", { entityDomain: "switch", ...TOGGLE }),
  device("vacuum", "condition", {
    entityDomain: "vacuum",
    types: ["is_cleaning", "is_docked"],
  }),
  device("zwave_js", "condition", {
    types: ["node_status", "config_parameter", "value"],
    extra: [
      dTiles("status", ["alive", "asleep", "awake", "dead"], ["node_status"]),
      dInteger("parameter", 0, 65535, ["config_parameter"]),
      dText("bitmask", ["config_parameter"]),
      dText("command_class", ["value"]),
      dText("property", ["value"]),
      dText("property_key", ["value"]),
      dInteger("endpoint", 0, 255, ["config_parameter", "value"]),
      dObject("value", ["config_parameter", "value"]),
    ],
  }),
]);
