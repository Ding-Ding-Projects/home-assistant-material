import { mdiSend } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-yaml-editor";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import { showAlertDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { documentationUrl } from "../../../../util/documentation-url";
import "./event-subscribe-card";
import "./events-list";

@customElement("tools-event")
class HaPanelDevEvent extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _eventType = "";

  @state() private _eventData: object = {};

  @state() private _isValid = true;

  @state() private _selectedEventType = "";

  protected render(): TemplateResult {
    const localize = this.hass.localize;
    return html`
      <div class="content">
        <div class="column">
          <section class="card">
            <h2>${localize("ui.panel.config.tools.tabs.events.fire_title")}</h2>
            <p class="hint">
              ${localize("ui.panel.config.tools.tabs.events.description")}
              <a
                href=${documentationUrl(this.hass, "/docs/configuration/events/")}
                target="_blank"
                rel="noreferrer"
              >
                ${localize("ui.panel.config.tools.tabs.events.documentation")}
              </a>
            </p>
            <ha-input
              .label=${localize("ui.panel.config.tools.tabs.events.type")}
              autofocus
              required
              .value=${this._eventType}
              @change=${this._eventTypeChanged}
            ></ha-input>
            <p class="field-label">
              ${localize("ui.panel.config.tools.tabs.events.data_label")}
            </p>
            <ha-yaml-editor
              .value=${this._eventData}
              .error=${!this._isValid}
              @value-changed=${this._yamlChanged}
            ></ha-yaml-editor>
            <div class="actions">
              <ha-button
                @click=${this._fireEvent}
                appearance="accent"
                .disabled=${!this._isValid}
              >
                <ha-svg-icon slot="start" .path=${mdiSend}></ha-svg-icon>
                ${localize("ui.panel.config.tools.tabs.events.fire_event")}
              </ha-button>
            </div>
          </section>

          <section class="card">
            <h2>
              ${localize("ui.panel.config.tools.tabs.events.active_listeners")}
            </h2>
            <events-list
              @event-selected=${this._eventSelected}
              .hass=${this.hass}
            ></events-list>
          </section>
        </div>

        <event-subscribe-card
          .hass=${this.hass}
          .narrow=${this.narrow}
          .selectedEventType=${this._selectedEventType}
        ></event-subscribe-card>
      </div>
    `;
  }

  private _eventSelected(ev) {
    this._eventType = ev.detail.eventType;
    this._selectedEventType = ev.detail.eventType;
  }

  private _eventTypeChanged(ev: InputEvent) {
    this._eventType = (ev.target as HaInput).value ?? "";
  }

  private _yamlChanged(ev) {
    this._eventData = ev.detail.value;
    this._isValid = ev.detail.isValid;
  }

  private async _fireEvent() {
    if (!this._eventType) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.tools.tabs.events.alert_event_type"
        ),
      });
      return;
    }
    await this.hass.callApi(
      "POST",
      `events/${this._eventType}`,
      this._eventData
    );
    fireEvent(this, "hass-notification", {
      message: this.hass.localize(
        "ui.panel.config.tools.tabs.events.notification_event_fired",
        { type: this._eventType }
      ),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
          display: block;
        }

        .content {
          display: grid;
          grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
          gap: var(--ha-space-4);
          align-items: start;
          padding: var(--ha-space-4);
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        :host([narrow]) .content {
          grid-template-columns: minmax(0, 1fr);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }

        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }

        h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }

        p {
          margin: 0;
        }

        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .field-label {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .actions {
          display: flex;
          justify-content: flex-end;
        }

        a {
          color: var(--primary-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-event": HaPanelDevEvent;
  }
}
