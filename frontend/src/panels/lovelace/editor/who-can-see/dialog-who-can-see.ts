import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { stringCompare } from "../../../../common/string/compare";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-button-toggle-group";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/user/ha-user-badge";
import {
  evaluateForPerson,
  normalizeRoles,
  roleLevel,
  roleRule,
  setRoleHidden,
  setRoleLevel,
  visibilityByRole,
} from "../../../../data/presentation-roles";
import type {
  RoleLevel,
  RoleVisibility,
} from "../../../../data/presentation-roles";
import type { User } from "../../../../data/user";
import { fetchUsers } from "../../../../data/user";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { VisibilityCondition } from "../../common/validate-condition";
import type { WhoCanSeeDialogParams } from "./show-dialog-who-can-see";

/**
 * Shows which roles and people see an item, worked out from its real
 * conditions, with a Show or Hide choice for each role. It reports what the
 * interface shows; it is not a statement about access.
 */
@customElement("dialog-who-can-see")
export class DialogWhoCanSee extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: WhoCanSeeDialogParams;

  @state() private _conditions: VisibilityCondition[] = [];

  @state() private _viewOnly: VisibilityCondition[] = [];

  @state() private _users: User[] = [];

  @state() private _open = false;

  public async showDialog(params: WhoCanSeeDialogParams): Promise<void> {
    this._params = params;
    this._conditions = params.conditions;
    this._viewOnly = params.viewOnly ?? [];
    this._open = true;
    try {
      this._users = (await fetchUsers(this.hass.callWS))
        .filter((user) => !user.system_generated)
        .sort((a, b) =>
          stringCompare(a.name, b.name, this.hass.locale.language)
        );
    } catch (_err) {
      this._users = [];
    }
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _sees(item: RoleVisibility["sees"]) {
    return this.hass.localize(
      `ui.panel.lovelace.editor.who_can_see.sees.${item}`
    );
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const roles = normalizeRoles(this.hass.systemData?.presentation_roles);
    const byRole = visibilityByRole(this._conditions, roles);
    const supportsView = !!this._params.viewOnly;
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.lovelace.editor.who_can_see.title",
          { name: this._params.title }
        )}
        @closed=${this._dialogClosed}
      >
        <ha-alert alert-type="info">
          ${this.hass.localize("ui.panel.lovelace.editor.who_can_see.honest")}
        </ha-alert>
        <h3>
          ${this.hass.localize("ui.panel.lovelace.editor.who_can_see.roles")}
        </h3>
        ${
          this._params.viewOnly
            ? html`<p class="muted">
                ${this.hass.localize(
                  "ui.panel.lovelace.editor.who_can_see.view_note"
                )}
              </p>`
            : nothing
        }
        ${
          byRole.length
            ? byRole.map(
                ({ role, sees }) => html`
                  <div class="row">
                    <span class="grow">
                      <span class="name">${role.name}</span>
                      <span class="muted">${this._sees(sees)}</span>
                    </span>
                    ${
                      roleRule(this._conditions, role.id) === "custom"
                        ? html`<span class="muted">
                            ${this.hass.localize(
                              "ui.panel.config.roles.custom_rule"
                            )}
                          </span>`
                        : supportsView
                          ? html`<ha-button-toggle-group
                              size="s"
                              .buttons=${[
                                {
                                  label: this.hass.localize(
                                    "ui.panel.config.roles.level_hidden"
                                  ),
                                  value: "hide",
                                },
                                {
                                  label: this.hass.localize(
                                    "ui.panel.config.roles.level_view"
                                  ),
                                  value: "view",
                                },
                                {
                                  label: this.hass.localize(
                                    "ui.panel.config.roles.level_use"
                                  ),
                                  value: "use",
                                },
                              ]}
                              .active=${roleLevel(
                                this._conditions,
                                this._viewOnly,
                                role.id
                              )}
                              data-id=${role.id}
                              @value-changed=${this._levelChanged}
                            ></ha-button-toggle-group>`
                          : html`<ha-button-toggle-group
                              size="s"
                              .buttons=${[
                                {
                                  label: this.hass.localize(
                                    "ui.panel.config.roles.show"
                                  ),
                                  value: "show",
                                },
                                {
                                  label: this.hass.localize(
                                    "ui.panel.config.roles.hide"
                                  ),
                                  value: "hide",
                                },
                              ]}
                              .active=${
                                roleRule(this._conditions, role.id) === "hide"
                                  ? "hide"
                                  : "show"
                              }
                              data-id=${role.id}
                              @value-changed=${this._ruleChanged}
                            ></ha-button-toggle-group>`
                    }
                  </div>
                `
              )
            : html`<p class="muted">
                ${this.hass.localize(
                  "ui.panel.lovelace.editor.who_can_see.no_roles"
                )}
              </p>`
        }
        <h3>
          ${this.hass.localize("ui.panel.lovelace.editor.who_can_see.people")}
        </h3>
        ${this._users.map((user) => {
          const result = evaluateForPerson(this._conditions, user.id, roles);
          const key = result === undefined ? "depends" : result ? "yes" : "no";
          return html`
            <div class="row">
              <ha-user-badge .user=${user}></ha-user-badge>
              <span class="grow">${user.name}</span>
              <span class="muted">
                ${this.hass.localize(
                  `ui.panel.lovelace.editor.who_can_see.person.${key}`
                )}
              </span>
            </div>
          `;
        })}
        <p class="muted">
          ${this.hass.localize("ui.panel.lovelace.editor.who_can_see.depends_hint")}
        </p>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this.hass.localize("ui.common.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _ruleChanged(ev: CustomEvent<{ value: string }>) {
    const roleId = (ev.currentTarget as HTMLElement).dataset.id;
    if (roleId) {
      this._setHidden(roleId, ev.detail.value === "hide");
    }
  }

  private _levelChanged(ev: CustomEvent<{ value: string }>) {
    const roleId = (ev.currentTarget as HTMLElement).dataset.id;
    const level = ev.detail.value as RoleLevel;
    if (
      !roleId ||
      !["hide", "view", "use"].includes(level) ||
      roleLevel(this._conditions, this._viewOnly, roleId) === level
    ) {
      return;
    }
    const next = setRoleLevel(this._conditions, this._viewOnly, roleId, level);
    this._conditions = next.visibility;
    this._viewOnly = next.view_only;
    this._params?.apply(this._conditions, this._viewOnly);
  }

  private _setHidden(roleId: string, hidden: boolean) {
    if ((roleRule(this._conditions, roleId) === "hide") === hidden) {
      return;
    }
    this._conditions = setRoleHidden(this._conditions, roleId, hidden);
    this._params?.apply(this._conditions);
  }

  static styles = [
    haStyleDialog,
    css`
      h3 {
        margin: var(--ha-space-4) 0 var(--ha-space-1);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) 0;
      }
      .grow {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .name {
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .muted {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-who-can-see": DialogWhoCanSee;
  }
}
