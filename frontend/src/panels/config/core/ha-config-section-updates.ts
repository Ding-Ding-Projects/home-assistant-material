import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiChevronRight,
  mdiDotsVertical,
  mdiHistory,
  mdiLocationEnter,
  mdiLocationExit,
  mdiRefresh,
  mdiUpdate,
} from "@mdi/js";
import type {
  HassEntities,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent } from "../../../common/dom/fire_event";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { navigate } from "../../../common/navigate";
import "../../../components/animation/ha-fade-in";
import "../../../components/entity/state-badge";
import "../../../components/ha-alert";
import { installUpdatesTracked } from "../../../components/update-progress/update-install-tracker";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import type { AutoUpdateInfo } from "../../../data/auto-update";
import {
  autoUpdateRowState,
  formatAutoUpdateTime,
  setAutoUpdateAll,
  setAutoUpdateBackup,
  setAutoUpdateEntity,
  subscribeAutoUpdate,
} from "../../../data/auto-update";
import type { ManagerState } from "../../../data/backup_manager";
import { subscribeBackupEvents } from "../../../data/backup_manager";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import type {
  HassioSupervisorInfo,
  SupervisorOptions,
} from "../../../data/hassio/supervisor";
import {
  fetchHassioSupervisorInfo,
  reloadSupervisor,
  setSupervisorOption,
} from "../../../data/hassio/supervisor";
import type { UpdateEntity } from "../../../data/update";
import {
  checkForEntityUpdates,
  filterUpdateEntities,
  filterUpdateEntitiesParameterized,
  isSystemUpdate,
  latestVersionIsSkipped,
  updateIsInstalling,
  UpdateEntityFeature,
} from "../../../data/update";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import { showJoinBetaDialog } from "./updates/show-dialog-join-beta";

type UpdateRowVariant = "install" | "skipped" | "manual" | "current";

// How many up to date entries the card shows before the person asks for all
const CURRENT_PREVIEW = 6;

