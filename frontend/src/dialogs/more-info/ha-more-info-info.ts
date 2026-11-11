import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { computeDomain } from "../../common/entity/compute_domain";
import { UNAVAILABLE, UNKNOWN } from "../../data/entity/entity";
import { computeImageUrl } from "../../data/image";
import type { ExtEntityRegistryEntry } from "../../data/entity/entity_registry";
import type { HomeAssistant } from "../../types";
import {
  computeShowHistoryComponent,
  computeShowLogBookComponent,
  computeShowNewMoreInfo,
  DOMAINS_FULL_HEIGHT_MORE_INFO,
  DOMAINS_NO_INFO,
  DOMAINS_WITH_MORE_INFO,
} from "./const";
import { domainMoreInfoType } from "./state_more_info_control";
import "./ha-more-info-history";
import "./ha-more-info-logbook";
import "./more-info-content";

/**
 * Kinds whose body draws its own state headline. The frame leaves its own
 * state card out for these so the state is not shown twice. Kinds that are
 * not listed here and have no dedicated body use the default body, which
 * draws a headline too.
 */
const DOMAINS_WITH_OWN_HEADLINE = [
  "automation",
  "calendar",
  "counter",
  "date",
  "datetime",
  "group",
  "image",
  "person",
  "remote",
  "sensor",
  "sun",
  "timer",
];

/** Kinds whose body draws its own chart, so the frame draws none. */
const DOMAINS_WITH_OWN_CHART = ["sensor"];

/**
 * Whether a kind's body draws nothing for this state, so the frame must keep
 * its own state card. Bodies for a date, a date and time, and a time draw
 * nothing when the state is unavailable or unknown (a time only when it is
 * unavailable); an image body draws nothing when there is no picture. Every
 * other body draws its own headline for any state, which was checked body by
 * body; a kind added here must match what its body does.
 */
const bodyDrawsNothing = (domain: string, stateObj: HassEntity): boolean => {
  const state = stateObj.state;
  switch (domain) {
    case "date":
    case "datetime":
      return state === UNAVAILABLE || state === UNKNOWN;
    case "time":
      return state === UNAVAILABLE;
    case "image":
      return !computeImageUrl(stateObj);
    default:
      return false;
  }
};

@customElement("ha-more-info-info")
export class MoreInfoInfo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  @property({ attribute: false }) public data?: Record<string, any>;

  protected render() {
    const entityId = this.entityId;
    const stateObj = this.hass.states[entityId] as HassEntity | undefined;
    const entityRegObj = this.hass.entities[entityId];
    const domain = computeDomain(entityId);
    const isNewMoreInfo = stateObj && computeShowNewMoreInfo(stateObj);
    // A body that draws nothing leaves the frame's state card to show the
    // state, so the state is never missing from the dialog.
    const hasOwnHeadline =
      !(stateObj && bodyDrawsNothing(domain, stateObj)) &&
      (DOMAINS_WITH_OWN_HEADLINE.includes(domain) ||
        domainMoreInfoType(domain) === "default");
    const hasOwnChart = DOMAINS_WITH_OWN_CHART.includes(domain);
    const isFullHeight =
      isNewMoreInfo || DOMAINS_FULL_HEIGHT_MORE_INFO.includes(domain);

    return html`
      <div class="container" data-domain=${domain}>
        ${
          !stateObj
            ? html`<ha-alert alert-type="warning">
                ${
                  this.entry?.disabled_by
                    ? this.hass.localize(
                        "ui.dialogs.entity_registry.editor.entity_disabled"
                      )
                    : this.hass.localize(
                        "ui.dialogs.entity_registry.editor.unavailable"
                      )
                }
              </ha-alert>`
            : nothing
        }
        ${
          stateObj?.attributes.restored && entityRegObj
            ? html`<ha-alert alert-type="warning">
                ${this.hass.localize(
                  "ui.dialogs.more_info_control.restored.no_longer_provided",
                  {
                    integration: entityRegObj.platform,
                  }
                )}
              </ha-alert>`
            : nothing
        }
        <div class="content">
          ${
            DOMAINS_NO_INFO.includes(domain) || isNewMoreInfo || hasOwnHeadline
              ? ""
              : html`
                  <state-card-content
                    in-dialog
                    .stateObj=${stateObj}
                    .hass=${this.hass}
                  ></state-card-content>
                `
          }
          ${
            DOMAINS_WITH_MORE_INFO.includes(domain) ||
            hasOwnChart ||
            !computeShowHistoryComponent(this.hass, entityId)
              ? ""
              : html`<ha-more-info-history
                  .hass=${this.hass}
                  .entityId=${this.entityId}
                ></ha-more-info-history>`
          }
          ${
            DOMAINS_WITH_MORE_INFO.includes(domain) ||
            !computeShowLogBookComponent(this.hass, entityId)
              ? ""
              : html`<ha-more-info-logbook
                  .hass=${this.hass}
                  .entityId=${this.entityId}
                ></ha-more-info-logbook>`
          }
          <more-info-content
            ?full-height=${isFullHeight}
            .stateObj=${stateObj}
            .hass=${this.hass}
            .entry=${this.entry}
            .editMode=${this.editMode}
            .data=${this.data}
          ></more-info-content>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
    }
    .container {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .content {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: var(--ha-space-6);
      padding-bottom: max(var(--safe-area-inset-bottom), var(--ha-space-6));
    }

    [data-domain="camera"] .content {
      padding: 0;
      /* max height of the video is full screen, minus the height of the header of the dialog (79px) and the max height of the dialog (mdc-dialog-max-height: calc(100% - 72px)) and the actions bar 60px */
      --video-max-height: calc(100vh - 72px - 79px - 60px);
    }

    more-info-content {
      position: relative;
      display: flex;
      flex-direction: column;
    }
    more-info-content[full-height] {
      flex: 1;
    }

    state-card-content,
    ha-more-info-history,
    ha-more-info-logbook:not(:last-child) {
      display: block;
      margin-bottom: var(--ha-space-4);
    }

    ha-more-info-history,
    ha-more-info-logbook {
      margin-inline: calc(var(--ha-space-6) * -1);
    }

    ha-alert {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-more-info-info": MoreInfoInfo;
  }
}
