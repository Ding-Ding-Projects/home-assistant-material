import type { HassEntity } from "home-assistant-js-websocket";
import { supportsFeature } from "../common/entity/supports-feature";
import { UNAVAILABLE, UNKNOWN } from "./entity/entity";
import { ClimateEntityFeature } from "./feature/climate_entity_feature";
import { CoverEntityFeature } from "./feature/cover_entity_feature";
import { MediaPlayerEntityFeature } from "./feature/media-player_entity_feature";
import type { LightEntity } from "./light";
import { lightSupportsBrightness, lightSupportsColor } from "./light";

/**
 * The control shown in place for an entity, wherever it is listed by name.
 *
 * This module only decides what to show. It never calls a service: the
 * element that renders the decision uses the same service calls as the
 * more-info controls.
 */

export type QuickControlKind =
  "toggle" | "slider" | "colour" | "press" | "select" | "value" | "none";

/** Why an entity gets no control at all. */
export type QuickControlReason = "unavailable" | "unknown" | "unsupported";

/** A service call, without its target and value. */
export interface QuickService {
  domain: string;
  service: string;
}

/** Turning something on and off, or the two opposite actions of a risky thing. */
export interface QuickToggle {
  on: boolean;
  /** Called to reach the "on" side (turn on, unlock, open, disarm...). */
  onService: QuickService;
  /** Called to reach the "off" side (turn off, lock, close, arm...). */
  offService: QuickService;
  /**
   * The words for the action a press would take next, used by risky
   * things that show a labelled button instead of a switch. One of the
   * keys under `ui.components.quick_control.action`.
   */
  nextAction?: QuickActionName;
}

export type QuickActionName =
  | "lock"
  | "unlock"
  | "open"
  | "close"
  | "arm"
  | "disarm"
  | "turn_on"
  | "turn_off";

export interface QuickSlider {
  min: number;
  max: number;
  step: number;
  /** The current value on the slider's own scale. */
  value: number | undefined;
  /** The service called with the new value. */
  service: QuickService;
  /** The service field that carries the value. */
  field: string;
  /** Divide the slider value by this before sending (volume is 0 to 1). */
  scale?: number;
  /** Shown after the number: "%" or a unit of measurement. */
  unit?: string;
  /** Minus and plus buttons instead of a slider (target temperature). */
  stepper?: boolean;
}

export interface QuickPress {
  service: QuickService;
}

export interface QuickSelect {
  options: string[];
  current: string;
  service: QuickService;
}

export interface QuickControl {
  kind: QuickControlKind;
  /** Asks first, through the app's own two-key confirmation. */
  risky: boolean;
  toggle?: QuickToggle;
  slider?: QuickSlider;
  /** A light that supports colour: a button opens the colour picker on demand. */
  colour?: boolean;
  press?: QuickPress;
  select?: QuickSelect;
  reason?: QuickControlReason;
}

/** Domains that only report a value and are never controlled. */
const READ_ONLY_DOMAINS = new Set([
  "sensor",
  "binary_sensor",
  "weather",
  "sun",
  "person",
  "zone",
  "device_tracker",
  "event",
  "image",
  "camera",
  "calendar",
  "update",
  "air_quality",
  "geo_location",
  "conversation",
  "stt",
  "tts",
  "wake_word",
  "ai_task",
  "tag",
  "todo",
  "notify",
  "image_processing",
]);

/** Domains that are pressed rather than switched. */
const PRESS_SERVICES: Record<string, QuickService> = {
  button: { domain: "button", service: "press" },
  input_button: { domain: "input_button", service: "press" },
  scene: { domain: "scene", service: "turn_on" },
  script: { domain: "script", service: "turn_on" },
};

/** Domains switched on and off with their own turn_on and turn_off. */
const SIMPLE_TOGGLE_DOMAINS = new Set([
  "switch",
  "input_boolean",
  "automation",
  "humidifier",
  "remote",
  "siren",
]);

/** Cover device classes that secure the home. */
const SECURING_COVER_CLASSES = new Set(["garage", "gate", "door"]);

const FAN_SET_SPEED = 1;

const domainOf = (entityId: string): string =>
  entityId.substring(0, entityId.indexOf("."));

/**
 * True for things that secure the home or make noise: locks, alarms, garage
 * doors, gates and doors, valves and sirens. Their control asks first.
 */
export const isRiskyEntity = (stateObj: HassEntity): boolean => {
  const domain = domainOf(stateObj.entity_id);
  if (
    domain === "lock" ||
    domain === "alarm_control_panel" ||
    domain === "valve" ||
    domain === "siren"
  ) {
    return true;
  }
  if (domain === "cover") {
    return SECURING_COVER_CLASSES.has(
      String(stateObj.attributes.device_class ?? "")
    );
  }
  return false;
};

