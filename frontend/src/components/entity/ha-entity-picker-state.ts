import type { ContextType } from "@lit/context";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { isValidEntityId } from "../../common/entity/valid_entity_id";
import { consumeEntityState } from "../../common/decorators/consume-context-entry";
import {
  connectionContext,
  formattersContext,
  internationalizationContext,
} from "../../data/context";

/** A read-only, entity-scoped state preview for both picker rows and values. */
@customElement("ha-entity-picker-state")
export class HaEntityPickerState extends LitElement {
  @property({ attribute: "entity-id" }) public entityId?: string;

  @state()
  @consumeEntityState({ entityIdPath: ["entityId"] })
  private _stateObj?: HassEntity;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection?: ContextType<typeof connectionContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: ContextType<typeof formattersContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  protected render() {
    if (
      !this.entityId ||
      !isValidEntityId(this.entityId) ||
      !this._i18n ||
      !this._formatters
    ) {
      return nothing;
    }
    const value = this._stateObj
      ? this._formatters.formatEntityState(this._stateObj)
      : this._i18n.localize("ui.components.entity.entity-picker.state_missing");
    // An old last_changed timestamp does not imply staleness: stable entities
    // may legitimately keep the same state for months. Connection loss does.
    const disconnected = this._connection?.connected === false;
    const label = this._i18n.localize(
      disconnected
        ? "ui.components.entity.entity-picker.state_disconnected"
        : "ui.components.entity.entity-picker.current_state",
      { state: value }
    );
    // Do not announce every live update across a long options list. The text
    // remains available to assistive technology when each option is explored.
    return html`<span .title=${label}>${label}</span>`;
  }

  static styles = css`
    :host {
      display: block;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-entity-picker-state": HaEntityPickerState;
  }
}
