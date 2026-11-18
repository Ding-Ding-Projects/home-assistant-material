import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-relative-time";
import { formattersContext } from "../../../data/context";
import {
  shouldShowFavoriteOptions,
  type ExtEntityRegistryEntry,
} from "../../../data/entity/entity_registry";
import type { ValveEntity } from "../../../data/valve";
import {
  valveSupportsPosition,
  ValveEntityFeature,
  computeValvePositionStateDisplay,
} from "../../../data/valve";
import "../../../state-control/valve/ha-state-control-valve-buttons";
import "../../../state-control/valve/ha-state-control-valve-position";
import "../../../state-control/valve/ha-state-control-valve-toggle";
import type { HomeAssistantFormatters } from "../../../types";
import "../components/valves/ha-more-info-valve-favorite-positions";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-valve")
class MoreInfoValve extends LitElement {
  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @property({ attribute: false }) public stateObj?: ValveEntity;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  private get _stateOverride() {
    const stateDisplay = this._formatters.formatEntityState(this.stateObj!);

    const positionStateDisplay = computeValvePositionStateDisplay(
      this.stateObj!,
      this._formatters.formatEntityAttributeValue
    );

    // The dialog header shows the plain state; only add what it lacks.
    if (positionStateDisplay) {
      return `${stateDisplay} · ${positionStateDisplay}`;
    }
    return undefined;
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const supportsPosition = valveSupportsPosition(this.stateObj);

    const showFavoriteControls = Boolean(
      this.entry &&
      (this.editMode ||
        (supportsPosition &&
          shouldShowFavoriteOptions(
            this.entry.options?.valve?.favorite_positions
          )))
    );

    const supportsOpenClose =
      supportsFeature(this.stateObj, ValveEntityFeature.OPEN) ||
      supportsFeature(this.stateObj, ValveEntityFeature.CLOSE) ||
      supportsFeature(this.stateObj, ValveEntityFeature.STOP);

    const supportsOpenCloseOnly =
      supportsFeature(this.stateObj, ValveEntityFeature.OPEN) &&
      supportsFeature(this.stateObj, ValveEntityFeature.CLOSE) &&
      !supportsFeature(this.stateObj, ValveEntityFeature.STOP) &&
      !supportsPosition;

    return html`
      <div class="hero">
        ${
          this._stateOverride
            ? html`<div class="state">${this._stateOverride}</div>`
            : nothing
        }
        <div class="since">
          ${this._localize("ui.dialogs.more_info_control.valve.changed")}
          <ha-relative-time
            .datetime=${this.stateObj.last_changed}
          ></ha-relative-time>
        </div>
      </div>
      <div class="controls">
        ${
          supportsPosition
            ? html`
                <ha-state-control-valve-position
                  .stateObj=${this.stateObj}
                ></ha-state-control-valve-position>
              `
            : nothing
        }
        ${
          supportsOpenCloseOnly && !supportsPosition
            ? html`
                <ha-state-control-valve-toggle
                  .stateObj=${this.stateObj}
                ></ha-state-control-valve-toggle>
              `
            : supportsOpenClose
              ? html`
                  <ha-state-control-valve-buttons
                    .stateObj=${this.stateObj}
                  ></ha-state-control-valve-buttons>
                `
              : nothing
        }
        ${
          showFavoriteControls
            ? html`
                <ha-more-info-valve-favorite-positions
                  .stateObj=${this.stateObj}
                  .entry=${this.entry}
                  .editMode=${this.editMode}
                ></ha-more-info-valve-favorite-positions>
              `
            : nothing
        }
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      css`
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--ha-space-1);
          margin-bottom: var(--ha-space-4);
        }
        .hero .state {
          font-size: clamp(28px, 7vw, 48px);
          line-height: 56px;
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .hero .since {
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-valve": MoreInfoValve;
  }
}
