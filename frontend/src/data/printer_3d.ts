import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";

/**
 * 3D printers. A printer is a device; its entities are found by the keys the
 * integration gives them (`translation_key`), so nothing is picked entity by
 * entity. The map below is for the Bambu Lab integration. Another integration
 * is supported by adding its platform and key map to `PRINTER_3D_MAPS`.
 */

export type Printer3DField =
  | "progress"
  | "currentLayer"
  | "totalLayers"
  | "remainingTime"
  | "endTime"
  | "elapsedTime"
  | "stage"
  | "printStatus"
  | "jobName"
  | "coverImage"
  | "speedProfile"
  | "activeNozzle"
  | "nozzleTemp"
  | "nozzleTarget"
  | "leftNozzleTemp"
  | "leftNozzleTarget"
  | "rightNozzleTemp"
  | "rightNozzleTarget"
  | "bedTemp"
  | "bedTarget"
  | "chamberTemp"
  | "chamberTarget"
  | "hmsErrors"
  | "printError"
  | "online"
  | "pause"
  | "resume"
  | "stop"
  | "refresh"
  | "buzzerSilence"
  | "rackRaise"
  | "rackLower"
  | "printingSpeed"
  | "airductMode"
  | "setNozzleTarget"
  | "setBedTarget"
  | "setChamberTarget"
  | "coolingFan"
  | "auxFan"
  | "secondaryAuxFan"
  | "chamberFan"
  | "exhaustFan"
  | "chamberLight"
  | "heatbedLight"
  | "camera"
  | "promptSound";

export type Printer3DEntities = Partial<Record<Printer3DField, string>>;

/** `domain.translation_key` to the field it fills. */
type KeyMap = Record<string, Printer3DField>;

const BAMBU_LAB_KEYS: KeyMap = {
  "sensor.print_progress": "progress",
  "sensor.current_layer": "currentLayer",
  "sensor.total_layers": "totalLayers",
  "sensor.remaining_time": "remainingTime",
  "sensor.end_time": "endTime",
  "sensor.print_elapsed_time": "elapsedTime",
  "sensor.stage": "stage",
  "sensor.print_status": "printStatus",
  "sensor.subtask_name": "jobName",
  "sensor.speed_profile": "speedProfile",
  "sensor.active_nozzle": "activeNozzle",
  "sensor.nozzle_temp": "nozzleTemp",
  "sensor.target_nozzle_temp": "nozzleTarget",
  "sensor.left_nozzle_temp": "leftNozzleTemp",
  "sensor.left_target_nozzle_temp": "leftNozzleTarget",
  "sensor.right_nozzle_temp": "rightNozzleTemp",
  "sensor.right_target_nozzle_temp": "rightNozzleTarget",
  "sensor.bed_temp": "bedTemp",
  "sensor.target_bed_temp": "bedTarget",
  "sensor.chamber_temp": "chamberTemp",
  "sensor.target_chamber_temp": "chamberTarget",
  "image.cover_image": "coverImage",
  "binary_sensor.hms_errors": "hmsErrors",
  "binary_sensor.print_error": "printError",
  "binary_sensor.online": "online",
  "button.pause": "pause",
  "button.resume": "resume",
  "button.stop": "stop",
  "button.refresh": "refresh",
  "button.buzzer_silence": "buzzerSilence",
  "button.hotend_rack_raise": "rackRaise",
  "button.hotend_rack_lower": "rackLower",
  "select.printing_speed": "printingSpeed",
  "select.airduct_mode": "airductMode",
  "number.target_nozzle_temperature": "setNozzleTarget",
  "number.target_bed_temperature": "setBedTarget",
  "number.target_chamber_temperature": "setChamberTarget",
  "fan.cooling_fan": "coolingFan",
  "fan.aux_fan": "auxFan",
  "fan.secondary_aux_fan": "secondaryAuxFan",
  // Some models rename these fans: the H3C and X2D use a part fan and a
  // left and right aux fan, and the A1 mini calls its light the camera light.
  "fan.part_fan": "coolingFan",
  "fan.right_aux_fan": "auxFan",
  "fan.left_aux_fan": "secondaryAuxFan",
  "fan.chamber_fan": "chamberFan",
  "fan.exhaust_fan": "exhaustFan",
  "light.chamber_light": "chamberLight",
  "light.camera_light": "chamberLight",
  "light.heatbed_light": "heatbedLight",
  "switch.camera": "camera",
  "switch.prompt_sound": "promptSound",
};

/** Supported platforms (integration domains) and their entity key maps. */
export const PRINTER_3D_MAPS: Record<string, KeyMap> = {
  bambu_lab: BAMBU_LAB_KEYS,
};

export interface Printer3DDevice {
  deviceId: string;
  platform: string;
  name: string;
  model?: string;
}

/** A key every supported printer has, so a device without any is not listed. */
const IDENTIFYING_FIELDS: Printer3DField[] = ["printStatus", "stage"];

