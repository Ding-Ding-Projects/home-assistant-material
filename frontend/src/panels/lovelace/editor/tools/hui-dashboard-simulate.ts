import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/entity/ha-entity-picker";
import "../../../../components/input/ha-input";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../../types";
import "../../cards/hui-card";
import { cardEntities } from "../dashboard-tools";
import { listEditableCards } from "./dashboard-edit";
import type { SimulationPreset, StateOverride } from "./dashboard-simulate";
import {
  changedAmong,
  SIMULATION_PRESETS,
  simulateStates,
} from "./dashboard-simulate";

/**
 * A preview of a view under a made-up situation. The situation lives only in
 * a copy of the states handed to preview cards: nothing is written to the
 * server, no service is called, and the preview cannot be clicked.
 */
@customElement("hui-dashboard-simulate")
export class HuiDashboardSimulate extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: LovelaceConfig;

  @property({ type: Number }) public view = 0;

  @state() private _preset: SimulationPreset = "now";

  @state() private _overrides: StateOverride[] = [];

  @state() private _entity = "";

  @state() private _state = "";

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.simulate.${key}` as LocalizeKeys,
      values
    );
  }

  private _simulation = memoizeOne(
    (
      states: HomeAssistant["states"],
      preset: SimulationPreset,
      overrides: StateOverride[]
    ) => simulateStates(states, preset, overrides)
  );

  private _fakeHass = memoizeOne(
    (hass: HomeAssistant, states: HomeAssistant["states"]): HomeAssistant => ({
      ...hass,
      states,
    })
  );

  private _cards(): LovelaceCardConfig[] {
    return listEditableCards(this.config)
      .filter((c) => c.path.view === this.view)
      .map((c) => c.card);
  }

  protected render() {
    const simulation = this._simulation(
      this.hass.states,
      this._preset,
      this._overrides
    );
    const cards = this._cards();
    const used = cards.flatMap((card) => cardEntities(card));
    const affected = changedAmong(simulation.changed, used);
    const hass = this._fakeHass(this.hass, simulation.states);
    return html`
      <ha-alert alert-type="info">${this._t("notice")}</ha-alert>
      <div class="presets" role="group" aria-label=${this._t("presets")}>
        ${SIMULATION_PRESETS.map(
          (preset) =>
            html`<ha-button
              size="s"
              appearance=${this._preset === preset ? "filled" : "outlined"}
              aria-pressed=${this._preset === preset ? "true" : "false"}
              .preset=${preset}
              @click=${this._setPreset}
            >
              ${this._t(`preset.${preset}`)}
            </ha-button>`
        )}
      </div>
      <div class="custom">
        <ha-entity-picker
          .hass=${this.hass}
          .label=${this._t("entity")}
          .value=${this._entity}
          @value-changed=${this._entityChanged}
        ></ha-entity-picker>
        <ha-input
          .label=${this._t("state")}
          .value=${this._state}
          @input=${this._stateInput}
        ></ha-input>
        <ha-button
          .disabled=${!this._entity || !this._state}
          @click=${this._addOverride}
        >
          ${this._t("add")}
        </ha-button>
      </div>
      ${
        this._overrides.length
          ? html`<ul class="overrides">
              ${this._overrides.map(
                (o) =>
                  html`<li>
                    <code>${o.entityId}</code> = <code>${o.state}</code>
                    <ha-button
                      size="s"
                      appearance="plain"
                      .entityId=${o.entityId}
                      @click=${this._removeOverride}
                    >
                      ${this._t("remove")}
                    </ha-button>
                  </li>`
              )}
            </ul>`
          : nothing
      }
      <p class="hint" aria-live="polite">
        ${
          simulation.changed.length
            ? this._t("changed", {
                total: simulation.changed.length,
                used: affected.length,
              })
            : this._t("no_change")
        }
      </p>
      ${
        cards.length
          ? html`<div class="preview" inert>
              ${cards.map(
                (card) =>
                  html`<hui-card
                    .hass=${hass}
                    .config=${card}
                    preview
                  ></hui-card>`
              )}
            </div>`
          : html`<p class="hint">${this._t("empty")}</p>`
      }
    `;
  }

  private _setPreset(ev: Event) {
    this._preset = (
      ev.currentTarget as HTMLElement & { preset: SimulationPreset }
    ).preset;
  }

  private _entityChanged(ev: CustomEvent<{ value?: string }>) {
    this._entity = ev.detail.value ?? "";
  }

  private _stateInput(ev: Event) {
    this._state = ((ev.target as HTMLInputElement).value ?? "").trim();
  }

  private _addOverride() {
    this._overrides = [
      ...this._overrides.filter((o) => o.entityId !== this._entity),
      { entityId: this._entity, state: this._state },
    ];
    this._entity = "";
    this._state = "";
  }

  private _removeOverride(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    this._overrides = this._overrides.filter((o) => o.entityId !== id);
  }

  static styles = css`
    .hint {
      color: var(--secondary-text-color);
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    .presets,
    .custom {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-3);
    }
    .custom ha-entity-picker,
    .custom ha-input {
      flex: 1 1 200px;
    }
    .overrides {
      list-style: none;
      margin: 0 0 var(--ha-space-3);
      padding: 0;
    }
    .overrides li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .preview {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--primary-background-color);
      pointer-events: none;
      user-select: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-simulate": HuiDashboardSimulate;
  }
}
