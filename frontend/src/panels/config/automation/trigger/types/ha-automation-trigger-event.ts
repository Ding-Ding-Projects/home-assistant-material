import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { transferObjectDrafts } from "../../../../../common/object-editor/object-model";
import "../../../../../components/action-editors/ha-automation-options-editor";
import "../../../../../components/ha-generic-picker";
import type { PickerComboBoxItem } from "../../../../../components/ha-picker-combo-box";
import "../../../../../components/input/ha-input";
import "../../../../../components/user/ha-users-picker";
import type { EventTrigger } from "../../../../../data/automation";
import type { HomeAssistant } from "../../../../../types";
import type { EventListenerCount } from "../event-type-items";
import { eventTypeItems } from "../event-type-items";
import type { TriggerElement } from "../ha-automation-trigger-row";
import { handleChangeEvent } from "../ha-automation-trigger-row";

@customElement("ha-automation-trigger-event")
export class HaEventTrigger extends LitElement implements TriggerElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trigger!: EventTrigger;

  @property({ type: Boolean }) public disabled = false;

  // What the instance reports; undefined until loaded or when it cannot say.
  @state() private _reported?: EventListenerCount[];

  public static get defaultConfig(): EventTrigger {
    return { trigger: "event", event_type: "" };
  }

  protected async firstUpdated() {
    try {
      this._reported = await this.hass.callApi<EventListenerCount[]>(
        "GET",
        "events"
      );
    } catch (_err) {
      // Not an administrator: the common events and free entry still work.
      this._reported = undefined;
    }
  }

  private _eventItems = (): PickerComboBoxItem[] =>
    eventTypeItems(this._reported, (count) =>
      this.hass.localize("ui.panel.config.tools.tabs.events.listener_count", {
        count,
      })
    );

  protected render() {
    const { event_type, event_data, context } = this.trigger;
    return html`
      ${
        typeof event_type === "string" && !event_type.includes("{{")
          ? html`<ha-generic-picker
              allow-custom-value
              .hass=${this.hass}
              .label=${this.hass.localize(
                "ui.panel.config.automation.editor.triggers.type.event.event_type"
              )}
              .value=${event_type}
              .disabled=${this.disabled}
              .getItems=${this._eventItems}
              @value-changed=${this._typePicked}
            ></ha-generic-picker>`
          : html`<ha-input
              .label=${this.hass.localize(
                "ui.panel.config.automation.editor.triggers.type.event.event_type"
              )}
              name="event_type"
              .value=${event_type}
              .disabled=${this.disabled}
              @change=${this._valueChanged}
            ></ha-input>`
      }
      <ha-automation-options-editor
        .hass=${this.hass}
        .label=${this.hass.localize(
          "ui.panel.config.automation.editor.triggers.type.event.event_data"
        )}
        .value=${event_data}
        .disabled=${this.disabled}
        .draftOwner=${this.trigger}
        .draftKey=${"event_data"}
        @value-changed=${this._dataChanged}
      ></ha-automation-options-editor>
      <br />
      ${this.hass.localize(
        "ui.panel.config.automation.editor.triggers.type.event.context_users"
      )}
      <ha-users-picker
        .disabled=${this.disabled}
        .value=${this._wrapUsersInArray(context?.user_id)}
        @value-changed=${this._usersChanged}
      ></ha-users-picker>
    `;
  }

  private _wrapUsersInArray(user_id: string | string[] | undefined): string[] {
    if (!user_id) {
      return [];
    }
    if (typeof user_id === "string") {
      return [user_id];
    }
    return user_id;
  }

  private _typePicked(ev: CustomEvent<{ value?: string }>): void {
    ev.stopPropagation();
    if (this.disabled) return;
    const value = (ev.detail.value ?? "").trim();
    if (value === this.trigger.event_type) return;
    fireEvent(this, "value-changed", {
      value: { ...this.trigger, event_type: value },
    });
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    handleChangeEvent(this, ev);
  }

  private _dataChanged(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    if (this.disabled) return;
    const value = { ...this.trigger, event_data: ev.detail.value };
    transferObjectDrafts(this.trigger, value);
    fireEvent(this, "value-changed", { value });
  }

  private _usersChanged(ev) {
    ev.stopPropagation();
    const value = { ...this.trigger };
    if (!ev.detail.value.length && value.context) {
      delete value.context.user_id;
    } else {
      if (!value.context) {
        value.context = {};
      }
      value.context.user_id = ev.detail.value;
    }
    fireEvent(this, "value-changed", {
      value,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trigger-event": HaEventTrigger;
  }
}