/**
 * Resolve the entities of one printer device. `platform` is the integration
 * domain, or the first supported one that has entities on the device.
 */
export const resolvePrinter3DEntities = (
  hass: Pick<HomeAssistant, "entities">,
  deviceId: string,
  platform?: string
): Printer3DEntities => {
  const found: Record<string, Printer3DEntities> = {};
  for (const entry of Object.values(hass.entities)) {
    const entryPlatform = entry.platform;
    if (
      entry.device_id !== deviceId ||
      !entry.translation_key ||
      !entryPlatform ||
      !(entryPlatform in PRINTER_3D_MAPS) ||
      (platform && entryPlatform !== platform)
    ) {
      continue;
    }
    const domain = entry.entity_id.split(".")[0];
    const field =
      PRINTER_3D_MAPS[entryPlatform][`${domain}.${entry.translation_key}`];
    if (field) {
      (found[entryPlatform] ??= {})[field] ??= entry.entity_id;
    }
  }
  const first = platform ?? Object.keys(found)[0];
  return (first && found[first]) || {};
};

/** Printer devices set up by a supported integration, ordered by name. */
export const listPrinter3DDevices = (
  hass: Pick<HomeAssistant, "entities" | "devices">,
  nameOf: (deviceId: string) => string
): Printer3DDevice[] => {
  const platforms = new Map<string, string>();
  for (const entry of Object.values(hass.entities)) {
    if (
      entry.device_id &&
      entry.platform &&
      entry.platform in PRINTER_3D_MAPS &&
      !platforms.has(entry.device_id)
    ) {
      platforms.set(entry.device_id, entry.platform);
    }
  }
  const printers: Printer3DDevice[] = [];
  for (const [deviceId, platform] of platforms) {
    const entities = resolvePrinter3DEntities(hass, deviceId, platform);
    if (!IDENTIFYING_FIELDS.some((field) => entities[field])) {
      continue;
    }
    printers.push({
      deviceId,
      platform,
      name: nameOf(deviceId),
      model: hass.devices[deviceId]?.model ?? undefined,
    });
  }
  return printers.sort((a, b) => a.name.localeCompare(b.name));
};

// ---------------------------------------------------------------------------
// Problems

export interface PrinterProblem {
  text: string;
  code: string;
  /** Lower case, as the integration sends it: fatal, serious, common, info or unknown. */
  severity: string;
  wiki?: string;
}

/**
 * Read the health messages of the `hms_errors` entity. They are attributes
 * named `Count`, then `N-Error`, `N-Code`, `N-Wiki` and `N-Severity` for each
 * message N.
 */
export const parseHmsProblems = (
  attributes: Record<string, unknown> | undefined
): PrinterProblem[] => {
  if (!attributes) {
    return [];
  }
  const numbers = new Set<number>();
  for (const key of Object.keys(attributes)) {
    const match = /^(\d+)-(Error|Code|Wiki|Severity)$/.exec(key);
    if (match) {
      numbers.add(Number(match[1]));
    }
  }
  const text = (value: unknown): string =>
    value === undefined || value === null ? "" : String(value).trim();
  return [...numbers]
    .sort((a, b) => a - b)
    .map((n) => ({
      text: text(attributes[`${n}-Error`]),
      code: text(attributes[`${n}-Code`]),
      severity: text(attributes[`${n}-Severity`]).toLowerCase(),
      wiki: text(attributes[`${n}-Wiki`]) || undefined,
    }))
    .filter((problem) => problem.text || problem.code);
};

export interface PrinterError {
  code: string;
  text: string;
}

/** The print error, when the `print_error` entity is on and says what it is. */
export const parsePrintError = (
  stateObj: HassEntity | undefined
): PrinterError | undefined => {
  if (!stateObj || stateObj.state !== "on") {
    return undefined;
  }
  const code = stateObj.attributes.code;
  const error = stateObj.attributes.error;
  const text = error === undefined || error === null ? "" : String(error);
  const codeText = code === undefined || code === null ? "" : String(code);
  if (!text && !codeText) {
    return undefined;
  }
  return { code: codeText, text };
};