const numberAttr = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const onOffToggle = (stateObj: HassEntity, domain: string): QuickToggle => ({
  on: stateObj.state === "on",
  onService: { domain, service: "turn_on" },
  offService: { domain, service: "turn_off" },
  nextAction: stateObj.state === "on" ? "turn_off" : "turn_on",
});

const none = (reason: QuickControlReason, risky: boolean): QuickControl => ({
  kind: "none",
  risky,
  reason,
});

const lightControl = (stateObj: HassEntity): QuickControl => {
  const light = stateObj as LightEntity;
  const toggle = onOffToggle(stateObj, "light");
  const brightness = numberAttr(light.attributes.brightness);
  const slider: QuickSlider | undefined = lightSupportsBrightness(light)
    ? {
        min: 1,
        max: 100,
        step: 1,
        value:
          stateObj.state === "on" && brightness !== undefined
            ? Math.max(1, Math.round((brightness / 255) * 100))
            : undefined,
        service: { domain: "light", service: "turn_on" },
        field: "brightness_pct",
        unit: "%",
      }
    : undefined;
  if (lightSupportsColor(light)) {
    return { kind: "colour", risky: false, toggle, slider, colour: true };
  }
  if (slider) {
    return { kind: "slider", risky: false, toggle, slider };
  }
  return { kind: "toggle", risky: false, toggle };
};

const fanControl = (stateObj: HassEntity): QuickControl => {
  const toggle = onOffToggle(stateObj, "fan");
  if (!supportsFeature(stateObj, FAN_SET_SPEED)) {
    return { kind: "toggle", risky: false, toggle };
  }
  const step = numberAttr(stateObj.attributes.percentage_step) ?? 1;
  return {
    kind: "slider",
    risky: false,
    toggle,
    slider: {
      min: 0,
      max: 100,
      step: step > 0 ? step : 1,
      value:
        stateObj.state === "on"
          ? numberAttr(stateObj.attributes.percentage)
          : 0,
      service: { domain: "fan", service: "set_percentage" },
      field: "percentage",
      unit: "%",
    },
  };
};

const coverControl = (stateObj: HassEntity, risky: boolean): QuickControl => {
  const open = stateObj.state === "open" || stateObj.state === "opening";
  const toggle: QuickToggle = {
    on: open,
    onService: { domain: "cover", service: "open_cover" },
    offService: { domain: "cover", service: "close_cover" },
    nextAction: open ? "close" : "open",
  };
  // A cover that secures the home gets one labelled button, never a slider
  // that would move it while being dragged.
  if (
    !risky &&
    supportsFeature(stateObj, CoverEntityFeature.SET_POSITION) &&
    numberAttr(stateObj.attributes.current_position) !== undefined
  ) {
    return {
      kind: "slider",
      risky,
      slider: {
        min: 0,
        max: 100,
        step: 1,
        value: numberAttr(stateObj.attributes.current_position),
        service: { domain: "cover", service: "set_cover_position" },
        field: "position",
        unit: "%",
      },
    };
  }
  if (
    !supportsFeature(stateObj, CoverEntityFeature.OPEN) &&
    !supportsFeature(stateObj, CoverEntityFeature.CLOSE)
  ) {
    return { kind: "value", risky };
  }
  return { kind: "toggle", risky, toggle };
};

const mediaPlayerControl = (stateObj: HassEntity): QuickControl => {
  const volume = numberAttr(stateObj.attributes.volume_level);
  if (
    stateObj.state !== "off" &&
    supportsFeature(stateObj, MediaPlayerEntityFeature.VOLUME_SET) &&
    volume !== undefined
  ) {
    return {
      kind: "slider",
      risky: false,
      slider: {
        min: 0,
        max: 100,
        step: 1,
        value: Math.round(volume * 100),
        service: { domain: "media_player", service: "volume_set" },
        field: "volume_level",
        scale: 100,
        unit: "%",
      },
    };
  }
  if (
    supportsFeature(stateObj, MediaPlayerEntityFeature.TURN_ON) &&
    supportsFeature(stateObj, MediaPlayerEntityFeature.TURN_OFF)
  ) {
    return {
      kind: "toggle",
      risky: false,
      toggle: {
        on: stateObj.state !== "off",
        onService: { domain: "media_player", service: "turn_on" },
        offService: { domain: "media_player", service: "turn_off" },
        nextAction: stateObj.state !== "off" ? "turn_off" : "turn_on",
      },
    };
  }
  return { kind: "value", risky: false };
};

