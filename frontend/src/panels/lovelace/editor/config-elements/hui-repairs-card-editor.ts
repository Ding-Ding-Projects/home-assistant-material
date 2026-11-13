import { mdiGestureTap } from "@mdi/js";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { assert, boolean, literal, optional, type } from "superstruct";
import { fireEvent } from "../../../../common/dom/fire_event";
import { deepEqual } from "../../../../common/util/deep-equal";
import "../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../components/ha-form/types";
import type { HomeAssistant } from "../../../../types";
import type { RepairsCardConfig } from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";

const DEFAULT_TAP = {
  action: "navigate",
  navigation_path: "/config/repairs",
} as const;
const FIELDS = [
  "hide_empty",
  "vertical",
  "tap_action",
  "hold_action",
  "double_tap_action",
] as const;
const SCHEMA = [
  { name: "hide_empty", selector: { boolean: {} } },
  { name: "vertical", selector: { boolean: {} } },
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    iconPath: mdiGestureTap,
    schema: [
      {
        name: "tap_action",
        selector: { ui_action: { default_action: "navigate" } },
      },
      {
        name: "hold_action",
        selector: { ui_action: { default_action: "none" } },
      },
      {
        name: "double_tap_action",
        selector: { ui_action: { default_action: "none" } },
      },
    ],
  },
] as const satisfies HaFormSchema[];

@customElement("hui-repairs-card-editor")
export class HuiRepairsCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config?: RepairsCardConfig;

  public setConfig(config: RepairsCardConfig): void {
    // Validate the controls owned here, without rejecting future or custom keys.
    assert(
      config,
      type({
        type: literal("repairs"),
        hide_empty: optional(boolean()),
        vertical: optional(boolean()),
      })
    );
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    return html`<ha-form
      .hass=${this.hass}
      .data=${{ ...this._config, tap_action: this._config.tap_action ?? DEFAULT_TAP }}
      .schema=${SCHEMA}
      .computeLabel=${this._computeLabel}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _computeLabel = (schema: { name: string }): string => {
    if (schema.name === "hide_empty") {
      return this.hass!.localize(
        "ui.panel.lovelace.editor.strategy.common_controls.hide_empty"
      );
    }
    if (schema.name === "vertical") {
      return this.hass!.localize(
        "ui.panel.lovelace.editor.card.tile.content_layout_options.vertical"
      );
    }
    if (schema.name === "tap_action") {
      return this.hass!.localize(
        "ui.panel.lovelace.editor.card.generic.tap_action"
      );
    }
    if (schema.name === "hold_action") {
      return this.hass!.localize(
        "ui.panel.lovelace.editor.card.generic.hold_action"
      );
    }
    if (schema.name === "double_tap_action") {
      return this.hass!.localize(
        "ui.panel.lovelace.editor.card.generic.double_tap_action"
      );
    }
    return this.hass!.localize(
      "ui.panel.lovelace.editor.card.generic.interactions"
    );
  };

  private _valueChanged(ev: CustomEvent<{ value: RepairsCardConfig }>) {
    ev.stopPropagation();
    if (!this._config) return;
    const config = { ...this._config };
    for (const key of FIELDS) {
      if (key in ev.detail.value) {
        (config as Record<string, unknown>)[key] = ev.detail.value[key];
      } else delete config[key];
    }
    // Display the runtime's default navigation without materializing it merely
    // because another setting was changed.
    if (!this._config.tap_action && deepEqual(config.tap_action, DEFAULT_TAP)) {
      delete config.tap_action;
    }
    fireEvent(this, "config-changed", { config });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-repairs-card-editor": HuiRepairsCardEditor;
  }
}