/** Only an http(s) address is opened from a problem's help link. */
export const safeWikiUrl = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : undefined;
  } catch (_err) {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Stage, progress and temperatures

export type StageTone = "primary" | "amber" | "error" | "green" | "neutral";

export interface StageLook {
  tone: StageTone;
  /** The quiet pulsing dot on the stage chip. */
  pulse: boolean;
}

/** Pauses the person asked for, in the app, in the G-code or with an M400. */
const PLANNED_PAUSES = new Set([
  "paused_user",
  "paused_user_gcode",
  "m400_pause",
]);

const HEATING_STAGES = new Set([
  "heating_hotend",
  "heatbed_preheating",
  "heatbed_stabilizing",
  "checking_extruder_temperature",
]);

/**
 * How the stage chip looks. A pause the person asked for is amber, any other
 * pause is a problem, heating is amber and moving, printing is the accent.
 */
export const stageLook = (
  stage: string | undefined,
  printStatus: string | undefined,
  online: boolean
): StageLook => {
  if (!online || stage === "offline" || printStatus === "offline") {
    return { tone: "neutral", pulse: false };
  }
  if (stage && PLANNED_PAUSES.has(stage)) {
    return { tone: "amber", pulse: false };
  }
  if (stage?.startsWith("paused_") || printStatus === "failed") {
    return { tone: "error", pulse: false };
  }
  if (printStatus === "pause") {
    return { tone: "amber", pulse: false };
  }
  if (stage && HEATING_STAGES.has(stage)) {
    return { tone: "amber", pulse: true };
  }
  if (printStatus === "finish") {
    return { tone: "green", pulse: false };
  }
  if (printStatus === "running" || printStatus === "prepare") {
    return { tone: "primary", pulse: true };
  }
  if (stage === "printing") {
    return { tone: "primary", pulse: true };
  }
  return { tone: "neutral", pulse: false };
};

/** Whether a print is held, by the person or by a problem. */
export const isPaused = (
  stage: string | undefined,
  printStatus: string | undefined
): boolean =>
  printStatus === "pause" ||
  stage === "m400_pause" ||
  !!stage?.startsWith("paused_");

/** Whether a print is going, so it can be paused, stopped and sped up. */
export const isPrintActive = (
  stage: string | undefined,
  printStatus: string | undefined
): boolean =>
  printStatus === "running" ||
  printStatus === "prepare" ||
  printStatus === "pause" ||
  stage === "m400_pause" ||
  !!stage?.startsWith("paused_");

export const PROGRESS_TICKS = 40;

export type TickKind = "done" | "current" | "todo";

/**
 * The thin layer lines of the progress bar: the ones done, the one being
 * printed (only while a print is under way) and the ones still to come.
 */
export const progressTicks = (
  percent: number,
  total = PROGRESS_TICKS
): TickKind[] => {
  const clamped = Math.min(
    100,
    Math.max(0, Number.isFinite(percent) ? percent : 0)
  );
  const filled = Math.round((clamped / 100) * total);
  const running = clamped > 0 && clamped < 100;
  return Array.from({ length: total }, (_unused, i) =>
    i < filled ? "done" : i === filled && running ? "current" : "todo"
  );
};

/** Split minutes into whole hours and minutes. */
export const splitMinutes = (
  minutes: number
): { hours: number; minutes: number } => {
  const total = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
};

/** A Celsius figure in the unit an entity reports, which is Celsius or Fahrenheit. */
export const celsiusIn = (celsius: number, unit: string | undefined): number =>
  unit === "°F" ? Math.round((celsius * 9) / 5 + 32) : celsius;

export type TemperatureTrend =
  | "none"
  | "heating"
  | "cooling"
  | "at_target"
  | "target_off"
  | "target_off_cooling";

/**
 * Where a temperature is going. A target of 0 means the heater is off, and
 * the part is still cooling while it is above 35 degrees. `coolAbove` is how
 * far over the target counts as cooling.
 */
export const temperatureTrend = (
  current: number | undefined,
  target: number | undefined,
  {
    heatBelow = 1,
    coolAbove = 1,
    unit,
  }: { heatBelow?: number; coolAbove?: number; unit?: string } = {}
): TemperatureTrend => {
  if (current === undefined || target === undefined) {
    return "none";
  }
  if (target <= 0) {
    return current > celsiusIn(35, unit) ? "target_off_cooling" : "target_off";
  }
  if (current < target - heatBelow) {
    return "heating";
  }
  if (current > target + coolAbove) {
    return "cooling";
  }
  return "at_target";
};

/** The target the first raise from Off jumps to, so it is a usable one. */
export const firstTarget = (
  kind: "nozzle" | "bed" | "chamber",
  max: number,
  unit?: string
): number =>
  Math.min(
    max,
    celsiusIn(kind === "bed" ? 60 : kind === "chamber" ? 35 : 220, unit)
  );

/** A duration reading in minutes, whatever unit the entity reports it in. */
export const durationToMinutes = (
  value: number,
  unit: string | undefined
): number => {
  switch (unit) {
    case "h":
      return value * 60;
    case "d":
      return value * 1440;
    case "s":
      return value / 60;
    case "ms":
      return value / 60000;
    default:
      return value;
  }
};

export const TARGET_STEP = 5;

/** The next target when the person presses raise or lower. */
export const stepTarget = (
  kind: "nozzle" | "bed" | "chamber",
  target: number,
  direction: 1 | -1,
  min: number,
  max: number,
  unit?: string
): number => {
  if (direction === 1 && target <= 0) {
    return firstTarget(kind, max, unit);
  }
  return Math.min(max, Math.max(min, target + direction * TARGET_STEP));
};
