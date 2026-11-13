import {
  mdiAccountGroup,
  mdiDelete,
  mdiInformationOutline,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { stringCompare } from "../../../common/string/compare";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-checkbox";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/user/ha-user-badge";
import {
  getDashboardConditions,
  saveDashboardConditions,
} from "../../../data/dashboard-visibility";
import type { LovelaceDashboard } from "../../../data/lovelace/dashboard";
import { fetchDashboards } from "../../../data/lovelace/dashboard";
import { getDefaultPanelUrlPath } from "../../../data/panel";
import type { PresentationRole } from "../../../data/presentation-roles";
import {
  addRole,
  normalizeRoles,
  removeRole,
  renameRole,
  roleRule,
  savePresentationRoles,
  setRoleHidden,
  setRoleUsers,
} from "../../../data/presentation-roles";
import type { User } from "../../../data/user";
import { fetchUsers } from "../../../data/user";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { configSections } from "../config-sections";

const TONES = 4;

/**
 * Presentation roles: named groups of people used to hide dashboards, views
 * and cards in the interface. They never restrict what a person's session can
 * read or call, and the page says so.
 */
@customElement("ha-config-roles")
export class HaConfigRoles extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _users?: User[];

  @state() private _dashboards?: LovelaceDashboard[];

  @state() private _selectedId?: string;

  @state() private _busy = false;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._load();
  }

  private async _load() {
    try {
      const [users, dashboards] = await Promise.all([
        fetchUsers(this.hass.callWS),
        fetchDashboards(this.hass),
      ]);
      this._users = users
        .filter((user) => !user.system_generated)
        .sort((a, b) =>
          stringCompare(a.name, b.name, this.hass.locale.language)
        );
      this._dashboards = dashboards.sort((a, b) =>
        stringCompare(a.title, b.title, this.hass.locale.language)
      );
    } catch (_err) {
      this._users = [];
      this._dashboards = [];
    }
  }

  private get _roles(): PresentationRole[] {
    return normalizeRoles(this.hass.systemData?.presentation_roles);
  }

  protected render() {
    if (!this._users || !this._dashboards) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }
    const roles = this._roles;
    const selected =
      roles.find((role) => role.id === this._selectedId) ?? roles[0];

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.persons}
      >
        <div class="page">
          <header>
            <div class="titles">
              <h1>${this.hass.localize("ui.panel.config.roles.caption")}</h1>
              <p>
                ${this.hass.localize("ui.panel.config.roles.summary", {
                  count: roles.length,
                })}
              </p>
            </div>
            <ha-button size="l" @click=${this._newRole} .disabled=${this._busy}>
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.roles.new_role")}
            </ha-button>
          </header>
          <ha-alert alert-type="info">
            ${this.hass.localize("ui.panel.config.roles.honest_notice")}
          </ha-alert>
          ${
            roles.length === 0
              ? html`<div class="empty">
                  <ha-svg-icon .path=${mdiAccountGroup}></ha-svg-icon>
                  <p>${this.hass.localize("ui.panel.config.roles.empty")}</p>
                  <ha-button appearance="filled" @click=${this._newRole}>
                    <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                    ${this.hass.localize("ui.panel.config.roles.new_role")}
                  </ha-button>
                </div>`
              : html`<div class="grid">
                  ${this._renderRoleList(roles, selected)}
                  ${selected ? this._renderRole(selected) : nothing}
                </div>`
          }
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _renderRoleList(
    roles: PresentationRole[],
    selected?: PresentationRole
  ) {
    return html`
      <ha-card
        outlined
        class="list"
        role="listbox"
        aria-label=${this.hass.localize("ui.panel.config.roles.caption")}
      >
        ${roles.map(
          (role, index) => html`
            <button
              class=${classMap({
                role: true,
                active: role.id === selected?.id,
                [`tone-${index % TONES}`]: true,
              })}
              role="option"
              aria-selected=${role.id === selected?.id}
              data-id=${role.id}
              @click=${this._selectRole}
            >
              <span class="tile">
                <ha-svg-icon .path=${mdiAccountGroup}></ha-svg-icon>
              </span>
              <span class="text">
                <span class="name">${role.name}</span>
                <span class="people">
                  ${this.hass.localize("ui.panel.config.roles.people_count", {
                    count: role.users.length,
                  })}
                </span>
              </span>
            </button>
          `
        )}
      </ha-card>
    `;
  }

  private _renderRole(role: PresentationRole) {
    const defaultPath = getDefaultPanelUrlPath(this.hass);
    const map = this.hass.systemData?.dashboard_visibility;
    return html`
      <div class="detail">
        <ha-card outlined>
          <div class="card-header">
            <h2>${role.name}</h2>
            <div class="actions">
              <ha-icon-button
                .label=${this.hass.localize("ui.panel.config.roles.rename")}
                .path=${mdiPencil}
                @click=${this._renameSelected}
              ></ha-icon-button>
              <ha-icon-button
                .label=${this.hass.localize("ui.panel.config.roles.delete")}
                .path=${mdiDelete}
                @click=${this._deleteSelected}
              ></ha-icon-button>
            </div>
          </div>
          <h3>${this.hass.localize("ui.panel.config.roles.people_title")}</h3>
          ${
            this._users!.length
              ? this._users!.map(
                  (user) => html`
                    <label class="row">
                      <ha-checkbox
                        .checked=${role.users.includes(user.id)}
                        .disabled=${this._busy}
                        data-id=${user.id}
                        @change=${this._userToggled}
                      ></ha-checkbox>
                      <ha-user-badge .user=${user}></ha-user-badge>
                      <span class="grow">${user.name}</span>
                    </label>
                  `
                )
              : html`<p class="muted">
                  ${this.hass.localize("ui.panel.config.roles.no_users")}
                </p>`
          }
        </ha-card>
        <ha-card outlined>
          <h3>
            ${this.hass.localize("ui.panel.config.roles.dashboards_title", {
              role: role.name,
            })}
          </h3>
          <p class="muted">
            ${this.hass.localize("ui.panel.config.roles.dashboards_text")}
          </p>
          ${
            this._dashboards!.length
              ? this._dashboards!.map((dashboard) => {
                  const rule = roleRule(
                    getDashboardConditions(map, dashboard.url_path),
                    role.id
                  );
                  const isDefault = dashboard.url_path === defaultPath;
                  return html`
                    <div class="row">
                      <span class="grow">${dashboard.title}</span>
                      ${
                        rule === "custom"
                          ? html`<span class="muted">
                              ${this.hass.localize(
                                "ui.panel.config.roles.custom_rule"
                              )}
                            </span>`
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
                              .active=${rule === "hide" ? "hide" : "show"}
                              .disabled=${this._busy || isDefault}
                              .title=${
                                isDefault
                                  ? this.hass.localize(
                                      "ui.panel.config.roles.default_never_hidden"
                                    )
                                  : ""
                              }
                              data-path=${dashboard.url_path}
                              @value-changed=${this._dashboardRuleChanged}
                            ></ha-button-toggle-group>`
                      }
                    </div>
                  `;
                })
              : html`<p class="muted">
                  ${this.hass.localize("ui.panel.config.roles.no_dashboards")}
                </p>`
          }
          <div class="note">
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            <span>
              ${this.hass.localize("ui.panel.config.roles.views_and_cards_hint")}
            </span>
          </div>
        </ha-card>
      </div>
    `;
  }

  private get _selected(): PresentationRole | undefined {
    const roles = this._roles;
    return roles.find((role) => role.id === this._selectedId) ?? roles[0];
  }

  private _selectRole(ev: Event) {
    this._selectedId = (ev.currentTarget as HTMLElement).dataset.id;
  }

  private _renameSelected() {
    const role = this._selected;
    if (role) {
      this._renameRole(role);
    }
  }

  private _deleteSelected() {
    const role = this._selected;
    if (role) {
      this._deleteRole(role);
    }
  }

  private _userToggled(ev: Event) {
    const role = this._selected;
    const target = ev.currentTarget as HTMLElement & { checked: boolean };
    if (role && target.dataset.id) {
      this._toggleUser(role, target.dataset.id, target.checked);
    }
  }

  private _dashboardRuleChanged(ev: CustomEvent<{ value: string }>) {
    const role = this._selected;
    const urlPath = (ev.currentTarget as HTMLElement).dataset.path;
    if (role && urlPath) {
      this._setDashboardHidden(urlPath, role.id, ev.detail.value === "hide");
    }
  }

  private async _run(work: () => Promise<void>) {
    this._busy = true;
    try {
      await work();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.roles.save_failed"),
        text: err?.message ?? String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _newRole() {
    const name = await showPromptDialog(this, {
      title: this.hass.localize("ui.panel.config.roles.new_role"),
      inputLabel: this.hass.localize("ui.panel.config.roles.name"),
      confirmText: this.hass.localize("ui.common.add"),
    });
    if (!name?.trim()) {
      return;
    }
    const roles = addRole(this._roles, name);
    await this._run(() => savePresentationRoles(this.hass.connection, roles));
    this._selectedId = roles[roles.length - 1]?.id;
  }

  private async _renameRole(role: PresentationRole) {
    const name = await showPromptDialog(this, {
      title: this.hass.localize("ui.panel.config.roles.rename"),
      inputLabel: this.hass.localize("ui.panel.config.roles.name"),
      defaultValue: role.name,
      confirmText: this.hass.localize("ui.common.save"),
    });
    if (!name?.trim() || name.trim() === role.name) {
      return;
    }
    await this._run(() =>
      savePresentationRoles(
        this.hass.connection,
        renameRole(this._roles, role.id, name)
      )
    );
  }

  private async _deleteRole(role: PresentationRole) {
    const ok = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.roles.confirm_delete_title", {
        name: role.name,
      }),
      text: this.hass.localize("ui.panel.config.roles.confirm_delete_text"),
      dismissText: this.hass.localize("ui.common.cancel"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    await this._run(() =>
      savePresentationRoles(
        this.hass.connection,
        removeRole(this._roles, role.id)
      )
    );
    this._selectedId = undefined;
  }

  private async _toggleUser(
    role: PresentationRole,
    userId: string,
    checked: boolean
  ) {
    const users = checked
      ? [...role.users, userId]
      : role.users.filter((id) => id !== userId);
    await this._run(() =>
      savePresentationRoles(
        this.hass.connection,
        setRoleUsers(this._roles, role.id, users)
      )
    );
  }

  private async _setDashboardHidden(
    urlPath: string,
    roleId: string,
    hidden: boolean
  ) {
    const current = getDashboardConditions(
      this.hass.systemData?.dashboard_visibility,
      urlPath
    );
    if ((roleRule(current, roleId) === "hide") === hidden) {
      return;
    }
    await this._run(() =>
      saveDashboardConditions(
        this.hass.connection,
        urlPath,
        setRoleHidden(current, roleId, hidden)
      )
    );
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      }
      @media (max-width: 600px) {
        .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
      }
      header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--ha-space-3);
        margin-bottom: var(--ha-space-4);
      }
      .titles {
        flex: 1;
        min-width: 220px;
      }
      h1 {
        margin: 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-4xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      @media (max-width: 600px) {
        h1 {
          font-size: var(--ha-font-size-2xl);
        }
      }
      .titles p {
        margin: var(--ha-space-1) 0 0;
        font-size: var(--ha-font-size-l);
        color: var(--secondary-text-color);
      }
      ha-alert {
        display: block;
        margin-bottom: var(--ha-space-4);
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
        gap: var(--ha-space-4);
        align-items: start;
      }
      @media (max-width: 720px) {
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      ha-card {
        border-radius: var(--ha-border-radius-3xl);
        padding: var(--ha-space-4);
      }
      .detail {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      button.role {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        width: 100%;
        padding: var(--ha-space-2);
        border: none;
        border-radius: var(--ha-border-radius-xl);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      button.role:hover,
      button.role:focus-visible {
        background: var(--secondary-background-color);
      }
      button.role.active {
        background: var(
          --ha-color-primary-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-primary-container, inherit);
      }
      .tile {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-lg);
        background: color-mix(
          in srgb,
          var(--tone, var(--primary-color)) 22%,
          var(--card-background-color)
        );
      }
      .tone-1 {
        --tone: var(--accent-color, var(--primary-color));
      }
      .tone-2 {
        --tone: var(--warning-color, var(--primary-color));
      }
      .tone-3 {
        --tone: var(--success-color, var(--primary-color));
      }
      .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .name {
        font-weight: var(--ha-font-weight-semibold, 600);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .people,
      .muted {
        color: var(--secondary-text-color);
      }
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      h2,
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
      }
      h3 {
        margin-top: var(--ha-space-3);
        font-size: var(--ha-font-size-l);
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
      }
      .note {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        margin-top: var(--ha-space-3);
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .note ha-svg-icon {
        flex: none;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-8) var(--ha-space-4);
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-roles": HaConfigRoles;
  }
}
