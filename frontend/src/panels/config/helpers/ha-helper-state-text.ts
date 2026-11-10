import type { HassEntity } from "home-assistant-js-websocket";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeEntityState } from "../../../common/decorators/consume-context-entry";
import "../../../state-display/state-display";

/**
 * The state of a helper as text, kept up to date by the entity state context
 * so a row in the helpers table never shows a stale value.
 */
@customElement("ha-helper-state-text")
export class HaHelperStateText extends LitElement {
  @state()
  @consumeEntityState({ entityIdPath: ["entityId"] })
  private stateObj?: HassEntity;

  @property({ attribute: false }) public entityId!: string;

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }
    return html`<state-display
      .stateObj=${this.stateObj}
      .content=${"state"}
    ></state-display>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-helper-state-text": HaHelperStateText;
  }
}
