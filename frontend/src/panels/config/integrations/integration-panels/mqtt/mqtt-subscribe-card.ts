import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { mdiContentCopy } from "@mdi/js";
import { formatTime } from "../../../../../common/datetime/format_time";
import { copyToClipboard } from "../../../../../common/util/copy-clipboard";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-icon-button";
import "../../../../../components/ha-markdown";
import type { HaSelectSelectEvent } from "../../../../../components/ha-select";
import "../../../../../components/ha-select";
import "../../../../../components/input/ha-input";
import type { MQTTMessage } from "../../../../../data/mqtt";
import { subscribeMQTTTopic } from "../../../../../data/mqtt";
import type { HomeAssistant } from "../../../../../types";
import { showToast } from "../../../../../util/toast";

import { storage } from "../../../../../common/decorators/storage";
import "../../../../../components/ha-switch";

const qosLevel = ["0", "1", "2"];

@customElement("mqtt-subscribe-card")
class MqttSubscribeCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @storage({
    key: "panel-dev-mqtt-topic-subscribe",
    state: true,
    subscribe: false,
  })
  private _topic = "";

  @state()
  @storage({
    key: "panel-dev-mqtt-qos-subscribe",
    state: true,
    subscribe: false,
  })
  private _qos = "0";

  @state()
  @storage({
    key: "panel-dev-mqtt-json-format",
    state: true,
    subscribe: false,
  })
  private _json_format = false;

  @state() private _subscribed?: () => void;

  @state() private _messages: {
    id: number;
    message: MQTTMessage;
    payload: string;
    time: Date;
  }[] = [];

  private _messageCount = 0;

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    }
  }

  protected render(): TemplateResult {
    return html`
      <ha-card class="content_subscribe_panel">
        <div class="card-content">
          <div class="head">
            <h2>
              ${this.hass.localize("ui.panel.config.mqtt.description_listen")}
            </h2>
            ${
              this._subscribed
                ? html`<span class="live"
                    ><span class="dot"></span>${this.hass.localize(
                      "ui.panel.config.mqtt.live"
                    )}</span
                  >`
                : nothing
            }
            <ha-button
              appearance=${this._subscribed ? "outlined" : "filled"}
              size="s"
              .disabled=${this._topic === ""}
              @click=${this._handleSubmit}
            >
              ${
                this._subscribed
                  ? this.hass.localize("ui.panel.config.mqtt.stop_listening")
                  : this.hass.localize("ui.panel.config.mqtt.start_listening")
              }
            </ha-button>
          </div>
          <form @submit=${this._preventSubmit}>
            <div class="panel-dev-mqtt-subscribe-fields">
              <ha-input
                .label=${
                  this._subscribed
                    ? this.hass.localize("ui.panel.config.mqtt.listening_to")
                    : this.hass.localize("ui.panel.config.mqtt.subscribe_to")
                }
                .disabled=${this._subscribed !== undefined}
                .value=${this._topic}
                @change=${this._handleTopic}
              ></ha-input>
              <ha-select
                .label=${this.hass.localize("ui.panel.config.mqtt.qos")}
                .disabled=${this._subscribed !== undefined}
                .value=${this._qos}
                @selected=${this._handleQos}
                .options=${qosLevel}
              >
              </ha-select>
            </div>
            <p>
              <ha-switch
                @change=${this._handleJSONFormat}
                .checked=${this._json_format}
                >${this.hass!.localize(
                  "ui.panel.config.mqtt.json_formatting"
                )}</ha-switch
              >
            </p>
          </form>
          ${
            this._messages.length
              ? html`<div class="events">
                    ${this._messages.map(
                      (msg) => html`
                        <div class="event">
                          <div class="event-head">
                            <strong class="topic">${msg.message.topic}</strong>
                            <span class="time"
                              >${formatTime(
                                msg.time,
                                this.hass!.locale,
                                this.hass!.config
                              )}</span
                            >
                          </div>
                          <div class="code-block">
                            <ha-icon-button
                              class="copy-button"
                              .path=${mdiContentCopy}
                              .label=${this.hass.localize(
                                "ui.panel.config.mqtt.copy_payload"
                              )}
                              @click=${this._handleCopyClick}
                              data-payload=${msg.payload}
                            ></ha-icon-button>
                            <ha-markdown
                              .content=${`\`\`\`${this._json_format ? "json" : ""}\n${msg.payload}\n\`\`\``}
                            ></ha-markdown>
                          </div>
                          <div class="bottom">
                            QoS: ${msg.message.qos} - Retain:
                            ${Boolean(msg.message.retain)}
                          </div>
                        </div>
                      `
                    )}
                  </div>
                  <p class="count">
                    ${this.hass.localize("ui.panel.config.mqtt.messages_kept", {
                      count: this._messages.length,
                    })}
                  </p>`
              : this._subscribed
                ? html`<p class="count">
                    ${this.hass.localize("ui.panel.config.mqtt.waiting")}
                  </p>`
                : nothing
          }
        </div>
      </ha-card>
    `;
  }

  private _preventSubmit(ev: Event): void {
    ev.preventDefault();
  }

  private _handleTopic(ev: InputEvent): void {
    this._topic = (ev.target as HTMLInputElement).value;
  }

  private _handleQos(ev: HaSelectSelectEvent): void {
    const newValue = ev.detail.value;
    if (Number(newValue) >= 0 && newValue !== this._qos) {
      this._qos = newValue;
    }
  }

  private _handleJSONFormat(ev: CustomEvent) {
    this._json_format = (ev.target! as any).checked;
  }

  private async _handleCopyClick(ev: Event): Promise<void> {
    const payload = (ev.target as HTMLElement).getAttribute("data-payload");
    if (payload) {
      await copyToClipboard(payload);
      showToast(this, {
        message: this.hass.localize("ui.common.copied_clipboard"),
      });
    }
  }

  private async _handleSubmit(): Promise<void> {
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    } else {
      const unsubscribe = await subscribeMQTTTopic(
        this.hass!,
        this._topic,
        (message) => this._handleMessage(message),
        parseInt(this._qos)
      );
      if (!this.isConnected) {
        unsubscribe();
        return;
      }
      this._subscribed = unsubscribe;
    }
  }

  private _handleMessage(message: MQTTMessage) {
    const tail =
      this._messages.length > 30 ? this._messages.slice(0, 29) : this._messages;
    let payload: string;
    if (this._json_format) {
      try {
        payload = JSON.stringify(JSON.parse(message.payload), null, 4);
      } catch (_err: any) {
        payload = message.payload;
      }
    } else {
      payload = message.payload;
    }
    this._messages = [
      {
        payload,
        message,
        time: new Date(),
        id: this._messageCount++,
      },
      ...tail,
    ];
  }

  static styles = css`
    .content_subscribe_panel {
      direction: ltr;
    }
    .head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
    }
    h2 {
      flex: 1;
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success-color);
    }
    .events {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .event {
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--secondary-background-color);
    }
    .event-head {
      display: flex;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .topic {
      font-family: var(--ha-font-family-code);
      overflow-wrap: anywhere;
    }
    .time {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      white-space: nowrap;
    }
    .bottom,
    .count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .count {
      margin: var(--ha-space-3) 0 0;
    }
    .panel-dev-mqtt-subscribe-fields {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    ha-select {
      width: 96px;
    }
    ha-input {
      flex: 1;
      min-width: 160px;
    }
    .code-block {
      position: relative;
    }
    .code-block ha-markdown {
      padding-right: 40px;
      overflow-x: auto;
    }
    .copy-button {
      position: absolute;
      top: 0;
      right: 0;
      z-index: 1;
      color: var(--secondary-text-color);
    }
    @media screen and (max-width: 600px) {
      ha-select {
        display: block;
      }
      ha-input {
        flex: auto;
        width: 100%;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mqtt-subscribe-card": MqttSubscribeCard;
  }
}
