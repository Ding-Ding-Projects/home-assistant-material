import { mdiShield, mdiShieldHome, mdiShieldOff } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { computeStateName } from "../../../common/entity/compute_state_name";
import "../../../components/ha-svg-icon";
import "../../home/components/ha-panel-heading";
import type {
  AlarmControlPanelEntity,
  AlarmMode,
} from "../../../data/alarm_control_panel";
import {
  ALARM_MODES,
  setProtectedAlarmControlPanelMode,
  supportedAlarmModes,
} from "../../../data/alarm_control_panel";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { SecurityAlarmCardConfig } from "./types";

const ARM_LABEL: Record<AlarmMode, string> = {
  armed_home: "arm_home",
  armed_away: "arm_away",
  armed_night: "arm_night",
  armed_vacation: "arm_vacation",
  armed_custom_bypass: "arm_custom_bypass",
  disarmed: "disarm",
};

const UNKNOWN = new Set(["unavailable", "unknown"]);

/**
 * The top of the Security page: the state of each alarm panel in words, what
 * the locks say, and the buttons for the modes the panel supports. A code is
 * asked for in the dialog the panel's own card uses when the panel needs one.
 */
@customElement("hui-security-alarm-card")
export class HuiSecurityAlarmCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: SecurityAlarmCardConfig;

  public setConfig(config: SecurityAlarmCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  private _alarms = memoizeOne((states: HomeAssistant["states"]) =>
    Object.values(states)
      .filter(
        (stateObj) =>
          stateObj.entity_id.startsWith("alarm_control_panel.") &&
          !UNKNOWN.has(stateObj.state)
      )
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
  );

  private _lines(): string {
    const hass = this.hass!;
    const locks = Object.values(hass.states).filter(
      (stateObj) =>
        stateObj.entity_id.startsWith("lock.") &&
        !hass.entities[stateObj.entity_id]?.hidden &&
        !UNKNOWN.has(stateObj.state)
    );
    if (!locks.length) {
      return "";
    }
    const open = locks.filter((lock) => lock.state !== "locked").length;
    return open
      ? hass.localize("ui.panel.lovelace.cards.security_alarm.not_locked", {
          count: open,
        })
      : hass.localize("ui.panel.lovelace.cards.security_alarm.all_locked");
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const alarms = this._alarms(this.hass.states);
    const lines = this._lines();
    const summary = [
      alarms.length ? this.hass.formatEntityState(alarms[0]) : "",
      lines,
    ]
      .filter(Boolean)
      .join(" · ");
    return html`<ha-panel-heading
        .heading=${this.hass.localize("panel.security")}
        .summary=${summary}
      ></ha-panel-heading>
      ${alarms.map((alarm) => this._renderAlarm(alarm, lines))}`;
  }

  private _renderAlarm(alarm: HassEntity, lines: string) {
    const hass = this.hass!;
    const armed = alarm.state.startsWith("armed");
    const alert = alarm.state === "triggered" || alarm.state === "pending";
    const disarmed = alarm.state === "disarmed";
    const modes = supportedAlarmModes(alarm as AlarmControlPanelEntity).filter(
      (mode) => mode !== "disarmed" && mode !== alarm.state
    );
    return html`
      <section
        class=${classMap({ hero: true, armed, alert, disarmed })}
        data-entity=${alarm.entity_id}
      >
        <div class="text">
          <span class="label">
            <ha-svg-icon
              .path=${armed ? mdiShieldHome : disarmed ? mdiShieldOff : mdiShield}
            ></ha-svg-icon>
            ${computeStateName(alarm)}
          </span>
          <div class="big">${hass.formatEntityState(alarm)}</div>
          ${lines ? html`<span class="caption">${lines}</span>` : nothing}
        </div>
        <div class="actions">
          ${
            disarmed
              ? nothing
              : html`<button
                  type="button"
                  class="action primary"
                  data-mode="disarmed"
                  @click=${this._setMode}
                >
                  <ha-svg-icon .path=${ALARM_MODES.disarmed.path}></ha-svg-icon>
                  ${hass.localize("ui.card.alarm_control_panel.disarm")}
                </button>`
          }
          ${modes.map(
            (mode) =>
              html`<button
                type="button"
                class=${disarmed ? "action primary" : "action"}
                data-mode=${mode}
                @click=${this._setMode}
              >
                <ha-svg-icon .path=${ALARM_MODES[mode].path}></ha-svg-icon>
                ${hass.localize(`ui.card.alarm_control_panel.${ARM_LABEL[mode]}`)}
              </button>`
          )}
        </div>
      </section>
    `;
  }

  private async _setMode(ev: Event): Promise<void> {
    const button = ev.currentTarget as HTMLElement;
    const entityId = (button.closest("[data-entity]") as HTMLElement).dataset
      .entity!;
    const stateObj = this.hass!.states[entityId] as AlarmControlPanelEntity;
    try {
      await setProtectedAlarmControlPanelMode(
        this,
        this.hass!,
        stateObj,
        button.dataset.mode as AlarmMode
      );
    } catch (_err) {
      // The code dialog was closed, or the panel refused: nothing changed.
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-4) var(--ha-space-6);
      margin-bottom: var(--ha-space-3);
      padding: var(--ha-space-6);
      border-radius: var(--ha-border-radius-3xl, 28px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .hero.armed {
      background: color-mix(
        in srgb,
        var(--success-color) 28%,
        var(--primary-background-color)
      );
    }
    .hero.alert {
      background: color-mix(
        in srgb,
        var(--error-color) 28%,
        var(--primary-background-color)
      );
    }
    .text {
      min-width: 0;
    }
    .label {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 24px;
    }
    .big {
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(36px, 6vw, 64px);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.1;
    }
    .caption {
      font-size: var(--ha-font-size-l);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 180px;
    }
    .action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-12);
      padding: 0 var(--ha-space-6);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    .action.primary {
      border-color: transparent;
      background: var(--primary-color);
      color: var(--text-primary-color);
    }
    .action:focus-visible {
      outline: 3px solid var(--primary-text-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-security-alarm-card": HuiSecurityAlarmCard;
  }
}
