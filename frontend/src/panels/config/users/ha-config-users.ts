import { mdiCheck, mdiInformationOutline, mdiPlus } from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { DataTableSettingsController } from "../../../common/controllers/data-table-settings-controller";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/data-table/ha-data-table-icon";
import "../../../components/ha-button";
import "../../../components/ha-label";
import "../../../components/ha-svg-icon";
import "../../../components/user/ha-user-badge";
import type { User } from "../../../data/user";
import {
  computeUserBadges,
  deleteUser,
  fetchUsers,
  updateUser,
} from "../../../data/user";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage-data-table";
import type { HomeAssistant, Route } from "../../../types";
import { configSections } from "../config-sections";
import { showAddUserDialog } from "./show-dialog-add-user";
import { showUserDetailDialog } from "./show-dialog-user-detail";
import { storage } from "../../../common/decorators/storage";

@customElement("ha-config-users")
export class HaConfigUsers extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _users: User[] = [];

  @state() private _loading = true;

  @state() private _loadFailed = false;

  private _tableSettings = new DataTableSettingsController(this, {
    search: "users-table-search",
    sorting: "users-table-sort",
    grouping: "users-table-grouping",
  });

  @storage({
    key: "users-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "users-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  @storage({
    key: "users-table-collapsed",
    state: false,
    subscribe: false,
  })
  private _activeCollapsed?: string;

  private _columns = memoizeOne(
    (narrow: boolean, localize: LocalizeFunc): DataTableColumnContainer => {
      const columns: DataTableColumnContainer<User & { group: string }> = {
        avatar: {
          title: "",
          label: localize("ui.panel.config.users.picker.headers.icon"),
          type: "icon",
          moveable: false,
          showNarrow: true,
          template: (user) =>
            html`<ha-user-badge .user=${user}></ha-user-badge>`,
        },
        name: {
          title: localize("ui.panel.config.users.picker.headers.name"),
          main: true,
          sortable: true,
          filterable: true,
          direction: "asc",
          flex: 2,
          extraTemplate: (user) =>
            user.username
              ? html`<div class="secondary">${user.username}</div>`
              : nothing,
        },
        username: {
          title: localize("ui.panel.config.users.picker.headers.username"),
          sortable: true,
          filterable: true,
          defaultHidden: true,
          template: (user) => html`${user.username || "—"}`,
        },
        group: {
          title: localize("ui.panel.config.users.picker.headers.role"),
          sortable: true,
          filterable: true,
          groupable: true,
          urlName: "group",
          template: (user) => html`<ha-label dense>${user.group}</ha-label>`,
        },
        is_active: {
          title: this.hass.localize(
            "ui.panel.config.users.picker.headers.is_active"
          ),
          type: "icon",
          sortable: true,
          filterable: true,
          minWidth: "96px",
          hidden: narrow,
          template: (user) =>
            user.is_active
              ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
              : "",
        },
        system_generated: {
          title: this.hass.localize(
            "ui.panel.config.users.picker.headers.system"
          ),
          type: "icon",
          sortable: true,
          filterable: true,
          hidden: narrow,
          defaultHidden: true,
          template: (user) =>
            user.system_generated
              ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
              : "",
        },
        local_only: {
          title: localize("ui.panel.config.users.picker.headers.away"),
          sortable: true,
          filterable: true,
          hidden: narrow,
          template: (user) =>
            user.system_generated
              ? nothing
              : user.local_only
                ? html`<ha-label dense
                    >${localize("ui.panel.config.users.picker.home_only")}</ha-label
                  >`
                : html`${localize("ui.panel.config.users.picker.away_allowed")}`,
        },
        icons: {
          title: "",
          label: this.hass.localize(
            "ui.panel.config.users.picker.headers.icon"
          ),
          type: "icon",
          sortable: false,
          filterable: false,
          minWidth: "104px",
          hidden: !narrow,
          showNarrow: true,
          template: (user) => {
            const badges = computeUserBadges(this.hass, user, false);
            if (!badges.length) {
              return nothing;
            }
            return html`${badges.map(
              ([icon, tooltip]) =>
                html`<ha-data-table-icon
                  .path=${icon}
                  .tooltip=${tooltip}
                ></ha-data-table-icon>`
            )}`;
          },
        },
      };

      return columns;
    }
  );

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    this._fetchUsers();
  }

  protected render() {
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.persons}
        .columns=${this._columns(this.narrow, this.hass.localize)}
        .loading=${this._loading}
        .data=${this._userData(this._users, this.hass.localize)}
        .loadError=${
          this._loadFailed
            ? this.hass.localize("ui.panel.config.users.picker.load_failed")
            : undefined
        }
        @retry-load=${this._retryFetchUsers}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        @columns-changed=${this._handleColumnsChanged}
        .initialGroupColumn=${this._tableSettings.grouping}
        .initialCollapsedGroups=${this._activeCollapsed}
        .initialSorting=${this._tableSettings.sorting}
        .summary=${this.hass.localize("ui.panel.config.users.summary")}
        .appendRow=${this._footnote(this.hass.localize)}
        @sorting-changed=${this._tableSettings.sortingChanged}
        @grouping-changed=${this._tableSettings.groupingChanged}
        @collapsed-changed=${this._handleCollapseChanged}
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        sync-url
        @row-click=${this._editUser}
        has-fab
        clickable
      >
        <ha-button slot="fab" size="l" @click=${this._addUser}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.users.picker.add_user")}
        </ha-button>
      </hass-tabs-subpage-data-table>
    `;
  }

  private _footnote = memoizeOne(
    (localize: LocalizeFunc) =>
      html`<div
        style="display: flex; align-items: center; box-sizing: border-box; white-space: normal; gap: var(--ha-space-3); margin: var(--ha-space-2) var(--ha-space-4); padding: var(--ha-space-4) var(--ha-space-5); border-radius: var(--ha-border-radius-xl); background: var(--secondary-background-color); color: var(--secondary-text-color);"
      >
        <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
        <span style="flex: 1 1 0; min-width: 0;"
          >${localize("ui.panel.config.users.picker.footnote")}</span
        >
      </div>`
  );

  private _roleName(user: User, localize: LocalizeFunc): string {
    if (user.system_generated) {
      return localize("ui.panel.config.users.picker.role_system");
    }
    if (user.is_owner || user.group_ids.includes("owner")) {
      return localize("ui.panel.config.users.is_owner");
    }
    if (user.group_ids.includes("system-admin")) {
      return localize("ui.panel.config.users.editor.admin");
    }
    if (user.group_ids.includes("system-read-only")) {
      return localize("ui.panel.config.users.picker.role_read_only");
    }
    return localize("ui.panel.config.users.picker.role_user");
  }

  private _userData = memoizeOne((users: User[], localize: LocalizeFunc) =>
    users.map((user) => ({
      ...user,
      name: user.name || localize("ui.panel.config.users.editor.unnamed_user"),
      group: this._roleName(user, localize),
    }))
  );

  private async _fetchUsers() {
    try {
      this._users = await fetchUsers(this.hass.callWS);
      this._loadFailed = false;
    } catch {
      this._loadFailed = true;

      return;
    } finally {
      this._loading = false;
    }

    this._users.forEach((user) => {
      if (user.is_owner) {
        user.group_ids.unshift("owner");
      }
    });
  }

  private _retryFetchUsers() {
    this._loading = true;
    this._fetchUsers();
  }

  private _editUser(ev: HASSDomEvent<RowClickedEvent>) {
    const id = ev.detail.id;
    const entry = this._users.find((user) => user.id === id);

    if (!entry) {
      return;
    }

    showUserDetailDialog(this, {
      entry,
      replaceEntry: (newEntry: User) => {
        this._users = this._users!.map((ent) =>
          ent.id === newEntry.id ? newEntry : ent
        );
      },
      updateEntry: async (values) => {
        const updated = await updateUser(this.hass!, entry!.id, values);
        this._users = this._users!.map((ent) =>
          ent === entry ? updated.user : ent
        );
      },
      removeEntry: async () => {
        if (
          !(await showConfirmationDialog(this, {
            title: this.hass!.localize(
              "ui.panel.config.users.editor.confirm_user_deletion_title",
              { name: entry.name }
            ),
            text: this.hass!.localize(
              "ui.panel.config.users.editor.confirm_user_deletion_text"
            ),
            dismissText: this.hass!.localize("ui.common.cancel"),
            confirmText: this.hass!.localize("ui.common.delete"),
            destructive: true,
          }))
        ) {
          return false;
        }

        try {
          await deleteUser(this.hass!, entry!.id);
          this._users = this._users!.filter((ent) => ent !== entry);
          return true;
        } catch (_err: any) {
          return false;
        }
      },
    });
  }

  private _addUser() {
    showAddUserDialog(this, {
      userAddedCallback: async (user: User) => {
        if (user) {
          this._users = [...this._users, user];
        }
      },
    });
  }

  private _handleCollapseChanged(ev: CustomEvent) {
    this._activeCollapsed = ev.detail.value;
  }

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-users": HaConfigUsers;
  }
}
