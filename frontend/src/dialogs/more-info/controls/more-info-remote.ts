import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { UNAVAILABLE } from "../../../data/entity/entity";
import { apiContext, formattersContext } from "../../../data/context";
import type { RemoteEntity } from "../../../data/remote";
import { RemoteEntityFeature } from "../../../data/remote";
import "../components/ha-more-info-state-header";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";
import type { HomeAssistantApi, HomeAssistantFormatters } from "../../../types";

@customElement("more-info-remote")
class MoreInfoRemote extends LitElement {
  @property({ attribute: false }) public stateObj?: RemoteEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  protected render() {
    if (!this._localize || !this._formatters || !this.stateObj) {
      return nothing;
    }

    const stateObj = this.stateObj;

    const activities = supportsFeature(stateObj, RemoteEntityFeature.ACTIVITY)
      ? stateObj.attributes.activity_list
      : undefined;

    return html`
      <ha-more-info-state-header
        .stateObj=${stateObj}
      ></ha-more-info-state-header>
      ${
        activities?.length
          ? html`
              <div
                class="chips"
                role="group"
                aria-label=${this._localize(
                  "ui.dialogs.more_info_control.remote.activity"
                )}
              >
                ${activities.map(
                  (activity) => html`
                    <button
                      type="button"
                      class="chip"
                      aria-pressed=${
                        stateObj.attributes.current_activity === activity
                          ? "true"
                          : "false"
                      }
                      .disabled=${stateObj.state === UNAVAILABLE}
                      .activity=${activity}
                      @click=${this._handleActivityClick}
                    >
                      ${this._formatters.formatEntityAttributeValue(
                        stateObj,
                        "activity",
                        activity
                      )}
                    </button>
                  `
                )}
              </div>
            `
          : nothing
      }
    `;
  }

  private _handleActivityClick(ev: Event) {
    const newVal = (
      ev.currentTarget as HTMLButtonElement & { activity: string }
    ).activity;
    const oldVal = this.stateObj!.attributes.current_activity;

    if (!newVal || oldVal === newVal) {
      return;
    }

    this._api.callService("remote", "turn_on", {
      entity_id: this.stateObj!.entity_id,
      activity: newVal,
    });
  }

  static styles = [moreInfoControlStyle, moreInfoBoardStyle];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-remote": MoreInfoRemote;
  }
}
