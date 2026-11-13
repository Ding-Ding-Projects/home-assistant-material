import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators";
import { array, assert, literal, object, string } from "superstruct";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-check-list-item";
import "../../../../../components/ha-list";
import { normalizeRoles } from "../../../../../data/presentation-roles";
import type { HomeAssistant } from "../../../../../types";
import type { RoleCondition } from "../../../common/validate-condition";

const roleConditionStruct = object({
  condition: literal("role"),
  roles: array(string()),
});

@customElement("ha-card-condition-role")
export class HaCardConditionRole extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public condition!: RoleCondition;

  @property({ type: Boolean }) public disabled = false;

  public static get defaultConfig(): RoleCondition {
    return { condition: "role", roles: [] };
  }

  protected static validateUIConfig(condition: RoleCondition) {
    return assert(condition, roleConditionStruct);
  }

  protected render() {
    const roles = normalizeRoles(this.hass.systemData?.presentation_roles);
    const selected = this.condition.roles ?? [];

    return html`
      <ha-alert alert-type="info">
        ${this.hass.localize(
          "ui.panel.lovelace.editor.condition-editor.condition.role.helper"
        )}
      </ha-alert>
      ${
        roles.length
          ? html`
              <ha-list @selected=${this._handleSelected} multi>
                ${roles.map(
                  (role) => html`
                    <ha-check-list-item
                      hasMeta
                      .selected=${selected.includes(role.id)}
                    >
                      <span>${role.name}</span>
                    </ha-check-list-item>
                  `
                )}
              </ha-list>
            `
          : html`<p>
              ${this.hass.localize(
                "ui.panel.lovelace.editor.condition-editor.condition.role.no_roles"
              )}
            </p>`
      }
    `;
  }

  private _handleSelected(
    ev: CustomEvent<{ diff: { added: number[]; removed: number[] } }>
  ) {
    const roles = normalizeRoles(this.hass.systemData?.presentation_roles);
    let selected = this.condition.roles ?? [];

    if (ev.detail.diff.added.length) {
      const added = roles[ev.detail.diff.added[0]]?.id;
      if (!added || selected.includes(added)) {
        return;
      }
      selected = [...selected, added];
    } else if (ev.detail.diff.removed.length) {
      const removed = roles[ev.detail.diff.removed[0]]?.id;
      if (!removed || !selected.includes(removed)) {
        return;
      }
      selected = selected.filter((id) => id !== removed);
    } else {
      return;
    }

    const condition: RoleCondition = { ...this.condition, roles: selected };
    fireEvent(this, "value-changed", { value: condition });
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-list {
      --mdc-list-vertical-padding: 0;
    }
    p {
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-card-condition-role": HaCardConditionRole;
  }
}
