/**
 * Plain-language help for every setting on the General page. The text lives in
 * the translations, under `GENERAL_HELP_KEY`; this table says which keys each
 * setting uses, its default (when it has one that Reset can restore) and the
 * bundled help article it opens.
 */

import type { PractiseSpec } from "../../../components/setting-info/practise-logic";

export const GENERAL_HELP_KEY =
  "ui.panel.config.core.section.core.general_help";

/** Every setting the General page shows, in page order. */
export const GENERAL_SETTING_IDS = [
  "name",
  "country",
  "language",
  "time_zone",
  "currency",
  "unit_system",
  "location",
  "elevation",
] as const;

export type GeneralSettingId = (typeof GENERAL_SETTING_IDS)[number];

/** The values a setting can be reset to. */
export interface GeneralSettingDefaults {
  name: string;
  country: string | null;
  language: string;
  time_zone: string;
  currency: string;
  unit_system: "metric" | "us_customary";
  elevation: number;
}

export const GENERAL_SETTING_DEFAULTS: GeneralSettingDefaults = {
  name: "Home",
  country: null,
  language: "en",
  time_zone: "Etc/GMT",
  currency: "EUR",
  unit_system: "metric",
  elevation: 0,
};

export interface GeneralSettingHelp {
  /** Translation key suffixes, under `GENERAL_HELP_KEY.<id>`. */
  textKeys: readonly ["description", "reach", "holding", "default"];
  /** A bundled article path, never an outside address. */
  helpPath: string;
  /** Whether Reset can restore a default for this setting. */
  resettable: boolean;
  /**
   * How many worked examples the setting has. Example `n` (counting from 1) is
   * the pair of translations `example_<n>_input` and `example_<n>_result`
   * under `GENERAL_HELP_KEY.<id>`.
   */
  examples?: number;
  /**
   * The sandbox control that lets a person try the rule of the field. It never
   * saves or sends anything. A text spec also reads `practise_hint` and a
   * number spec `practise_unit` from the translations.
   */
  practise?: PractiseSpec;
}

const TEXT_KEYS = ["description", "reach", "holding", "default"] as const;

const ARTICLE = "/docs/configuration";

/**
 * A time zone is written Area/Location (or Area/Region/Location), such as
 * Europe/Paris, or one of the plain names UTC and GMT. The whole value must
 * match.
 */
export const TIME_ZONE_PATTERN =
  "[A-Za-z][A-Za-z_]*(?:/[A-Za-z0-9_+-]+){1,2}|UTC|GMT";

/** A currency is its three-letter ISO 4217 code, in capitals. */
export const CURRENCY_PATTERN = "[A-Z]{3}";

/** The elevation the sandbox allows, in meters. */
export const ELEVATION_RANGE = { min: -500, max: 9000 } as const;

export const GENERAL_SETTING_HELP: Record<
  GeneralSettingId,
  GeneralSettingHelp
> = {
  name: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  country: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  language: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  time_zone: {
    textKeys: TEXT_KEYS,
    helpPath: ARTICLE,
    resettable: true,
    examples: 3,
    practise: {
      type: "text",
      rule: { kind: "pattern", pattern: TIME_ZONE_PATTERN },
      initial: "Europe/Paris",
    },
  },
  currency: {
    textKeys: TEXT_KEYS,
    helpPath: ARTICLE,
    resettable: true,
    examples: 3,
    practise: {
      type: "text",
      rule: { kind: "pattern", pattern: CURRENCY_PATTERN },
      initial: "EUR",
    },
  },
  unit_system: {
    textKeys: TEXT_KEYS,
    helpPath: ARTICLE,
    resettable: true,
    examples: 2,
  },
  location: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: false },
  elevation: {
    textKeys: TEXT_KEYS,
    helpPath: ARTICLE,
    resettable: true,
    examples: 3,
    practise: {
      type: "number",
      min: ELEVATION_RANGE.min,
      max: ELEVATION_RANGE.max,
      step: 1,
      initial: 0,
    },
  },
};

/** The translation keys of worked example `n` (from 1) of one setting. */
export const generalExampleKeys = (
  id: GeneralSettingId,
  n: number
): { input: string; result: string } => ({
  input: `${GENERAL_HELP_KEY}.${id}.example_${n}_input`,
  result: `${GENERAL_HELP_KEY}.${id}.example_${n}_result`,
});

/** The full translation key of one help text. */
export const generalHelpKey = (
  id: GeneralSettingId,
  part: GeneralSettingHelp["textKeys"][number]
): string => `${GENERAL_HELP_KEY}.${id}.${part}`;
