import { mdiChevronRight, mdiPlus, mdiSpeaker } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import type { CloudStatus } from "../../../data/cloud";
import type { ExposeEntitySettings } from "../../../data/expose";

import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../../types";
import type { AssistPref } from "./assist-pref";
import "./assist-current-device-pref";
import "./assist-pref";
import "./cloud-alexa-pref";
import "./cloud-discover";
import "./cloud-google-pref";
import { voiceAssistantTabs } from "./ha-config-voice-assistants";

/** How many voice devices the overview names before pointing at the list. */
const MAX_VOICE_DEVICES = 4;

@customElement("ha-config-voice-assistants-assistants")
export class HaConfigVoiceAssistantsAssistants extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ attribute: false }) public exposedEntities?: Record<
    string,
    ExposeEntitySettings
  >;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @query("assist-pref") private _assistPref?: AssistPref;

  /** The voice devices that are reachable, named after their entity. */
  private _voiceDevices = memoizeOne(
    (entities: HomeAssistant["entities"], states: HomeAssistant["states"]) =>
      Object.values(entities)
        .filter(
          (entity) =>
            computeDomain(entity.entity_id) === "assist_satellite" &&
            states[entity.entity_id] &&
            states[entity.entity_id].state !== "unavailable"
        )
        .map((entity) => ({
          name: computeStateName(states[entity.entity_id]),
          path: entity.device_id
            ? `/config/devices/device/${entity.device_id}`
            : `/config/entities?search=${entity.entity_id}`,
        }))
  );

  protected render() {
    if (!this.hass) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }

    const hasAssist = isComponentLoaded(this.hass.config, "assist_pipeline");
    const voiceDevices = this._voiceDevices(
      this.hass.entities,
      this.hass.states
    );

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        back-path="/config"
        .route=${this.route}
        .tabs=${voiceAssistantTabs}
        .narrow=${this.narrow}
        content-heading
      >
        <div class="page">
          <div class="heading">
            <div class="heading-text">
              <h1>
                ${this.hass.localize("ui.panel.config.voice_assistants.title")}
              </h1>
              <p>
                ${this.hass.localize(
                  "ui.panel.config.voice_assistants.assistants.summary"
                )}
              </p>
            </div>
            ${
              hasAssist
                ? html`<ha-button @click=${this._addAssistant}>
                    <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                    ${this.hass.localize(
                      "ui.panel.config.voice_assistants.assistants.pipeline.add_assistant"
                    )}
                  </ha-button>`
                : nothing
            }
          </div>
          ${
            hasAssist
              ? html`
                  <assist-pref
                    .hass=${this.hass}
                    .cloudStatus=${this.cloudStatus}
                    .exposedEntities=${this.exposedEntities}
                  ></assist-pref>
                `
              : nothing
          }
          ${
            this.hass.auth.external?.config.hasAssistSettings
              ? html`
                  <assist-current-device-pref
                    .hass=${this.hass}
                  ></assist-current-device-pref>
                `
              : nothing
          }
          <div class="others">
            <div class="column">
              ${
                this.cloudStatus?.logged_in
                  ? html`
                      <cloud-alexa-pref
                        .hass=${this.hass}
                        .exposedEntities=${this.exposedEntities}
                        .cloudStatus=${this.cloudStatus}
                      ></cloud-alexa-pref>
                      <cloud-google-pref
                        .hass=${this.hass}
                        .exposedEntities=${this.exposedEntities}
                        .cloudStatus=${this.cloudStatus}
                      ></cloud-google-pref>
                    `
                  : html`<cloud-discover .hass=${this.hass}></cloud-discover>`
              }
            </div>
            ${
              voiceDevices.length
                ? html`<section class="devices">
                    <h2>
                      ${this.hass.localize(
                        "ui.panel.config.voice_assistants.assistants.pipeline.devices.caption"
                      )}
                    </h2>
                    <ul>
                      ${voiceDevices.slice(0, MAX_VOICE_DEVICES).map(
                        (device) =>
                          html`<li>
                            <a href=${device.path}>
                              <span class="tile"
                                ><ha-svg-icon .path=${mdiSpeaker}></ha-svg-icon
                              ></span>
                              <span class="name">${device.name}</span>
                              <ha-svg-icon
                                class="chevron"
                                .path=${mdiChevronRight}
                              ></ha-svg-icon>
                            </a>
                          </li>`
                      )}
                    </ul>
                    <ha-button
                      appearance="plain"
                      href="/config/voice-assistants/assist/devices"
                    >
                      ${this.hass.localize(
                        "ui.panel.config.voice_assistants.assistants.pipeline.assist_devices",
                        { number: voiceDevices.length }
                      )}
                    </ha-button>
                  </section>`
                : nothing
            }
          </div>
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _addAssistant() {
    this._assistPref?.addAssistant();
  }

  static styles = css`
    .page {
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--ha-space-6) var(--ha-space-8) var(--ha-space-8);
    }
    :host([narrow]) .page {
      padding: var(--ha-space-4) var(--ha-space-3) var(--ha-space-6);
    }
    .heading {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-5);
    }
    .heading-text {
      flex: 1;
      min-width: 220px;
    }
    h1 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-4xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
      color: var(--primary-text-color);
    }
    .heading p {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-l);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    assist-pref,
    assist-current-device-pref {
      display: block;
      margin-bottom: var(--ha-space-4);
    }
    .others {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--ha-space-4);
      align-items: start;
    }
    .column {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      min-width: 0;
    }
    .column > * {
      display: block;
    }
    .devices {
      box-sizing: border-box;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
    }
    .devices h2 {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .devices ul {
      margin: 0 0 var(--ha-space-2);
      padding: 0;
      list-style: none;
    }
    .devices a {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) 0;
      color: var(--primary-text-color);
      text-decoration: none;
    }
    .devices a:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
      border-radius: var(--ha-border-radius-md);
    }
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .chevron {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-voice-assistants-assistants": HaConfigVoiceAssistantsAssistants;
  }
}
