import type { DeviceEditorMap } from "../types";
import {
  dFromAttribute,
  dInteger,
  dNumber,
  dObject,
  dSlider,
  dSwitch,
  dText,
  dTiles,
  device,
} from "./shared";

const TOGGLE = { types: ["turn_on", "turn_off", "toggle"] };

/** Device actions of every integration that ships `device_action.py`. */
export const DEVICE_ACTION_EDITORS: DeviceEditorMap = Object.fromEntries([
  device("alarm_control_panel", "action", {
    entityDomain: "alarm_control_panel",
    types: [
      "arm_away",
      "arm_home",
      "arm_night",
      "arm_vacation",
      "disarm",
      "trigger",
    ],
    extra: [dText("code", undefined, { password: true })],
  }),
  device("button", "action", { entityDomain: "button", types: ["press"] }),
  device("climate", "action", {
    entityDomain: "climate",
    types: ["set_hvac_mode", "set_preset_mode"],
    extra: [
      dTiles(
        "hvac_mode",
        ["off", "heat", "cool", "heat_cool", "auto", "dry", "fan_only"],
        ["set_hvac_mode"]
      ),
      dFromAttribute("preset_mode", "preset_modes", ["set_preset_mode"]),
    ],
  }),
  device("cover", "action", {
    entityDomain: "cover",
    types: [
      "open",
      "close",
      "stop",
      "open_tilt",
      "close_tilt",
      "set_position",
      "set_tilt_position",
    ],
    extra: [
      dSlider("position", 0, 100, ["set_position", "set_tilt_position"], "%"),
    ],
  }),
  device("fan", "action", { entityDomain: "fan", ...TOGGLE }),
  device("humidifier", "action", {
    entityDomain: "humidifier",
    types: ["set_humidity", "set_mode", "toggle", "turn_on", "turn_off"],
    extra: [
      dSlider("humidity", 0, 100, ["set_humidity"], "%"),
      dFromAttribute("mode", "available_modes", ["set_mode"]),
    ],
  }),
  device("light", "action", {
    entityDomain: "light",
    types: [
      "turn_on",
      "turn_off",
      "toggle",
      "brightness_increase",
      "brightness_decrease",
      "flash",
    ],
    extra: [
      dSlider("brightness_pct", 0, 100, ["turn_on"], "%"),
      dTiles("flash", ["short", "long"], ["flash"]),
    ],
  }),
  device("lock", "action", {
    entityDomain: "lock",
    types: ["lock", "unlock", "open"],
  }),
  device("mobile_app", "action", {
    types: ["notify"],
    extra: [
      dText("message", ["notify"], { multiline: true }),
      dText("title", ["notify"]),
      dObject("data", ["notify"]),
    ],
  }),
  device("number", "action", {
    entityDomain: "number",
    types: ["set_value"],
    extra: [dNumber("value", ["set_value"])],
  }),
  device("nut", "action"),
  device("remote", "action", { entityDomain: "remote", ...TOGGLE }),
  device("rfxtrx", "action", { subtype: true }),
  device("select", "action", {
    entityDomain: "select",
    types: [
      "select_first",
      "select_last",
      "select_next",
      "select_option",
      "select_previous",
    ],
    extra: [
      dFromAttribute("option", "options", ["select_option"]),
      dSwitch("cycle", ["select_next", "select_previous"]),
    ],
  }),
  device("switch", "action", { entityDomain: "switch", ...TOGGLE }),
  device("text", "action", {
    entityDomain: "text",
    types: ["set_value"],
    extra: [dText("value", ["set_value"])],
  }),
  device("vacuum", "action", {
    entityDomain: "vacuum",
    types: ["clean", "dock"],
  }),
  device("water_heater", "action", {
    entityDomain: "water_heater",
    types: ["turn_on", "turn_off"],
  }),
  device("zha", "action", {
    extra: [
      dInteger("duration", 1, 65535),
      dSlider("level", 0, 100),
      dSlider("color", 0, 255),
      dText("effect_type"),
      dInteger("led_number", 1, 7),
    ],
  }),
  device("zwave_js", "action", {
    entityDomain: "zwave_js",
    extra: [
      dInteger("code_slot", 1, 255),
      dText("usercode", undefined, { password: true }),
      dInteger("config_parameter", 0, 65535),
      dText("bitmask"),
      dText("command_class"),
      dText("property"),
      dText("property_key"),
      dInteger("endpoint", 0, 255),
      dObject("value"),
      dSwitch("wait_for_result"),
      dSwitch("refresh_all_values"),
      dInteger("meter_type", 0, 255),
    ],
  }),
]);
