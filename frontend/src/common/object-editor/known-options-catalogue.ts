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
    kind: { type: "number", min: 1, step: 1 },
  },
  {
    key: "preferred_sample_bytes",
    id: "preferred_sample_bytes",
    kind: { type: "number", min: 1, step: 1 },
  },
  {
    key: "preferred_bitrate",
    id: "preferred_bitrate",
    kind: { type: "number", min: 1, step: 1, unit: "kbit/s" },
  },
];

/**
 * Keyed by "domain.service" and field name. The services.yaml of the tts
 * component declares the `options` field of `speak` and `say` as a plain
 * dictionary with no keys of its own.
 */
const CATALOGUE: Record<string, CatalogueEntry[]> = {
  "tts.speak:options": TTS_AUDIO_OPTIONS,
  "tts.say:options": TTS_AUDIO_OPTIONS,
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
