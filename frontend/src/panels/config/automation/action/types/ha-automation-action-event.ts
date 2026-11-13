import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { transferObjectDrafts } from "../../../../../common/object-editor/object-model";
import "../../../../../components/ha-selector/ha-selector-object";
import "../../../../../components/input/ha-input";
import type { HaInput } from "../../../../../components/input/ha-input";
import type { EventAction } from "../../../../../data/script";
import type { HomeAssistant } from "../../../../../types";
import type { ActionElement } from "../ha-automation-action-row";

type EventDataField = "event_data" | "event_data_template";

@customElement("ha-automation-action-event")
export class HaEventAction extends LitElement implements ActionElement {
  private _languageMode = new LanguageModeController(this);
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ type: Boolean }) public disabled = false;
  @property({ attribute: false }) public action!: EventAction;

  public static get defaultConfig(): EventAction {
    return { event: "", event_data: {} };
  }

  protected render() {
    return html`
      <ha-input
        .label=${this.hass.localize("ui.panel.config.automation.editor.actions.type.event.event")}
        .value=${this.action.event}
        .disabled=${this.disabled}
        @change=${this._eventChanged}
      ></ha-input>
      ${this._renderData("event_data")}
      ${"event_data_template" in this.action ? this._renderData("event_data_template") : nothing}
    `;
  }

  private _renderData(field: EventDataField) {
    return html`<ha-selector-object
      .hass=${this.hass}
      .selector=${{ object: {} }}
      .dictionaryOnly=${true}
      .required=${true}
      .disabled=${this.disabled}
      ?inert=${this.disabled}
      .label=${this._languageMode.text(this.hass.localize, `ui.panel.config.automation.editor.actions.type.event.${field}`)}
      .value=${this.action[field]}
      .field=${field}
      .context=${{ draft_owner: this.action, draft_key: field }}
      @value-changed=${this._dataChanged}
    ></ha-selector-object>`;
  }

  private _emit(value: EventAction) {
    transferObjectDrafts(this.action, value);
    fireEvent(this, "value-changed", { value });
  }

  private _dataChanged(
    ev: CustomEvent<{ value: unknown; isValid?: boolean }>
  ): void {
    ev.stopPropagation();
    if (this.disabled || ev.detail.isValid === false) return;
    const field = (ev.currentTarget as HTMLElement & { field: EventDataField })
      .field;
    const data = ev.detail.value;
    if (
      data !== undefined &&
      (data === null || typeof data !== "object" || Array.isArray(data))
    ) {
      return;
    }
    const value = { ...this.action };
    if (data === undefined) delete value[field];
    else value[field] = data as Record<string, unknown>;
    this._emit(value);
  }

  private _eventChanged(ev: InputEvent): void {
    ev.stopPropagation();
    if (this.disabled) return;
    this._emit({ ...this.action, event: (ev.target as HaInput).value ?? "" });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-action-event": HaEventAction;
  }
}