@customElement("ha-config-section-updates")
class HaConfigSectionUpdates extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _showSkipped = false;

  @state() private _showAllCurrent = false;

  @state() private _backupState?: ManagerState;

  @state() private _supervisorInfo?: HassioSupervisorInfo;

  @state() private _autoInfo?: AutoUpdateInfo;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    if (isComponentLoaded(this.hass.config, "hassio")) {
      this._refreshSupervisorInfo();
    }
  }

  protected hassSubscribe(): Promise<UnsubscribeFunc>[] {
    const subscriptions: Promise<UnsubscribeFunc>[] = [];

    if (this.hass.user?.is_admin) {
      subscriptions.push(
        subscribeAutoUpdate(this.hass, (info) => {
          this._autoInfo = info;
        }).catch(() => {
          // An older server has no automatic updates; the page works without.
          this._autoInfo = undefined;

          return () => undefined;
        })
      );
    }

    if (!this._watchesBackups()) {
      return subscriptions;
    }

    subscriptions.push(
      subscribeBackupEvents(this.hass, (event) => {
        this._backupState = event.manager_state;
      }).catch(() => {
        // Show the page anyway; a blocked update reports its own error.
        this._backupState = "idle";

        return () => undefined;
      })
    );
    return subscriptions;
  }

  // The Supervisor only holds back the updates it manages.
  private _watchesBackups(): boolean {
    return (
      isComponentLoaded(this.hass.config, "backup") &&
      isComponentLoaded(this.hass.config, "hassio")
    );
  }

  private _backupStateLoading(): boolean {
    return this._backupState === undefined && this._watchesBackups();
  }

  private _backupInProgressAlert() {
    switch (this._backupState) {
      case "create_backup":
      case "receive_backup":
      case "restore_backup":
        return html`<ha-alert
          alert-type="info"
          .title=${this.hass.localize(
            `ui.panel.config.updates.backup_in_progress.title.${this._backupState}`
          )}
        >
          ${this.hass.localize(
            `ui.panel.config.updates.backup_in_progress.${this._backupState}`,
            {
              backups_link: html`<a href="/config/backup"
                >${this.hass.localize(
                  "ui.panel.config.updates.backup_in_progress.backups_link"
                )}</a
              >`,
            }
          )}
        </ha-alert>`;
      default:
        return undefined;
    }
  }

  private _backupInProgress(): boolean {
    return (
      this._backupState === "create_backup" ||
      this._backupState === "receive_backup" ||
      this._backupState === "restore_backup"
    );
  }

  protected render(): TemplateResult {
    const installableUpdates = this._filterInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );
    const notInstallableUpdates = this._filterNotInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName,
      this._showSkipped
    );
    const skippedUpdates = this._filterSkippedUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName,
      this._showSkipped
    );
    const currentUpdates = this._filterCurrentUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );

    const backupInProgressAlert = this._backupInProgressAlert();
    const readyCount = installableUpdates.length + notInstallableUpdates.length;

    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.updates.caption")}
      >
        <div slot="toolbar-icon">
          <ha-dropdown @wa-select=${this._handleOverflowAction}>
            <ha-icon-button
              slot="trigger"
              .label=${this.hass.localize("ui.common.menu")}
              .path=${mdiDotsVertical}
            ></ha-icon-button>

            <ha-dropdown-item
              type="checkbox"
              .checked=${this._showSkipped}
              value="show_skipped"
            >
              ${this.hass.localize("ui.panel.config.updates.show_skipped")}
            </ha-dropdown-item>
            ${
              this._supervisorInfo
                ? html`
                    <wa-divider></wa-divider>
                    <ha-dropdown-item
                      value="toggle_beta"
                      .disabled=${this._supervisorInfo.channel === "dev"}
                    >
                      <ha-svg-icon
                        .path=${
                          this._supervisorInfo.channel === "stable"
                            ? mdiLocationEnter
                            : mdiLocationExit
                        }
                        slot="icon"
                      ></ha-svg-icon>
                      ${this.hass.localize(
                        `ui.panel.config.updates.${this._supervisorInfo.channel === "stable" ? "join" : "leave"}_beta`
                      )}
                    </ha-dropdown-item>
                  `
                : nothing
            }
          </ha-dropdown>
        </div>
        ${
          this._backupStateLoading()
            ? html`
                <ha-fade-in class="loading" .delay=${1000}>
                  <ha-spinner></ha-spinner>
                </ha-fade-in>
              `
            : html`
                <div class="page">
                  ${
                    backupInProgressAlert &&
                    installableUpdates.some((entity) =>
                      this._isAppUpdate(entity)
                    )
                      ? backupInProgressAlert
                      : nothing
                  }
                  ${this._renderHero(installableUpdates, readyCount)}
                  ${this._renderAutomatic()}
                  ${
                    installableUpdates.length
                      ? html`<div class="rows">
                          ${installableUpdates.map((entity) =>
                            this._renderRow(entity, "install")
                          )}
                        </div>`
                      : nothing
                  }
                  ${
                    notInstallableUpdates.length
                      ? this._renderListSection(
                          this.hass.localize(
                            "ui.panel.config.updates.title_not_installable",
                            { count: notInstallableUpdates.length }
                          ),
                          notInstallableUpdates,
                          "manual"
                        )
                      : nothing
                  }
                  ${
                    skippedUpdates.length
                      ? this._renderListSection(
                          this.hass.localize(
                            "ui.panel.config.updates.title_skipped",
                            { count: skippedUpdates.length }
                          ),
                          skippedUpdates,
                          "skipped"
                        )
                      : nothing
                  }
                  <div class="columns">
                    ${this._renderBeforeUpdating()}
                    ${this._renderCurrent(currentUpdates)}
                  </div>
                  ${this._renderFootnote()}
                </div>
              `
        }
      </hass-subpage>
    `;
  }

  private _renderHero(
    installable: UpdateEntity[],
    readyCount: number
  ): TemplateResult {
    const localize = this.hass.localize;
    const updateAll = this._updateAllEntityIds(installable);
    const installing =
      installable.length > 0 &&
      installable.every((entity) => updateIsInstalling(entity));
    return html`
      <div class="hero-row">
        <section class="hero" aria-labelledby="hero-title">
          <span class="eyebrow"
            >${localize("ui.panel.config.updates.caption")}</span
          >
          <h1 id="hero-title">
            ${
              readyCount
                ? localize("ui.panel.config.updates.ready", {
                    count: readyCount,
                  })
                : localize("ui.panel.config.updates.all_current")
            }
          </h1>
          <p>
            ${
              readyCount
                ? localize("ui.panel.config.updates.ready_hint")
                : localize("ui.panel.config.updates.all_current_hint")
            }
          </p>
        </section>
        <div class="hero-actions">
          ${
            updateAll.length > 1
              ? html`<ha-button
                  appearance="filled"
                  .disabled=${installing}
                  @click=${this._updateAll}
                >
                  <ha-svg-icon slot="start" .path=${mdiUpdate}></ha-svg-icon>
                  ${localize("ui.panel.config.updates.update_all")}
                </ha-button>`
              : nothing
          }
          <ha-button appearance="outlined" @click=${this._checkUpdates}>
            <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
            ${localize("ui.panel.config.updates.check_now")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _renderListSection(
    title: string,
    entities: UpdateEntity[],
    variant: UpdateRowVariant
  ): TemplateResult {
    return html`
      <section class="list-section">
        <h2>${title}</h2>
        <div class="rows">
          ${entities.map((entity) => this._renderRow(entity, variant))}
        </div>
      </section>
    `;
  }

  private _renderRow(
    entity: UpdateEntity,
    variant: UpdateRowVariant
  ): TemplateResult {
    const localize = this.hass.localize;
    const name = this.hass.formatEntityName(entity) || entity.entity_id;
    const title = entity.attributes.title;
    const sub =
      title && title !== name ? title : entity.attributes.release_summary || "";
    const installed = entity.attributes.installed_version;
    const latest = entity.attributes.latest_version;
    const installing = updateIsInstalling(entity);
    const system = isSystemUpdate(entity);
    const notesUrl = entity.attributes.release_url;
    const hasNotes =
      !!notesUrl || supportsFeature(entity, UpdateEntityFeature.RELEASE_NOTES);
    const showNotes = variant === "install" || variant === "manual";

    return html`
      <div class="row">
        <button
          class="row-main"
          .entityId=${entity.entity_id}
          @click=${this._openMoreInfo}
        >
          <state-badge
            .title=${title || name}
            .hass=${this.hass}
            .stateObj=${entity}
          ></state-badge>
          <span class="text">
            <span class="name">${name}</span>
            ${sub ? html`<span class="sub">${sub}</span>` : nothing}
            ${this._renderAutoResult(entity)}
          </span>
          ${
            variant === "current"
              ? html`<span class="version">${installed ?? ""}</span>`
              : installed && latest
                ? html`<span
                    class="version"
                    aria-label=${localize(
                      "ui.panel.config.updates.version_change",
                      { installed, latest }
                    )}
                  >
                    <span>${installed}</span>
                    <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
                    <strong>${latest}</strong>
                  </span>`
                : latest
                  ? html`<span class="version"
                      ><strong>${latest}</strong></span
                    >`
                  : nothing
          }
          ${
            variant === "skipped"
              ? html`<span class="chip"
                  >${localize("ui.panel.config.updates.skipped")}</span
                >`
              : nothing
          }
        </button>
        ${variant === "manual" ? nothing : this._renderAutoSwitch(entity)}
        ${
          variant === "current"
            ? html`<span class="chip current"
                >${localize("ui.panel.config.updates.current")}</span
              >`
            : html`
                ${
                  showNotes && hasNotes
                    ? html`<ha-button
                        appearance="plain"
                        size="s"
                        .entityId=${entity.entity_id}
                        .href=${notesUrl || undefined}
                        .target=${notesUrl ? "_blank" : undefined}
                        .rel=${notesUrl ? "noopener noreferrer" : undefined}
                        @click=${notesUrl ? undefined : this._openMoreInfo}
                      >
                        ${localize("ui.panel.config.updates.notes")}
                      </ha-button>`
                    : nothing
                }
                ${
                  variant === "install"
                    ? installing
                      ? html`<span class="installing">
                          <ha-spinner size="small"></ha-spinner>
                          ${localize("ui.panel.config.updates.update_in_progress")}
                        </span>`
                      : html`<ha-button
                          appearance="accent"
                          size="s"
                          .entityId=${entity.entity_id}
                          .disabled=${
                            this._backupInProgress() &&
                            this._isAppUpdate(entity)
                          }
                          @click=${system ? this._openMoreInfo : this._updateOne}
                        >
                          ${localize("ui.common.update")}
                        </ha-button>`
                    : variant === "manual"
                      ? html`<ha-button
                          class="action-spacer"
                          appearance="accent"
                          size="s"
                          inert
                          aria-hidden="true"
                          >${localize("ui.common.update")}</ha-button
                        >`
                      : nothing
                }
              `
        }
      </div>
    `;
  }

  private _renderAutomatic(): TemplateResult | typeof nothing {
    const info = this._autoInfo;
    if (!info) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <section class="card auto-card" aria-labelledby="auto-title">
        <h2 id="auto-title">
          ${localize("ui.panel.config.updates.auto_title")}
        </h2>
        <div class="auto-row">
          <span class="text">
            <span class="name"
              >${localize("ui.panel.config.updates.auto_all")}</span
            >
            <span class="sub"
              >${localize("ui.panel.config.updates.auto_all_help")}</span
            >
          </span>
          <ha-switch
            .checked=${info.all}
            haptic
            @change=${this._toggleAll}
            aria-label=${localize("ui.panel.config.updates.auto_all")}
          ></ha-switch>
        </div>
        <div class="auto-row">
          <span class="text">
            <span class="name"
              >${localize("ui.panel.config.updates.auto_backup")}</span
            >
          </span>
          <ha-switch
            .checked=${info.backup}
            haptic
            @change=${this._toggleBackup}
            aria-label=${localize("ui.panel.config.updates.auto_backup")}
          ></ha-switch>
        </div>
      </section>
    `;
  }

  private _renderAutoSwitch(
    entity: UpdateEntity
  ): TemplateResult | typeof nothing {
    if (!this._autoInfo) {
      return nothing;
    }
    const localize = this.hass.localize;
    const rowState = autoUpdateRowState(this._autoInfo, entity.entity_id);
    if (rowState.reason === "unknown") {
      return nothing;
    }
    const name = this.hass.formatEntityName(entity) || entity.entity_id;
    const hint =
      rowState.reason === "restarts_system"
        ? localize("ui.panel.config.updates.auto_protected")
        : undefined;
    return html`
      <div
        class="auto-switch"
        role="group"
        aria-label=${localize("ui.panel.config.updates.auto_row_label", {
          name,
        })}
        title=${ifDefined(hint)}
      >
        <ha-switch
          .entityId=${entity.entity_id}
          .checked=${rowState.checked}
          .disabled=${rowState.disabled}
          @change=${this._toggleOne}
          aria-describedby=${ifDefined(
            hint ? `auto-hint-${entity.entity_id}` : undefined
          )}
          >${localize("ui.panel.config.updates.auto_row")}</ha-switch
        >
        ${
          hint
            ? html`<span
                class="visually-hidden"
                id="auto-hint-${entity.entity_id}"
                >${hint}</span
              >`
            : nothing
        }
      </div>
    `;
  }

  private _renderAutoResult(
    entity: UpdateEntity
  ): TemplateResult | typeof nothing {
    const result = this._autoInfo?.entities.find(
      (item) => item.entity_id === entity.entity_id
    )?.last_result;
    if (!result) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`<span class="sub auto-result ${result.ok ? "ok" : "failed"}"
      >${
        result.ok
          ? localize("ui.panel.config.updates.auto_ok", {
              time: formatAutoUpdateTime(
                result.time,
                this.hass.locale?.language
              ),
            })
          : localize("ui.panel.config.updates.auto_failed", {
              error: result.error ?? "",
            })
      }</span
    >`;
  }

  private async _toggleAll(ev: Event): Promise<void> {
    await this._saveAuto(() =>
      setAutoUpdateAll(this.hass, (ev.currentTarget as HaSwitch).checked)
    );
  }

  private async _toggleBackup(ev: Event): Promise<void> {
    await this._saveAuto(() =>
      setAutoUpdateBackup(this.hass, (ev.currentTarget as HaSwitch).checked)
    );
  }

  private async _toggleOne(ev: Event): Promise<void> {
    const target = ev.currentTarget as HaSwitch & { entityId: string };
    const enabled = target.checked;
    // Following the switch for everything is stored as no choice at all.
    const choice = enabled === this._autoInfo?.all ? null : enabled;
    await this._saveAuto(() =>
      setAutoUpdateEntity(this.hass, target.entityId, choice)
    );
  }

  private async _saveAuto(save: () => Promise<void>): Promise<void> {
    try {
      await save();
    } catch (err: any) {
      // Put the switches back to what the server holds.
      this._autoInfo = this._autoInfo ? { ...this._autoInfo } : undefined;
      showToast(this, {
        message: extractApiErrorMessage(err),
        duration: 10000,
        dismissable: true,
      });
    }
  }

  private _renderBeforeUpdating(): TemplateResult | typeof nothing {
    if (!isComponentLoaded(this.hass.config, "backup")) {
      return nothing;
    }
    const localize = this.hass.localize;
    return html`
      <section class="card">
        <h2>${localize("ui.panel.config.updates.before_updating")}</h2>
        <button class="link-row" @click=${this._openBackups}>
          <span class="tile"
            ><ha-svg-icon .path=${mdiHistory}></ha-svg-icon
          ></span>
          <span class="text">
            <span class="name"
              >${localize("ui.panel.config.updates.backups_title")}</span
            >
            <span class="sub"
              >${localize("ui.panel.config.updates.backups_description")}</span
            >
          </span>
          <ha-svg-icon class="chevron" .path=${mdiChevronRight}></ha-svg-icon>
        </button>
      </section>
    `;
  }

  private _renderCurrent(
    current: UpdateEntity[]
  ): TemplateResult | typeof nothing {
    if (!current.length) {
      return nothing;
    }
    const shown = this._showAllCurrent
      ? current
      : current.slice(0, CURRENT_PREVIEW);
    const localize = this.hass.localize;
    return html`
      <section class="card">
        <h2>${localize("ui.panel.config.updates.up_to_date")}</h2>
        <div class="rows plain">
          ${shown.map((entity) => this._renderRow(entity, "current"))}
        </div>
        ${
          current.length > CURRENT_PREVIEW
            ? html`<div class="card-actions">
                <ha-button appearance="plain" @click=${this._toggleAllCurrent}>
                  ${
                    this._showAllCurrent
                      ? localize("ui.panel.config.updates.show_fewer")
                      : localize("ui.panel.config.updates.show_all_current", {
                          count: current.length,
                        })
                  }
                </ha-button>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  private _renderFootnote(): TemplateResult {
    const localize = this.hass.localize;
    const channel = this._supervisorInfo?.channel;
    return html`
      <div class="footnote">
        <span>
          ${localize("ui.panel.config.updates.skipped_note")}
          ${
            channel
              ? channel === "stable"
                ? localize("ui.panel.config.updates.beta_off")
                : localize("ui.panel.config.updates.beta_on", { channel })
              : nothing
          }
        </span>
        ${
          channel && channel !== "dev"
            ? html`<ha-button appearance="plain" @click=${this._toggleBeta}>
                ${localize(
                  `ui.panel.config.updates.${channel === "stable" ? "join" : "leave"}_beta`
                )}
              </ha-button>`
            : nothing
        }
      </div>
    `;
  }

  private _isAppUpdate(entity: UpdateEntity): boolean {
    return (
      !isSystemUpdate(entity) &&
      this.hass.entities[entity.entity_id]?.platform === "hassio"
    );
  }

  // The Core, Operating System and Supervisor updates are left out: each of
  // them restarts something, so they are started one at a time from their row.
  private _updateAllEntityIds(installable: UpdateEntity[]): string[] {
    return installable
      .filter(
        (entity) =>
          !isSystemUpdate(entity) &&
          !updateIsInstalling(entity) &&
          !(this._backupInProgress() && this._isAppUpdate(entity))
      )
      .map((entity) => entity.entity_id);
  }

  private _openMoreInfo(ev: Event): void {
    const entityId = (ev.currentTarget as any).entityId as string;
    fireEvent(this, "hass-more-info", { entityId });
  }

  private _openBackups(): void {
    navigate("/config/backup");
  }

  private _toggleAllCurrent(): void {
    this._showAllCurrent = !this._showAllCurrent;
  }

  private async _refreshSupervisorInfo() {
    this._supervisorInfo = await fetchHassioSupervisorInfo(this.hass);
  }

  private _toggleBeta(): void {
    if (!this._supervisorInfo) {
      return;
    }
    if (this._supervisorInfo.channel === "stable") {
      showJoinBetaDialog(this, {
        join: () => this._setChannel("beta"),
      });
    } else {
      this._setChannel("stable");
    }
  }

  private _handleOverflowAction(ev: HaDropdownSelectEvent): void {
    if (ev.detail.item.value === "toggle_beta") {
      this._toggleBeta();
    } else if (ev.detail.item.value === "show_skipped") {
      this._showSkipped = !this._showSkipped;
    }
  }

  private async _setChannel(
    channel: SupervisorOptions["channel"]
  ): Promise<void> {
    try {
      await setSupervisorOption(this.hass, {
        channel,
      });
      await reloadSupervisor(this.hass);
      await this._refreshSupervisorInfo();
    } catch (err: any) {
      showAlertDialog(this, {
        text: extractApiErrorMessage(err),
      });
    }
  }

  private async _checkUpdates(): Promise<void> {
    checkForEntityUpdates(this, this.hass);
  }

  private async _updateAll(): Promise<void> {
    const installable = this._filterInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );
    await this._install(this._updateAllEntityIds(installable));
  }

  private async _updateOne(ev: Event): Promise<void> {
    const entityId = (ev.currentTarget as any).entityId as string;
    await this._install([entityId]);
  }

  private async _install(entityIds: string[]): Promise<void> {
    if (!entityIds.length) {
      return;
    }
    try {
      await installUpdatesTracked(this.hass, entityIds, false);
    } catch (err: any) {
      let message = extractApiErrorMessage(err);
      // The backend error embeds the raw entity_id; swap in the update's name.
      for (const entityId of entityIds) {
        const stateObj = this.hass.states[entityId] as UpdateEntity | undefined;
        if (stateObj && message.includes(entityId)) {
          message = message.replaceAll(
            entityId,
            stateObj.attributes.title ||
              this.hass.formatEntityName(stateObj) ||
              entityId
          );
        }
      }
      showToast(this, { message, duration: 10000, dismissable: true });
    }
  }

  private _filterInstallableUpdateEntities = memoizeOne(
    (
      entities: HassEntities,
      formatEntityName: HomeAssistant["formatEntityName"]
    ) =>
      filterUpdateEntitiesParameterized(
        entities,
        formatEntityName,
        false,
        false
      )
  );

  private _filterNotInstallableUpdateEntities = memoizeOne(
    (
      entities: HassEntities,
      formatEntityName: HomeAssistant["formatEntityName"],
      showSkipped: boolean
    ) =>
      filterUpdateEntitiesParameterized(
        entities,
        formatEntityName,
        showSkipped,
        true
      )
  );

  private _filterSkippedUpdateEntities = memoizeOne(
    (
      entities: HassEntities,
      formatEntityName: HomeAssistant["formatEntityName"],
      showSkipped: boolean
    ): UpdateEntity[] => {
      if (!showSkipped) {
        return [];
      }
      return filterUpdateEntities(entities, formatEntityName).filter(
        (entity) =>
          latestVersionIsSkipped(entity) &&
          supportsFeature(entity, UpdateEntityFeature.INSTALL)
      );
    }
  );

  // Updates with nothing waiting: off, and not held back by a skipped version.
  private _filterCurrentUpdateEntities = memoizeOne(
    (
      entities: HassEntities,
      formatEntityName: HomeAssistant["formatEntityName"]
    ): UpdateEntity[] =>
      filterUpdateEntities(entities, formatEntityName).filter(
        (entity) =>
          entity.state === "off" &&
          !!entity.attributes.installed_version &&
          !latestVersionIsSkipped(entity)
      )
  );

  static styles = [
    haStyle,
    css`
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8) 0;
      }
      ha-alert {
        display: block;
      }
      .hero-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .hero-row {
        grid-template-columns: minmax(0, 1fr);
      }
      .hero {
        box-sizing: border-box;
        padding: var(--ha-space-6) var(--ha-space-8);
        border-radius: var(--ha-border-radius-3xl);
        color: var(--primary-text-color);
        background: color-mix(
          in srgb,
          var(--primary-color) 22%,
          var(--primary-background-color)
        );
      }
      :host([narrow]) .hero {
        padding: var(--ha-space-4) var(--ha-space-5);
      }
      .eyebrow {
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
      }
      h1 {
        margin: var(--ha-space-1) 0 var(--ha-space-2);
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-4xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      :host([narrow]) h1 {
        font-size: var(--ha-font-size-2xl);
      }
      .hero p {
        margin: 0;
        line-height: var(--ha-line-height-normal);
      }
      .hero-actions {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        min-width: 180px;
      }
      :host([narrow]) .hero-actions {
        flex-direction: row;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0 0 var(--ha-space-3);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .list-section h2 {
        margin-inline: var(--ha-space-2);
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-2xl);
        background: var(--card-background-color);
      }
      .rows.plain .row {
        padding-inline: 0;
        background: none;
      }
      button {
        font: inherit;
        color: inherit;
        text-align: start;
        background: none;
        border: none;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .row-main {
        display: flex;
        flex: 1;
        align-items: center;
        gap: var(--ha-space-4);
        min-width: 0;
        padding: var(--ha-space-1);
        border-radius: var(--ha-border-radius-xl);
      }
      .text {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--ha-space-1);
        min-width: 0;
      }
      .name {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .sub {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      .version {
        display: inline-flex;
        flex: none;
        align-items: center;
        gap: var(--ha-space-1);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .version strong {
        color: var(--primary-text-color);
      }
      .version ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      :host([narrow]) .row {
        flex-wrap: wrap;
      }
      :host([narrow]) .row-main {
        flex: 1 1 100%;
        flex-wrap: wrap;
      }
      .chip {
        flex: none;
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        background: var(--secondary-background-color);
      }
      .chip.current {
        background: color-mix(
          in srgb,
          var(--success-color) 30%,
          var(--primary-background-color)
        );
      }
      /* Rows that cannot be installed keep the width of the Update button so
         their version and notes line up with the rows above and below. */
      .action-spacer {
        visibility: hidden;
        pointer-events: none;
      }
      :host([narrow]) .action-spacer {
        display: none;
      }
      .auto-card h2 {
        margin-bottom: var(--ha-space-2);
      }
      .auto-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        padding: var(--ha-space-2) 0;
      }
      .auto-switch {
        flex: none;
        display: inline-flex;
        align-items: center;
      }
      .auto-result.failed {
        color: var(--error-color);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .installing {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .columns,
      .columns:has(> :only-child) {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 800px) {
        .columns {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .card {
        box-sizing: border-box;
        padding: var(--ha-space-5) var(--ha-space-6);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
      }
      .link-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        width: 100%;
        padding: var(--ha-space-2) 0;
        border-radius: var(--ha-border-radius-xl);
      }
      .tile {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-xl);
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .chevron {
        flex: none;
        color: var(--secondary-text-color);
      }
      .card-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: var(--ha-space-2);
      }
      .footnote {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-updates": HaConfigSectionUpdates;
  }
}
