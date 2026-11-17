import "../../../../../components/ha-form/ha-form";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../../common/dom/fire_event";
import type { GeoLocationTrigger } from "../../../../../data/automation";
import type { HomeAssistant } from "../../../../../types";
import type { LocalizeFunc } from "../../../../../common/translations/localize";
import type { SchemaUnion } from "../../../../../components/ha-form/types";

@customElement("ha-automation-trigger-geo_location")
export class HaGeolocationTrigger extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trigger!: GeoLocationTrigger;

  @property({ type: Boolean }) public disabled = false;

  private _schema = memoizeOne(
    (localize: LocalizeFunc, sources: string[]) =>
      [
        {
          name: "source",
          selector: { select: { options: sources, custom_value: true } },
        },
        { name: "zone", selector: { entity: { domain: "zone" } } },
        {
          name: "event",
          type: "select",
          required: true,
          options: [
            [
              "enter",
              localize(
                "ui.panel.config.automation.editor.triggers.type.geo_location.enter"
              ),
            ],
            [
              "leave",
              localize(
                "ui.panel.config.automation.editor.triggers.type.geo_location.leave"
              ),
            ],
          ],
        },
      ] as const
  );

  public static get defaultConfig(): GeoLocationTrigger {
    return {
      trigger: "geo_location",
      source: "",
      zone: "",
      event: "enter" as GeoLocationTrigger["event"],
    };
  }

  private _knownSources(): string[] {
    const sources = new Set<string>();
    for (const [entityId, stateObj] of Object.entries(this.hass.states)) {
      const source = stateObj.attributes.source;
      if (entityId.startsWith("geo_location.") && typeof source === "string") {
        sources.add(source);
      }
    }
    if (this.trigger.source) {
      sources.add(this.trigger.source);
    }
    return [...sources].sort();
  }

  protected render() {
    return html`
      <ha-form
        .schema=${this._schema(this.hass.localize, this._knownSources())}
        .data=${this.trigger}
        .hass=${this.hass}
        .disabled=${this.disabled}
        .computeLabel=${this._computeLabelCallback}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const newTrigger = ev.detail.value;
    fireEvent(this, "value-changed", { value: newTrigger });
  }

  private _computeLabelCallback = (
    schema: SchemaUnion<ReturnType<typeof this._schema>>
  ): string =>
    this.hass.localize(
      `ui.panel.config.automation.editor.triggers.type.geo_location.${schema.name}`
    );
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trigger-geo_location": HaGeolocationTrigger;
  }
}
