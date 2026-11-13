/**
 * Options that are common for an action, whatever integration answers it.
 *
 * Every entry is confirmed in the server source of this repository and cites
 * it. Keys that could not be confirmed there are deliberately left out.
 */

import type { KnownOption, KnownOptionKind } from "./known-options";

interface CatalogueEntry {
  key: string;
  /** Translation id under `ui.components.object-editor.catalogue`. */
  id: string;
  kind: KnownOptionKind;
}

/**
 * Audio format hints. The speech service accepts these for every engine and
 * converts the audio when the engine cannot produce it.
 *
 * core/homeassistant/components/tts/__init__.py:
 * - ATTR_PREFERRED_* and _PREFFERED_FORMAT_OPTIONS list the five keys.
 * - _DEFAULT_FORMAT is "mp3"; the conversion code handles "mp3" and "wav".
 * - The conversion passes the sample rate to ffmpeg `-ar` and the channel
 *   count to `-ac`, a bitrate as `{n}k` for mp3 only, and 2 sample bytes as
 *   16-bit samples.
 */
const TTS_AUDIO_OPTIONS: CatalogueEntry[] = [
  {
    key: "preferred_format",
    id: "preferred_format",
    kind: {
      type: "choice",
      choices: [{ value: "mp3" }, { value: "wav" }],
    },
  },
  {
    key: "preferred_sample_rate",
    id: "preferred_sample_rate",
    kind: { type: "number", step: 1, unit: "Hz" },
  },
  {
    key: "preferred_sample_channels",
    id: "preferred_sample_channels",
    kind: { type: "number", step: 1 },
  },
  {
    key: "preferred_sample_bytes",
    id: "preferred_sample_bytes",
    kind: { type: "number", step: 1 },
  },
  {
    key: "preferred_bitrate",
    id: "preferred_bitrate",
    kind: { type: "number", step: 1, unit: "kbit/s" },
  },
];

/**
 * Sensibo climate-react sends these raw AC-state keys unchanged.
 * Verified by core/homeassistant/components/sensibo/climate.py
 * (async_enable_climate_react and async_full_ac_state) and the complete
 * climate-react payload in core/tests/components/sensibo/test_climate.py.
 * These are optional suggestions, not an exhaustive schema. In particular,
 * normalized entity fan/swing labels are not raw provider values.
 */
const SENSIBO_CLIMATE_REACT_OPTIONS: CatalogueEntry[] = [
  { key: "on", id: "sensibo_on", kind: { type: "boolean" } },
  {
    key: "targetTemperature",
    id: "sensibo_target_temperature",
    kind: { type: "number" },
  },
  {
    key: "temperatureUnit",
    id: "sensibo_temperature_unit",
    kind: { type: "choice", choices: [{ value: "C" }, { value: "F" }] },
  },
  { key: "mode", id: "sensibo_mode", kind: { type: "text" } },
  { key: "fanLevel", id: "sensibo_fan_level", kind: { type: "text" } },
  { key: "swing", id: "sensibo_swing", kind: { type: "text" } },
  {
    key: "horizontalSwing",
    id: "sensibo_horizontal_swing",
    kind: { type: "text" },
  },
  { key: "light", id: "sensibo_light", kind: { type: "text" } },
];

/**
 * Keyed by "domain.service" and field name. The TTS service description
 * declares the `options` field of `speak` as a plain dictionary.
 */
const CATALOGUE: Record<string, CatalogueEntry[]> = {
  "tts.speak:options": TTS_AUDIO_OPTIONS,
  "sensibo.enable_climate_react:high_temperature_state":
    SENSIBO_CLIMATE_REACT_OPTIONS,
  "sensibo.enable_climate_react:low_temperature_state":
    SENSIBO_CLIMATE_REACT_OPTIONS,
};

/** How many entries the catalogue holds, for the record. */
export const catalogueKeyCount = (): number =>
  Object.values(CATALOGUE).reduce((sum, list) => sum + list.length, 0);

export const hasCatalogueFor = (action: string, field: string): boolean =>
  `${action}:${field}` in CATALOGUE;

/** The common options for an action field, with localized text. */
export const catalogueOptions = (
  action: string,
  field: string,
  localize: (key: string) => string
): KnownOption[] =>
  (CATALOGUE[`${action}:${field}`] ?? []).map((entry) => {
    const base = `ui.components.object-editor.catalogue.${entry.id}`;
    return {
      key: entry.key,
      label: localize(`${base}.label`) || undefined,
      description: localize(`${base}.description`) || undefined,
      kind: entry.kind,
      source: "common" as const,
    };
  });
