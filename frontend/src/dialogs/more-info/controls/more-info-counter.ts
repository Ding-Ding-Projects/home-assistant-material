import { mdiMinus, mdiPlus, mdiRestart } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import type { HaButton } from "../../../components/ha-button";
import "../../../components/ha-control-button";
import "../../../components/ha-svg-icon";
import { apiContext } from "../../../data/context";
import { UNAVAILABLE } from "../../../data/entity/entity";
import type { HomeAssistantApi } from "../../../types";

@customElement("more-info-counter")
class MoreInfoCounter extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  protected render() {
    if (!this._localize || !this.stateObj) {
      return nothing;
    }

    const attrs = this.stateObj.attributes;
    const disabled = this.stateObj.state === UNAVAILABLE;
    const value = Number(this.stateObj.state);
    const minimum = attrs.minimum as number | null | undefined;
    const maximum = attrs.maximum as number | null | undefined;
    const step = attrs.step as number | undefined;
    const initial = attrs.initial as number | undefined;
    const hasMinimum = minimum !== undefined && minimum !== null;
    const hasMaximum = maximum !== undefined && maximum !== null;

    return html`
      <div class="value">${this.stateObj.state}</div>
      <div class="value-row">
        <ha-control-button
          class="round"
          .label=${this._localize("ui.card.counter.actions.decrement")}
          .action=${"decrement"}
          @click=${this._handleActionClick}
          .disabled=${disabled || (hasMinimum && value === minimum)}
        >
          <ha-svg-icon .path=${mdiMinus}></ha-svg-icon>
        </ha-control-button>
        <ha-button
          appearance="outlined"
          variant="neutral"
          .action=${"reset"}
          @click=${this._handleActionClick}
          .disabled=${disabled}
        >
          <ha-svg-icon slot="start" .path=${mdiRestart}></ha-svg-icon>
          ${
            initial !== undefined
              ? this._localize(
                  "ui.dialogs.more_info_control.counter.reset_to",
                  { value: initial }
                )
              : this._localize("ui.card.counter.actions.reset")
          }
        </ha-button>
        <ha-control-button
          class="round primary"
          .label=${this._localize("ui.card.counter.actions.increment")}
          .action=${"increment"}
          @click=${this._handleActionClick}
          .disabled=${disabled || (hasMaximum && value === maximum)}
        >
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
        </ha-control-button>
      </div>
      ${
        step !== undefined
          ? html`<div class="summary">
              ${
                hasMinimum && hasMaximum
                  ? this._localize(
                      "ui.dialogs.more_info_control.counter.counts_between",
                      { minimum, maximum, step }
                    )
                  : this._localize(
                      "ui.dialogs.more_info_control.counter.counts_step",
                      { step }
                    )
              }
            </div>`
          : nothing
      }
      ${
        hasMinimum || hasMaximum || step !== undefined
          ? html`<div class="stats">
              ${
                hasMinimum
                  ? this._renderStat(
                      this._localize(
                        "ui.dialogs.more_info_control.counter.lowest"
                      ),
                      minimum
                    )
                  : nothing
              }
              ${
                hasMaximum
                  ? this._renderStat(
                      this._localize(
                        "ui.dialogs.more_info_control.counter.highest"
                      ),
                      maximum
                    )
                  : nothing
              }
              ${
                step !== undefined
                  ? this._renderStat(
                      this._localize(
                        "ui.dialogs.more_info_control.counter.step"
                      ),
                      step
                    )
                  : nothing
              }
            </div>`
          : nothing
      }
    `;
  }

  private _renderStat(label: string, value: number) {
    return html`
      <div class="stat">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
      </div>
    `;
  }

  private _handleActionClick(
    e: MouseEvent & HASSDomCurrentTargetEvent<HaButton & { action: string }>
  ): void {
    const action = e.currentTarget.action;
    this._api.callService("counter", action, {
      entity_id: this.stateObj!.entity_id,
    });
  }

  static styles = css`
    :host {
      display: block;
    }

    .value-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-6);
      margin-bottom: var(--ha-space-3);
    }

    .value {
      margin: 0 auto var(--ha-space-3);
      min-width: 64px;
      text-align: center;
      font-size: 64px;
      line-height: 72px;
      font-weight: var(--ha-font-weight-medium);
      direction: ltr;
    }

    .round {
      --control-button-border-radius: 50%;
      width: 64px;
      height: 64px;
      flex: none;
    }

    .round.primary {
      --control-button-background-color: var(--primary-color);
      --control-button-background-opacity: 1;
      --control-button-icon-color: var(--text-primary-color);
    }

    .summary {
      text-align: center;
      color: var(--secondary-text-color);
      margin-bottom: var(--ha-space-3);
    }

    .actions {
      display: flex;
      justify-content: center;
      margin-bottom: var(--ha-space-4);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: var(--ha-space-2);
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
    }

    .stat-label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }

    .stat-value {
      direction: ltr;
      text-align: start;
      font-weight: var(--ha-font-weight-semi-bold);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-counter": MoreInfoCounter;
  }
}
