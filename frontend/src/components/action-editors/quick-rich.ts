import type { QuickControl, QuickValueType } from "./quick-types";

/**
 * Conversions and rules for the rich value controls: colours, durations and
 * the component each kind of value must be rendered by.
 */

/** The component that must render each kind of value. */
export const REQUIRED_COMPONENT: Partial<Record<QuickValueType, string[]>> = {
  color: ["ha-hs-color-picker"],
  color_temp: ["ha-selector:color_temp"],
  duration: ["ha-duration-input"],
  time: ["ha-selector:time"],
  date: ["ha-selector:date"],
  datetime: ["ha-selector:datetime"],
  icon: ["ha-selector:icon"],
  entity: ["ha-selector:entity", "ha-selector:target"],
  location: ["ha-selector:location"],
  media: ["ha-selector:media"],
  language: ["ha-selector:language"],
  voice: ["ha-selector:tts_voice"],
  agent: ["ha-selector:conversation_agent"],
};

/** Value kinds a control key stands for, whatever its builder. */
export const KEY_VALUE_TYPE: Record<string, QuickValueType> = {
  rgb_color: "color",
  rgbw_color: "color",
  rgbww_color: "color",
  hs_color: "color",
  xy_color: "color",
  color_temp_kelvin: "color_temp",
  color_temp: "color_temp",
  transition: "duration",
  duration: "duration",
  delay: "duration",
  delay_secs: "duration",
  hold_secs: "duration",
  timeout: "duration",
  lookback: "duration",
  start_time: "datetime",
  end_time: "datetime",
  time: "time",
  date: "date",
  datetime: "datetime",
  start_date_time: "datetime",
  end_date_time: "datetime",
  due_datetime: "datetime",
  start_date: "date",
  end_date: "date",
  due_date: "date",
  icon: "icon",
  entity_id: "entity",
  media_player: "entity",
  media_player_entity_id: "entity",
  snapshot_entities: "entity",
  language: "language",
  voice: "voice",
  agent_id: "agent",
  media: "media",
};

/** Which component renders this control. */
export const componentFor = (control: QuickControl): string => {
  switch (control.kind) {
    case "color":
      return "ha-hs-color-picker";
    case "duration":
      return "ha-duration-input";
    case "selector":
      return `ha-selector:${Object.keys(control.selector)[0]}`;
    case "time":
    case "date":
    case "datetime":
      return `ha-selector:${control.kind}`;
    case "entities":
      return "ha-selector:entity";
    case "options":
      return "ha-selector:tts_voice";
    case "slider":
      return "ha-slider";
    case "stepper":
      return "ha-stepper";
    case "text":
      return control.multiline ? "ha-textarea" : "ha-input";
    case "tiles":
    case "services":
    case "swatches":
      return "button";
    case "switch":
      return "ha-switch";
    case "run":
      return "button";
    default:
      return "div";
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const channel = (value: number) =>
  Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 255));

const toLinear = (c: number) =>
  c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;

const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

export const rgbToXy = (rgb: number[]): [number, number] => {
  const r = toLinear(channel(rgb[0]) / 255);
  const g = toLinear(channel(rgb[1]) / 255);
  const b = toLinear(channel(rgb[2]) / 255);
  const x = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = x + y + z;
  if (sum === 0) return [0.323, 0.329];
  return [
    Math.round((x / sum) * 1000) / 1000,
    Math.round((y / sum) * 1000) / 1000,
  ];
};

export const xyToRgb = (xy: number[]): [number, number, number] => {
  const [x, y] = [Number(xy[0]), Number(xy[1])];
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) {
    return [255, 255, 255];
  }
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const max = Math.max(r, g, b, 1);
  r /= max;
  g /= max;
  b /= max;
  return [r, g, b].map((c) => channel(fromLinear(Math.max(0, c)) * 255)) as [
    number,
    number,
    number,
  ];
};

export const hsToRgb = (hs: number[]): [number, number, number] => {
  const h = (((Number(hs[0]) || 0) % 360) + 360) % 360;
  const s = clamp(Number(hs[1]) || 0, 0, 100) / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((c) => channel(c * 255)) as [
    number,
    number,
    number,
  ];
};

