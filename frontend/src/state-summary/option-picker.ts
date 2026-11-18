import { html } from "lit";
import type { PickerComboBoxItem } from "../components/ha-picker-combo-box";
import type { PickerValueRenderer } from "../components/ha-picker-field";

/** From this many options on, a select opens the searchable picker sheet. */
export const SELECT_PICKER_MIN_OPTIONS = 9;

export interface OptionPickerOption {
  value: string;
  label: string;
}

export interface OptionPickerSource {
  getItems: () => PickerComboBoxItem[];
  valueRenderer: PickerValueRenderer;
}

/**
 * Builds the item list and value renderer for the existing generic picker.
 * The returned function keeps the same objects while the options are
 * unchanged, because the picker needs a stable item getter.
 */
export const createOptionPicker = (): ((
  options: OptionPickerOption[]
) => OptionPickerSource) => {
  let lastKey: string | undefined;
  let last: OptionPickerSource | undefined;

  return (options) => {
    const key = options.map((o) => `${o.value}\u0000${o.label}`).join("\u0001");
    if (last && key === lastKey) {
      return last;
    }
    const items: PickerComboBoxItem[] = options.map((option) => ({
      id: option.value,
      primary: option.label,
      sorting_label: option.label,
    }));
    lastKey = key;
    last = {
      getItems: () => items,
      valueRenderer: (value: string) =>
        html`<span slot="headline"
          >${items.find((item) => item.id === value)?.primary ?? value}</span
        >`,
    };
    return last;
  };
};
