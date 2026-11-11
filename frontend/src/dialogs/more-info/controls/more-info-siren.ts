import { mdiBullhorn, mdiVolumeHigh, mdiVolumeOff } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-slider";
import "../../../components/ha-svg-icon";
import { apiContext } from "../../../data/context";
import { UNAVAILABLE } from "../../../data/entity/entity";
import { SirenEntityFeature } from "../../../data/siren";
import "../../../state-control/ha-state-control-toggle";
import type { HomeAssistantApi } from "../../../types";
import "../components/ha-more-info-state-header";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";
import { showSirenAdvancedControlsView } from "../components/siren/show-dialog-siren-advanced-controls";

@customElement("more-info-siren")
class MoreInfoSiren extends LitElement {
  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @state() private _tone?: string;

  @state() private _volume?: number;

  private _toneOptions(): { value: string; label: string }[] {
    const tones = this.stateObj?.attributes.available_tones;
    if (!tones) {
      return [];
    }
    return Object.entries(tones).map(([toneId, toneName]) => ({
      value: Array.isArray(tones) ? (toneName as string) : toneId,
      label: toneName as string,
    }));
  }

  protected render() {
    if (!this._localize || !this.stateObj) {
      return nothing;
    }

    const supportsTones =
      supportsFeature(this.stateObj, SirenEntityFeature.TONES) &&
      this.stateObj.attributes.available_tones;
    const supportsVolume = supportsFeature(
      this.stateObj,
      SirenEntityFeature.VOLUME_SET
    );
    const supportsDuration = supportsFeature(
      this.stateObj,
      SirenEntityFeature.DURATION
    );
    // show advanced controls dialog if extra features are supported
    const allowAdvanced = supportsTones || supportsVolume || supportsDuration;
    const unavailable = this.stateObj.state === UNAVAILABLE;
    const tones = supportsTones ? this._toneOptions() : [];

    return html`
      <ha-more-info-state-header
        .stateObj=${this.stateObj}
      ></ha-more-info-state-header>
      <div class="controls">
        <ha-state-control-toggle
          .stateObj=${this.stateObj}
          .iconPathOn=${mdiVolumeHigh}
          .iconPathOff=${mdiVolumeOff}
        ></ha-state-control-toggle>
        ${
          tones.length
            ? html`
                <div
                  class="chips"
                  role="group"
                  aria-label=${this._localize("ui.components.siren.tone")}
                >
                  ${tones.map(
                    (tone) => html`
                      <button
                        type="button"
                        class="chip"
                        aria-pressed=${this._tone === tone.value ? "true" : "false"}
                        .disabled=${unavailable}
                        .tone=${tone.value}
                        @click=${this._handleToneClick}
                      >
                        ${tone.label}
                      </button>
                    `
                  )}
                </div>
              `
            : nothing
        }
        ${
          supportsVolume
            ? html`
                <div class="volume">
                  <ha-svg-icon .path=${mdiVolumeHigh}></ha-svg-icon>
                  <ha-slider
                    min="0"
                    max="100"
                    step="1"
                    .label=${this._localize("ui.components.siren.volume")}
                    .value=${Math.round((this._volume ?? 1) * 100)}
                    .disabled=${unavailable}
                    @change=${this._handleVolumeChange}
                  ></ha-slider>
                  <span class="volume-value"
                    >${Math.round((this._volume ?? 1) * 100)}%</span
                  >
                </div>
              `
            : nothing
        }
        ${
          allowAdvanced
            ? html`<div class="actions">
                <ha-button
                  appearance="filled"
                  variant="danger"
                  .disabled=${unavailable}
                  @click=${this._soundNow}
                >
                  <ha-svg-icon slot="start" .path=${mdiBullhorn}></ha-svg-icon>
                  ${this._localize(
                    "ui.dialogs.more_info_control.siren.sound_now"
                  )}
                </ha-button>
                <ha-button
                  appearance="plain"
                  size="s"
                  @click=${this._showAdvancedControlsDialog}
                >
                  ${this._localize("ui.components.siren.more_controls")}
                </ha-button>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _handleToneClick(ev: Event) {
    const tone = (ev.currentTarget as HTMLButtonElement & { tone: string })
      .tone;
    this._tone = this._tone === tone ? undefined : tone;
  }

  private _handleVolumeChange(ev: Event) {
    const value = Number((ev.target as HTMLInputElement).value);
    this._volume = Number.isNaN(value) ? undefined : value / 100;
  }

  private _soundNow() {
    this._api.callService("siren", "turn_on", {
      entity_id: this.stateObj!.entity_id,
      tone: this._tone,
      volume_level: this._volume,
    });
  }

  private _showAdvancedControlsDialog() {
    showSirenAdvancedControlsView(this, this.stateObj!);
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      moreInfoBoardStyle,
      css`
        .volume {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          align-self: stretch;
        }
        .volume ha-slider {
          flex: 1;
          min-width: 0;
        }
        .volume-value {
          min-width: 3em;
          text-align: end;
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-siren": MoreInfoSiren;
  }
}
