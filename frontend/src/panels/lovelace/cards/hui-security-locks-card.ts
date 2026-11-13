import { mdiLock, mdiLockOpenVariant } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeStateName } from "../../../common/entity/compute_state_name";
import "../../../components/ha-card";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { SecurityLocksCardConfig } from "./types";

const UNKNOWN = new Set(["unavailable", "unknown"]);

/**
 * The locks of the home as a list on the Security page: one row for each,
 * with how long ago it changed, and a button that locks the ones that are
 * open. Every control acts on the real locks.
 */
@customElement("hui-security-locks-card")
export class HuiSecurityLocksCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: SecurityLocksCardConfig;

  public setConfig(config: SecurityLocksCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  private _locks = memoizeOne(
    (
      states: HomeAssistant["states"],
      entities: HomeAssistant["entities"]
    ): string[] =>
      Object.values(states)
        .filter(
          (stateObj) =>
            stateObj.entity_id.startsWith("lock.") &&
            !entities[stateObj.entity_id]?.hidden &&
            !UNKNOWN.has(stateObj.state)
        )
        // The ones that are open come first.
        .sort(
          (a, b) =>
            Number(a.state === "locked") - Number(b.state === "locked") ||
            computeStateName(a).localeCompare(computeStateName(b))
        )
        .map((stateObj) => stateObj.entity_id)
  );

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const ids = this._locks(hass.states, hass.entities);
    if (!ids.length) {
      return nothing;
    }
    return html`
      <ha-card
        .header=${hass.localize("ui.panel.lovelace.cards.security_locks.title")}
      >
        <ul>
          ${ids.map((entityId) => {
            const stateObj = hass.states[entityId];
            const locked = stateObj.state === "locked";
            return html`<li class=${classMap({ locked })}>
              <span class="tile"
                ><ha-svg-icon
                  .path=${locked ? mdiLock : mdiLockOpenVariant}
                ></ha-svg-icon
              ></span>
              <button
                type="button"
                class="text"
                data-entity=${entityId}
                @click=${this._moreInfo}
              >
                <span class="name">${computeStateName(stateObj)}</span>
                <span class="sub">
                  ${hass.formatEntityState(stateObj)}
                  <ha-relative-time
                    .datetime=${stateObj.last_changed}
                  ></ha-relative-time>
                </span>
              </button>
              ${
                locked
                  ? html`<span class="pill"
                      >${hass.formatEntityState(stateObj)}</span
                    >`
                  : html`<button
                      type="button"
                      class="action"
                      data-entity=${entityId}
                      @click=${this._lock}
                    >
                      ${hass.localize(
                        "ui.panel.lovelace.cards.security_locks.lock"
                      )}
                    </button>`
              }
            </li>`;
          })}
        </ul>
      </ha-card>
    `;
  }

  private _lock(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (entityId) {
      this.hass!.callService("lock", "lock", { entity_id: entityId });
    }
  }

  private _moreInfo(ev: Event): void {
    const entityId = (ev.currentTarget as HTMLElement).dataset.entity;
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0 var(--ha-space-2) var(--ha-space-2);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-3);
    }
    li + li {
      border-top: 1px solid var(--divider-color);
    }
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg);
      background: color-mix(
        in srgb,
        var(--warning-color) 28%,
        var(--card-background-color)
      );
      color: var(--primary-text-color);
      --mdc-icon-size: 22px;
    }
    li.locked .tile {
      background: color-mix(
        in srgb,
        var(--success-color) 24%,
        var(--card-background-color)
      );
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 0;
      border: none;
      background: none;
      text-align: start;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
    }
    .sub {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .pill,
    .action {
      flex: none;
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .pill {
      background: color-mix(
        in srgb,
        var(--success-color) 24%,
        var(--card-background-color)
      );
    }
    .action {
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-4);
      border: none;
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--card-background-color)
      );
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-security-locks-card": HuiSecurityLocksCard;
  }
}
