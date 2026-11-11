import { mdiCog } from "@mdi/js";
import type { PickerComboBoxItem } from "../../components/ha-picker-combo-box";
import type { PersonalPreferences } from "../../common/preferences/personal-preferences";
import type { FuseWeightedKey } from "../../resources/fuseMultiTerm";
import type { HomeAssistant } from "../../types";

/**
 * Settings that the search of everything can show and change in place.
 * Each one is a yes or no choice in the personal preferences of this browser,
 * and each has a row with the same id on the Personal settings page.
 */
export const QUICK_BAR_SETTING_IDS = [
  "sound_effects",
  "low_stimulation",
  "focus_spotlight",
  "quiet_hours",
] as const;

export type QuickBarSettingId = (typeof QUICK_BAR_SETTING_IDS)[number];

export interface SettingComboBoxItem extends PickerComboBoxItem {
  settingId: QuickBarSettingId;
  path: string;
}

export const QUICK_BAR_SETTING_PREFIX = "setting________";

export const settingKeys: Record<QuickBarSettingId, keyof PersonalPreferences> =
  {
    sound_effects: "soundEffects",
    low_stimulation: "lowStimulation",
    focus_spotlight: "focusSpotlight",
    quiet_hours: "quietHours",
  };

export const settingComboBoxKeys: FuseWeightedKey[] = [
  { name: "primary", weight: 10 },
  { name: "description", weight: 6 },
  { name: "secondary", weight: 4 },
];

export const generateSettingItems = (
  hass: HomeAssistant
): SettingComboBoxItem[] => {
  const t = (key: string) =>
    hass.localize(`ui.panel.config.personal.${key}` as any);
  const caption = t("caption");
  return QUICK_BAR_SETTING_IDS.map((settingId) => {
    const primary = t(`${settingId}.label`);
    return {
      id: `${QUICK_BAR_SETTING_PREFIX}${settingId}`,
      settingId,
      primary,
      secondary: caption,
      description: t(`${settingId}.description`),
      sorting_label: primary,
      icon_path: mdiCog,
      path: `/config/personal#${settingId}`,
    } as SettingComboBoxItem;
  });
};
