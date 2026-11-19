import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../components/ha-form/types";
import type { TtcOverview } from "../../../../data/ttc";
import { fetchTtcOverview } from "../../../../data/ttc";
import type { HomeAssistant } from "../../../../types";
import type { TtcCardConfig } from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";

const STOP_TYPES = ["ttc-departures", "ttc-leave-by"];
const ROUTES_TYPES = ["ttc-alert-banner", "ttc-route-alerts"];

@customElement("hui-ttc-card-editor")
export class HuiTtcCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: TtcCardConfig;

  @state() private _overview?: TtcOverview;

  private _lang = new LanguageModeController(this);

  public setConfig(config: TtcCardConfig): void {
    this._config = config;
  }

  protected firstUpdated(): void {
    if (this.hass) {
      fetchTtcOverview(this.hass)
        .then((overview) => {
          this._overview = overview;
        })
        .catch(() => {
          // Without the integration the fields stay free text.
        });
    }
  }

  private _schema = memoizeOne(
    (type: string, overview?: TtcOverview): HaFormSchema[] => {
      const schema: HaFormSchema[] = [
        { name: "title", selector: { text: {} } },
      ];
      if (STOP_TYPES.includes(type)) {
        schema.push(
          overview?.stops.length
            ? {
                name: "stop",
                selector: {
                  select: {
                    mode: "dropdown",
                    options: overview.stops.map((stop) => ({
                      value: stop.stop,
                      label: stop.title
                        ? `${stop.title} · ${stop.stop}`
                        : stop.stop,
                    })),
                  },
                },
              }
            : { name: "stop", selector: { text: {} } },
          { name: "route", selector: { text: {} } }
        );
      }
      if (type === "ttc-leave-by") {
        schema.push({
          name: "walk_minutes",
          selector: {
            number: {
              min: 0,
              max: 60,
              step: 1,
              mode: "slider",
              unit_of_measurement: "min",
            },
          },
        });
      }
      if (ROUTES_TYPES.includes(type)) {
        schema.push({
          name: "routes",
          selector: {
            select: {
              multiple: true,
              mode: "dropdown",
              options: (overview?.routes ?? []).map((route) => ({
                value: route.route,
                label: route.name,
              })),
            },
          },
        });
      }
      return schema;
    }
  );

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    return html`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${this._schema(this._config.type, this._overview)}
      .computeLabel=${this._computeLabel}
      .computeHelper=${this._computeHelper}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _computeLabel = (schema: { name: string }): string =>
    this._lang.cachedLocalizer(this.hass!.localize)(
      `ui.panel.lovelace.editor.card.ttc.${schema.name}` as any
    );

  private _computeHelper = (schema: { name: string }): string =>
    this._lang.cachedLocalizer(this.hass!.localize)(
      `ui.panel.lovelace.editor.card.ttc.${schema.name}_helper` as any
    );

  private _valueChanged(ev: CustomEvent<{ value: TtcCardConfig }>): void {
    ev.stopPropagation();
    const config = { ...ev.detail.value };
    for (const key of Object.keys(config) as (keyof TtcCardConfig)[]) {
      const value = config[key];
      if (
        value === "" ||
        value === undefined ||
        (Array.isArray(value) && !value.length)
      ) {
        delete config[key];
      }
    }
    fireEvent(this, "config-changed", { config });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-ttc-card-editor": HuiTtcCardEditor;
  }
}
