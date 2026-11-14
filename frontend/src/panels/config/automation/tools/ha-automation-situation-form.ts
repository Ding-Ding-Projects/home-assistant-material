import { mdiClose, mdiPlus } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/entity/ha-entity-picker";
import "../../../../components/ha-button";
import type { HaCheckbox } from "../../../../components/ha-checkbox";
import "../../../../components/ha-checkbox";
import type { HASSDomCurrentTargetEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-icon-button";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-select";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { Situation } from "./simulate";
import { WEEKDAYS } from "./simulate";

/** The select cannot hold an empty value, so "any day" has its own marker. */
const ANY_WEEKDAY = "any";

/**
 * Edits a situation: the time of day, the day of the week and the states that
 * replace the live ones. It never changes anything; the owner reads the value
 * from the `situation-changed` event.
 */
@customElement("ha-automation-situation-form")
export class HaAutomationSituationForm extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public situation!: Situation;

  private _t(key: string) {
    return this.hass.localize(
      `ui.panel.config.automation.editor.tools.simulate.${key}` as any
    );
  }

  protected render() {
    const { time, weekday, overrides } = this.situation;
    return html`
      <ha-input
        type="time"
        .label=${this._t("time")}
        .value=${time}
        @input=${this._timeChanged}
      ></ha-input>
      <ha-select
        .label=${this._t("weekday")}
        .value=${weekday === undefined ? ANY_WEEKDAY : String(weekday)}
        .options=${[
          { value: ANY_WEEKDAY, label: this._t("weekday_any") },
          ...WEEKDAYS.map((_d, i) => ({
            value: String(i),
            label: this._t(`weekday_${i}`),
          })),
        ]}
        @selected=${this._weekdayChanged}
      ></ha-select>
      <ha-input
        .label=${this._t("trigger_id")}
        .value=${this.situation.triggerId ?? ""}
        @input=${this._triggerChanged}
      ></ha-input>
      <ha-checkbox
        .checked=${this.situation.useLiveStates !== false}
        @change=${this._liveStatesChanged}
        >${this._t("use_live_states")}</ha-checkbox
      >
      <p>${this._t("isolated_hint")}</p>
      <h4>${this._t("states")}</h4>
      ${overrides.map(
        (row, index) =>
          html`<div class="row">
            <ha-entity-picker
              .hass=${this.hass}
              .value=${row.entityId}
              .index=${index}
              @value-changed=${this._rowEntityChanged}
            ></ha-entity-picker>
            <ha-input
              .label=${this._t("state")}
              .value=${row.state}
              .index=${index}
              @input=${this._rowStateChanged}
            ></ha-input>
            <ha-icon-button
              .label=${this._t("remove_state")}
              .path=${mdiClose}
              .index=${index}
              @click=${this._removeRow}
            ></ha-icon-button>
          </div>`
      )}
      <ha-button appearance="plain" @click=${this._addRow}>
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${this._t("add_state")}
      </ha-button>
    `;
  }

  private _change(situation: Situation) {
    fireEvent(this, "situation-changed", { situation });
  }

  private _liveStatesChanged(ev: HASSDomCurrentTargetEvent<HaCheckbox>) {
    this._change({
      ...this.situation,
      useLiveStates: ev.currentTarget.checked,
    });
  }

  private _triggerChanged(ev: Event) {
    this._change({
      ...this.situation,
      triggerId: (ev.target as HTMLInputElement).value || undefined,
    });
  }

  private _timeChanged(ev: Event) {
    this._change({
      ...this.situation,
      time: (ev.target as HTMLInputElement).value,
    });
  }

  private _weekdayChanged(ev: HaSelectSelectEvent<string>) {
    const value = ev.detail.value;
    this._change({
      ...this.situation,
      weekday:
        value === undefined || value === ANY_WEEKDAY
          ? undefined
          : Number(value),
    });
  }

  private _addRow() {
    this._change({
      ...this.situation,
      overrides: [...this.situation.overrides, { entityId: "", state: "" }],
    });
  }

  private _removeRow(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._change({
      ...this.situation,
      overrides: this.situation.overrides.filter((_r, i) => i !== index),
    });
  }

  private _rowEntityChanged(ev: CustomEvent) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._setRow(index, { entityId: ev.detail.value ?? "" });
  }

  private _rowStateChanged(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this._setRow(index, { state: (ev.target as HTMLInputElement).value });
  }

  private _setRow(
    index: number,
    patch: Partial<{ entityId: string; state: string }>
  ) {
    this._change({
      ...this.situation,
      overrides: this.situation.overrides.map((r, i) =>
        i === index ? { ...r, ...patch } : r
      ),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          align-items: stretch;
        }
        h4 {
          margin: 0;
        }
        .row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
          gap: var(--ha-space-2);
          align-items: center;
        }
        ha-select {
          display: block;
          width: 100%;
        }
        @media (max-width: 480px) {
          .row {
            grid-template-columns: minmax(0, 1fr) auto;
          }
          .row ha-entity-picker {
            grid-column: 1 / -1;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HASSDomEvents {
    "situation-changed": { situation: Situation };
  }
  interface HTMLElementTagNameMap {
    "ha-automation-situation-form": HaAutomationSituationForm;
  }
}
