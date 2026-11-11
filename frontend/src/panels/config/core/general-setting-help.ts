/**
 * Plain-language help for every setting on the General page. The text lives in
 * the translations, under `GENERAL_HELP_KEY`; this table says which keys each
 * setting uses, its default (when it has one that Reset can restore) and the
 * bundled help article it opens.
 */

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
}

const TEXT_KEYS = ["description", "reach", "holding", "default"] as const;

const ARTICLE = "/docs/configuration";

export const GENERAL_SETTING_HELP: Record<
  GeneralSettingId,
  GeneralSettingHelp
> = {
  name: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  country: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  language: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  time_zone: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  currency: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  unit_system: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
  location: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: false },
  elevation: { textKeys: TEXT_KEYS, helpPath: ARTICLE, resettable: true },
};

/** The full translation key of one help text. */
export const generalHelpKey = (
  id: GeneralSettingId,
  part: GeneralSettingHelp["textKeys"][number]
): string => `${GENERAL_HELP_KEY}.${id}.${part}`;