const numberControl = (stateObj: HassEntity, domain: string): QuickControl => {
  const min = numberAttr(stateObj.attributes.min);
  const max = numberAttr(stateObj.attributes.max);
  const step = numberAttr(stateObj.attributes.step) ?? 1;
  const value = Number(stateObj.state);
  if (min === undefined || max === undefined || max <= min) {
    return { kind: "value", risky: false };
  }
  return {
    kind: "slider",
    risky: false,
    slider: {
      min,
      max,
      step: step > 0 ? step : 1,
      value: Number.isFinite(value) ? value : undefined,
      service: { domain, service: "set_value" },
      field: "value",
      unit:
        typeof stateObj.attributes.unit_of_measurement === "string"
          ? stateObj.attributes.unit_of_measurement
          : undefined,
    },
  };
};

const temperatureControl = (
  stateObj: HassEntity,
  domain: string
): QuickControl => {
  const target = numberAttr(stateObj.attributes.temperature);
  if (
    target === undefined ||
    (domain === "climate" &&
      !supportsFeature(stateObj, ClimateEntityFeature.TARGET_TEMPERATURE))
  ) {
    return { kind: "value", risky: false };
  }
  const min = numberAttr(stateObj.attributes.min_temp) ?? 7;
  const max = numberAttr(stateObj.attributes.max_temp) ?? 35;
  const step = numberAttr(stateObj.attributes.target_temp_step) ?? 0.5;
  return {
    kind: "slider",
    risky: false,
    slider: {
      min,
      max,
      step: step > 0 ? step : 0.5,
      value: target,
      service: { domain, service: "set_temperature" },
      field: "temperature",
      stepper: true,
    },
  };
};

const selectControl = (stateObj: HassEntity, domain: string): QuickControl => {
  const options = Array.isArray(stateObj.attributes.options)
    ? (stateObj.attributes.options as unknown[]).map(String)
    : [];
  if (!options.length) {
    return { kind: "value", risky: false };
  }
  return {
    kind: "select",
    risky: false,
    select: {
      options,
      current: stateObj.state,
      service: { domain, service: "select_option" },
    },
  };
};

const lockControl = (stateObj: HassEntity): QuickControl => {
  const locked = stateObj.state === "locked" || stateObj.state === "locking";
  return {
    kind: "toggle",
    risky: true,
    toggle: {
      // "On" is the open side: unlocked.
      on: !locked,
      onService: { domain: "lock", service: "unlock" },
      offService: { domain: "lock", service: "lock" },
      nextAction: locked ? "unlock" : "lock",
    },
  };
};

const alarmControl = (stateObj: HassEntity): QuickControl => {
  const disarmed = stateObj.state === "disarmed";
  return {
    kind: "toggle",
    risky: true,
    toggle: {
      // "On" is the open side: disarmed.
      on: disarmed,
      onService: { domain: "alarm_control_panel", service: "alarm_disarm" },
      offService: { domain: "alarm_control_panel", service: "alarm_arm_away" },
      nextAction: disarmed ? "arm" : "disarm",
    },
  };
};

const valveControl = (stateObj: HassEntity): QuickControl => {
  const open = stateObj.state === "open" || stateObj.state === "opening";
  return {
    kind: "toggle",
    risky: true,
    toggle: {
      on: open,
      onService: { domain: "valve", service: "open_valve" },
      offService: { domain: "valve", service: "close_valve" },
      nextAction: open ? "close" : "open",
    },
  };
};

/** Decides the in-place control for an entity in its current state. */
export const quickControlFor = (stateObj: HassEntity): QuickControl => {
  const domain = domainOf(stateObj.entity_id);
  const risky = isRiskyEntity(stateObj);

  if (stateObj.state === UNAVAILABLE) {
    return none("unavailable", risky);
  }

  // Pressing works whatever the last press left behind: a button that was
  // never pressed reports "unknown".
  const press = PRESS_SERVICES[domain];
  if (press) {
    return { kind: "press", risky, press: { service: press } };
  }

  if (stateObj.state === UNKNOWN) {
    return none("unknown", risky);
  }

  if (READ_ONLY_DOMAINS.has(domain)) {
    return { kind: "value", risky };
  }

  switch (domain) {
    case "light":
      return lightControl(stateObj);
    case "fan":
      return fanControl(stateObj);
    case "cover":
      return coverControl(stateObj, risky);
    case "media_player":
      return mediaPlayerControl(stateObj);
    case "number":
    case "input_number":
      return numberControl(stateObj, domain);
    case "climate":
    case "water_heater":
      return temperatureControl(stateObj, domain);
    case "select":
    case "input_select":
      return selectControl(stateObj, domain);
    case "lock":
      return lockControl(stateObj);
    case "alarm_control_panel":
      return alarmControl(stateObj);
    case "valve":
      return valveControl(stateObj);
    default:
      break;
  }

  if (SIMPLE_TOGGLE_DOMAINS.has(domain)) {
    if (stateObj.state !== "on" && stateObj.state !== "off") {
      return { kind: "value", risky };
    }
    return { kind: "toggle", risky, toggle: onOffToggle(stateObj, domain) };
  }

  return { kind: "value", risky };
};