export const rgbToHs = (rgb: number[]): [number, number] => {
  const [r, g, b] = [channel(rgb[0]), channel(rgb[1]), channel(rgb[2])];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = Math.round(((h * 60 + 360) % 360) * 10) / 10;
  const s = max === 0 ? 0 : Math.round((delta / max) * 1000) / 10;
  return [h, s];
};

export type ColorSpace = "rgb" | "hs" | "xy" | "rgbw" | "rgbww" | "hex";

/** The colour a stored value in any model shows, as red, green and blue. */
export const colorToRgb = (
  space: ColorSpace,
  value: number[] | undefined
): [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.some((part) => typeof part !== "number")) {
    return undefined;
  }
  switch (space) {
    case "hs":
      return value.length >= 2 ? hsToRgb(value) : undefined;
    case "xy":
      return value.length >= 2 ? xyToRgb(value) : undefined;
    default:
      return value.length >= 3
        ? [channel(value[0]), channel(value[1]), channel(value[2])]
        : undefined;
  }
};

/**
 * The stored value for a picked colour. White channels of rgbw and rgbww
 * values keep what was stored, so picking a hue never loses them.
 */
export const rgbToColor = (
  space: ColorSpace,
  rgb: number[],
  previous?: number[]
): number[] => {
  const [r, g, b] = [channel(rgb[0]), channel(rgb[1]), channel(rgb[2])];
  switch (space) {
    case "hs":
      return rgbToHs([r, g, b]);
    case "xy":
      return rgbToXy([r, g, b]);
    case "rgbw":
      return [r, g, b, channel(previous?.[3] ?? 0)];
    case "rgbww":
      return [
        r,
        g,
        b,
        channel(previous?.[3] ?? 0),
        channel(previous?.[4] ?? 0),
      ];
    case "hex":
      return [r, g, b, channel(previous?.[3] ?? 255)];
    default:
      return [r, g, b];
  }
};

/** Names of the white channels a colour model carries beyond red, green, blue. */
export const WHITE_CHANNELS: Record<ColorSpace, string[]> = {
  rgb: [],
  hs: [],
  xy: [],
  rgbw: ["white"],
  rgbww: ["cold_white", "warm_white"],
  hex: ["alpha"],
};

/** `RRGGBB` or `RRGGBBAA` text (a leading # is allowed) as [r, g, b, alpha]. */
export const hexTextToColor = (text: unknown): number[] | undefined => {
  if (typeof text !== "string") return undefined;
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text.trim());
  if (!match) return undefined;
  const digits = match[1] + (match[2] ?? "FF");
  return [0, 2, 4, 6].map((index) =>
    parseInt(digits.slice(index, index + 2), 16)
  );
};

/** [r, g, b, alpha] as the uppercase `RRGGBBAA` text the services store. */
export const colorToHexText = (value: number[]): string =>
  [0, 1, 2, 3]
    .map((index) =>
      Math.min(255, Math.max(0, Math.round(value[index] ?? 255)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
    .toUpperCase();

export const hexToRgb = (hex: string): [number, number, number] | undefined => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const digits = match[1];
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
};

export const rgbToHex = (rgb: number[]): string =>
  `#${[0, 1, 2]
    .map((index) => channel(rgb[index]).toString(16).padStart(2, "0"))
    .join("")}`;

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/** Seconds in a stored duration: a number, `H:MM:SS` or `MM:SS` text. */
export const durationSeconds = (
  value: number | string | undefined
): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const text = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3) return undefined;
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isFinite(part))) return undefined;
  const [h, m, s] =
    numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  return h * 3600 + m * 60 + s;
};

export const secondsToParts = (total: number): DurationParts => {
  const whole = Math.floor(Math.abs(total));
  const milliseconds = Math.round((Math.abs(total) - whole) * 1000);
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
    milliseconds,
  };
};

export const partsToSeconds = (
  parts: Partial<DurationParts> | undefined
): number =>
  (parts?.hours ?? 0) * 3600 +
  (parts?.minutes ?? 0) * 60 +
  (parts?.seconds ?? 0) +
  (parts?.milliseconds ?? 0) / 1000;

const pad = (value: number) => String(value).padStart(2, "0");

export const secondsToText = (total: number): string => {
  const parts = secondsToParts(total);
  const base = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  return parts.milliseconds
    ? `${base}.${String(parts.milliseconds).padStart(3, "0")}`
    : base;
};
