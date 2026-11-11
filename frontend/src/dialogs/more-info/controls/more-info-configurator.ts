import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { live } from "lit/directives/live";
import { consume } from "../../../common/decorators/consume";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-markdown";
import "../../../components/input/ha-input";
import { apiContext, internationalizationContext } from "../../../data/context";
import type {
  HomeAssistantApi,
  HomeAssistantInternationalization,
} from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

@customElement("more-info-configurator")
export class MoreInfoConfigurator extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @state() private _isConfiguring = false;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: HomeAssistantInternationalization;

  private _fieldInput: Record<string, unknown> = {};

  private _configureId?: unknown;

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (!changedProps.has("stateObj")) {
      return;
    }
    // A new configuration step must not inherit what was typed in the last one
    const configureId = this.stateObj?.attributes.configure_id;
    if (configureId !== this._configureId) {
      this._configureId = configureId;
      this._fieldInput = {};
    }
  }

  protected render() {
    if (this.stateObj?.state !== "configure") {
      return nothing;
    }

    return html`
      <div class="container">
        ${
          this._i18n
            ? html`<h2 class="headline warn">
                ${this._i18n.localize(
                  "ui.dialogs.more_info_control.configurator.needs_you"
                )}
              </h2>`
            : nothing
        }
        <ha-markdown
          breaks
          .content=${this.stateObj.attributes.description}
        ></ha-markdown>

        ${
          this.stateObj.attributes.errors
            ? html`<ha-alert alert-type="error">
                ${this.stateObj.attributes.errors}
              </ha-alert>`
            : nothing
        }
        ${this.stateObj.attributes.fields.map(
          (field) =>
            html`<ha-input
              .label=${field.name}
              .name=${field.id}
              .type=${field.type}
              .value=${live((this._fieldInput[field.id] as string) ?? "")}
              @change=${this._fieldChanged}
            ></ha-input>`
        )}
        ${
          this.stateObj.attributes.submit_caption
            ? html`<p class="submit">
                <ha-button
                  .disabled=${this._isConfiguring}
                  @click=${this._submitClicked}
                  .loading=${this._isConfiguring}
                >
                  ${this.stateObj.attributes.submit_caption}
                </ha-button>
              </p>`
            : nothing
        }
      </div>
    `;
  }

  private _fieldChanged(ev) {
    const el = ev.target;
    this._fieldInput[el.name] = el.value;
  }

  private _submitClicked() {
    const data = {
      configure_id: this.stateObj!.attributes.configure_id,
      fields: this._fieldInput,
    };

    this._isConfiguring = true;

    this._api.callService("configurator", "configure", data).then(
      () => {
        this._isConfiguring = false;
      },
      () => {
        this._isConfiguring = false;
      }
    );
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      .container {
        display: flex;
        flex-direction: column;
      }
      p {
        margin: var(--ha-space-2) 0;
      }

      a {
        color: var(--primary-color);
      }

      p > img {
        max-width: 100%;
      }

      p.center {
        text-align: center;
      }

      p.submit {
        text-align: center;
        height: 41px;
      }
      ha-input {
        margin-bottom: var(--ha-space-3);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-configurator": MoreInfoConfigurator;
  }
}
