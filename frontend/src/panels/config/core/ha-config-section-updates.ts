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
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
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
import { notesPageUrlForVersion } from "../../../data/build-notes";
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
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haMotionKeyframes } from "../../../resources/motion-styles";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./updates/ha-update-auto-system";
import "./updates/ha-update-changes";
import "./updates/ha-update-coming-soon";
import "./updates/ha-update-history";
import "./updates/ha-update-usb";
import { updateDisplayName } from "./updates/ha-update-queue-card";
import { UpdateQueueController } from "./updates/update-queue-controller";
import {
  orderUpdateQueue,
  updateBlockReason,
  updateRole,
} from "./updates/update-queue";
import { showJoinBetaDialog } from "./updates/show-dialog-join-beta";
import {
  BACKUP_WAIT_MS,
  pageShowsSpinner,
  RetryingLoad,
} from "./updates/update-page-loading";

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

  // True while an operating system update from USB storage is copying or
  // installing; every other Update button waits for it.
  @state() private _usbRunning = false;

  // The backup state did not arrive in time: the page shows itself anyway.
  @state() private _backupWaitOver = false;

  private _backupWaitTimer?: ReturnType<typeof setTimeout>;

  // The Supervisor info loads on its own, with a time limit and retries, so
  // a Supervisor that is still starting never keeps the page from showing.
  private _supervisorLoad = new RetryingLoad(
    () => fetchHassioSupervisorInfo(this.hass),
    () => {
      if (this._supervisorLoad.status === "ready") {
        this._supervisorInfo = this._supervisorLoad.value;
      }
    }
  );

  private _lang = new LanguageModeController(this);

  private _queue = new UpdateQueueController(this, () => this.hass);

  private _text(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.updates.queue.${key}`,
      values
    );
  }

  // A string of this page, in the chosen language mode.
  private _ui(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.updates.${key}`,
      values
    );
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("hass")) {
      // A step that is running, or a stored queue after a reload.
      this._queue.tick();
      const old = changedProps.get("hass") as HomeAssistant | undefined;
      if (old && old.connected === false && this.hass.connected !== false) {
        this._supervisorLoad.retryNow();
      }
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    if (isComponentLoaded(this.hass.config, "hassio")) {
      this._supervisorLoad.start();
    }
    if (this._backupState === undefined && this._watchesBackups()) {
      this._backupWaitTimer = setTimeout(() => {
        this._backupWaitOver = true;
      }, BACKUP_WAIT_MS);
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._supervisorLoad.stop();
    clearTimeout(this._backupWaitTimer);
    this._backupWaitTimer = undefined;
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
    return pageShowsSpinner(
      this._backupState,
      this._watchesBackups(),
      this._backupWaitOver
    );
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
        .header=${this._ui("caption")}
      >
        ${
          this.narrow
            ? nothing
            : // The large title below is the page's title: the header keeps
              // only its tools on a wide screen.
              html`<span slot="header"></span>`
        }
        <div slot="toolbar-icon">
          <ha-dropdown @wa-select=${this._handleOverflowAction}>
            <ha-icon-button
              slot="trigger"
              .label=${this._lang.text(this.hass.localize, "ui.common.menu")}
              .path=${mdiDotsVertical}
            ></ha-icon-button>

            <ha-dropdown-item
              type="checkbox"
              .checked=${this._showSkipped}
              value="show_skipped"
            >
              ${this._ui("show_skipped")}
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
                      ${this._ui(
                        `${this._supervisorInfo.channel === "stable" ? "join" : "leave"}_beta`
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
                  ${this._renderHero(readyCount)} ${this._renderAutomatic()}
                  <ha-update-coming-soon
                    .hass=${this.hass}
                  ></ha-update-coming-soon>
                  ${this._renderQueue(installableUpdates)}
                  ${
                    installableUpdates.length
                      ? html`<div class="rows">
                          ${installableUpdates.map((entity) =>
                            this._renderRow(
                              entity,
                              "install",
                              this._blockText(entity, installableUpdates)
                            )
                          )}
                        </div>`
                      : nothing
                  }
                  <div
                    class="visually-hidden"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    ${this._announcementText()}
                  </div>
                  ${
                    notInstallableUpdates.length
                      ? this._renderListSection(
                          this._ui("title_not_installable", {
                            count: notInstallableUpdates.length,
                          }),
                          notInstallableUpdates,
                          "manual"
                        )
                      : nothing
                  }
                  ${
                    skippedUpdates.length
                      ? this._renderListSection(
                          this._ui("title_skipped", {
                            count: skippedUpdates.length,
                          }),
                          skippedUpdates,
                          "skipped"
                        )
                      : nothing
                  }
                  <div class="columns">
                    ${this._renderBeforeUpdating()}
                    ${this._renderCurrent(currentUpdates)}
                  </div>
                  <ha-update-usb
                    .hass=${this.hass}
                    .blockedBy=${this._usbBlockedBy(installableUpdates)}
                    @usb-update-running=${this._usbRunningChanged}
                  ></ha-update-usb>
                  <ha-update-changes
                    .hass=${this.hass}
                    .narrow=${this.narrow}
                  ></ha-update-changes>
                  <ha-update-history
                    .hass=${this.hass}
                    .supervisorAvailable=${!!this._supervisorInfo}
                    .busy=${this._queue.active || this._usbRunning}
                    .backup=${this._autoInfo?.backup ?? false}
                  ></ha-update-history>
                  ${this._renderFootnote()}
                </div>
              `
        }
      </hass-subpage>
    `;
  }

  private _renderHero(readyCount: number): TemplateResult {
    const localize = this._lang.localizer(this.hass.localize);
    return html`
      <header class="page-head">
        <h1 id="page-title">${localize("ui.panel.config.updates.caption")}</h1>
        <ha-button
          class="check"
          appearance="filled"
          @click=${this._checkUpdates}
        >
          <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
          ${localize("ui.panel.config.updates.check_now")}
        </ha-button>
      </header>
      <section
        class="ready ${readyCount ? "has" : "none"}"
        aria-labelledby="hero-title"
      >
        <h2 id="hero-title">
          ${
            readyCount
              ? localize("ui.panel.config.updates.ready", {
                  count: readyCount,
                })
              : localize("ui.panel.config.updates.all_current")
          }
        </h2>
        <p>
          ${
            readyCount
              ? localize("ui.panel.config.updates.ready_hint")
              : localize("ui.panel.config.updates.all_current_hint")
          }
        </p>
      </section>
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
    variant: UpdateRowVariant,
    blockText?: string
  ): TemplateResult {
    const localize = this._lang.localizer(this.hass.localize);
    const name = this.hass.formatEntityName(entity) || entity.entity_id;
    const title = entity.attributes.title;
    const sub =
      title && title !== name ? title : entity.attributes.release_summary || "";
    const installed = entity.attributes.installed_version;
    const latest = entity.attributes.latest_version;
    const installing = updateIsInstalling(entity);
    const system = isSystemUpdate(entity);
    // Core, Supervisor and the operating system open their page on the
    // public updates log; everything else keeps the link its author gave.
    const notesUrl =
      (system ? notesPageUrlForVersion(latest) : undefined) ||
      entity.attributes.release_url;
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
                            !!blockText ||
                            (this._backupInProgress() &&
                              this._isAppUpdate(entity))
                          }
                          @click=${system ? this._openSystemUpdate : this._updateOne}
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
                ${
                  blockText && variant === "install" && !installing
                    ? html`<span class="block-reason">${blockText}</span>`
                    : nothing
                }
              `
        }
      </div>
    `;
  }

  private _blockText(
    entity: UpdateEntity,
    updates: UpdateEntity[]
  ): string | undefined {
    if (this._usbRunning) {
      return this._text("waiting_usb");
    }
    const reason = updateBlockReason(entity, updates, this._queue.active);
    if (!reason) {
      return undefined;
    }
    return reason.kind === "queue_running"
      ? this._text("waiting_queue")
      : this._text("waiting_for", {
          name: updateDisplayName(this.hass, reason.entityId!),
        });
  }

  private _announcementText(): string {
    const note = this._queue.announcement;
    if (!note) {
      return "";
    }
    switch (note.kind) {
      case "start":
        return this._text("announce_start", {
          name: updateDisplayName(this.hass, note.entityId),
        });
      case "done":
        return this._text("announce_done", {
          name: updateDisplayName(this.hass, note.entityId),
        });
      case "failed":
        return this._text("announce_failed", {
          name: updateDisplayName(this.hass, note.entityId),
        });
      case "stopped":
        return this._text("announce_stopped");
      default:
        return this._text("announce_finished");
    }
  }

  private _renderQueue(
    installable: UpdateEntity[]
  ): TemplateResult | typeof nothing {
    if (this._queue.queue) {
      return html`<ha-update-queue-card
        .hass=${this.hass}
        .controller=${this._queue}
      ></ha-update-queue-card>`;
    }
    const ready = orderUpdateQueue(installable);
    if (ready.length < 2) {
      return nothing;
    }
    const running = installable.find((entity) => updateIsInstalling(entity));
    const reason = this._usbRunning
      ? this._text("waiting_usb")
      : running
        ? this._text("waiting_for", {
            name: updateDisplayName(this.hass, running.entity_id),
          })
        : undefined;
    return html`
      <div class="queue-bar">
        <ha-button
          appearance="filled"
          .disabled=${!!running || this._usbRunning}
          @click=${this._confirmQueue}
        >
          <ha-svg-icon slot="start" .path=${mdiUpdate}></ha-svg-icon>
          ${this._text("button", { count: ready.length })}
        </ha-button>
        ${reason ? html`<span class="block-reason">${reason}</span>` : nothing}
      </div>
    `;
  }

  private _renderAutomatic(): TemplateResult | typeof nothing {
    const info = this._autoInfo;
    if (!info) {
      return nothing;
    }
    const localize = this._lang.localizer(this.hass.localize);
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
        ${
          info.system
            ? html`<ha-update-auto-system
                .hass=${this.hass}
                .system=${info.system}
              ></ha-update-auto-system>`
            : nothing
        }
      </section>
    `;
  }

  private _renderAutoSwitch(
    entity: UpdateEntity
  ): TemplateResult | typeof nothing {
    if (!this._autoInfo) {
      return nothing;
    }
    const localize = this._lang.localizer(this.hass.localize);
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
    const localize = this._lang.localizer(this.hass.localize);
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
    const localize = this._lang.localizer(this.hass.localize);
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
    const localize = this._lang.localizer(this.hass.localize);
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
    const localize = this._lang.localizer(this.hass.localize);
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

  // Checked again when a button is pressed, because the screen may be a
  // moment behind another update that has just started.
  private _isBlockedNow(entityId: string): boolean {
    const entity = this.hass.states[entityId] as UpdateEntity | undefined;
    if (!entity) {
      return true;
    }
    const updates = this._filterInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );
    return (
      this._usbRunning ||
      !!updateBlockReason(entity, updates, this._queue.active)
    );
  }

  // The name of the update that holds the USB install back, if there is one.
  private _usbBlockedBy(installable: UpdateEntity[]): string | undefined {
    if (this._queue.active) {
      return this._text("queue_label");
    }
    const running = installable.find((entity) => updateIsInstalling(entity));
    return running
      ? updateDisplayName(this.hass, running.entity_id)
      : undefined;
  }

  private _usbRunningChanged(ev: CustomEvent<{ running: boolean }>): void {
    this._usbRunning = ev.detail.running;
  }

  private _roleText(entity: UpdateEntity): string {
    return this._text(`role_${updateRole(entity)}`);
  }

  private async _confirmQueue(): Promise<void> {
    const updates = this._filterInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );
    const ready = orderUpdateQueue(updates);
    if (
      ready.length < 2 ||
      this._usbRunning ||
      this._queue.active ||
      updates.some((entity) => updateIsInstalling(entity))
    ) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._text("confirm_title"),
      text: html`
        <p style="margin-block-start: var(--ha-space-3)">
          ${this._text("confirm_intro", { count: ready.length })}
        </p>
        <ol>
          ${ready.map(
            (entity) =>
              html`<li>
                <strong
                  >${updateDisplayName(this.hass, entity.entity_id)}</strong
                >: ${this._roleText(entity)}
              </li>`
          )}
        </ol>
      `,
      confirmText: this._text("confirm_action"),
      dismissText: this._lang.text(this.hass.localize, "ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    // The list may have changed while the dialog was open.
    this._queue.start(
      orderUpdateQueue(
        this._filterInstallableUpdateEntities(
          this.hass.states,
          this.hass.formatEntityName
        )
      ),
      this._autoInfo?.backup ?? false
    );
  }

  private _openSystemUpdate(ev: Event): void {
    const entityId = (ev.currentTarget as any).entityId as string;
    if (this._isBlockedNow(entityId)) {
      return;
    }
    this._openMoreInfo(ev);
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

  private async _updateOne(ev: Event): Promise<void> {
    const entityId = (ev.currentTarget as any).entityId as string;
    if (this._isBlockedNow(entityId)) {
      return;
    }
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
    haMotionKeyframes,
    css`
      /* The shared heading style keeps an h2 on one line and cuts it with an
           ellipsis. Headings on this page are long and must wrap. */
      h1,
      h2,
      h3 {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        max-width: 100%;
      }
      .page {
        box-sizing: border-box;
        max-width: 1200px;
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
      .page-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-4);
        padding: 0 var(--ha-space-2) var(--ha-space-2);
      }
      h1 {
        margin: 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: clamp(40px, 7vw, 72px);
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .check {
        --ha-button-height: 56px;
        --ha-button-border-radius: var(--ha-border-radius-pill);
      }
      /* The phone header already carries the page title, so the large title is
         kept for assistive technology only and the button sits on its own. */
      :host([narrow]) h1 {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      :host([narrow]) .page-head {
        justify-content: flex-end;
        padding: 0;
      }
      :host([narrow]) .check {
        --ha-button-height: 48px;
      }
      :host([narrow]) .ready {
        padding: var(--ha-space-4);
        border-radius: var(--ha-border-radius-4xl, 24px);
      }
      :host([narrow]) .ready h2 {
        font-size: var(--ha-font-size-2xl, 22px);
      }
      .ready {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: clamp(20px, 3vw, 32px) clamp(22px, 4vw, 40px);
        border-radius: calc(var(--ha-border-radius-6xl) + 12px);
        color: var(--primary-text-color);
        background: color-mix(
          in srgb,
          var(--primary-color) 24%,
          var(--card-background-color)
        );
        animation: ha-rise var(--ha-animation-duration-enter, 450ms)
          var(--ha-motion-spring, ease) both;
      }
      .ready.none {
        background: color-mix(
          in srgb,
          var(--success-color) 22%,
          var(--card-background-color)
        );
      }
      .ready h2 {
        margin: 0;
        font-size: clamp(28px, 4.4vw, 44px);
        font-weight: var(--ha-font-weight-bold);
        line-height: 1.05;
        letter-spacing: -0.01em;
      }
      .ready p {
        margin: 0;
        line-height: var(--ha-line-height-normal);
      }
      h2 {
        margin: 0 0 var(--ha-space-3);
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-bold);
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
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 72px;
        padding: var(--ha-space-2) var(--ha-space-4);
        border-radius: var(--ha-border-radius-5xl);
        background: var(--card-background-color);
        animation: ha-rise var(--ha-animation-duration-enter, 450ms)
          var(--ha-motion-spring, ease) both;
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
        flex: 1 1 240px;
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
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-bold);
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
      .row ha-button {
        --ha-button-height: 48px;
      }
      .auto-switch {
        min-height: 48px;
      }
      .block-reason {
        flex: 1 1 100%;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      .queue-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2) var(--ha-space-4);
      }
      .queue-bar ha-button {
        --ha-button-height: 48px;
      }
      .queue-bar .block-reason {
        flex: 1 1 200px;
      }
      /* On a phone the title has its own full line; the versions sit under
         it and the controls wrap in a row below. */
      :host([narrow]) .row {
        flex-wrap: wrap;
      }
      :host([narrow]) .row-main {
        flex: 1 1 100%;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        column-gap: var(--ha-space-3);
        row-gap: var(--ha-space-1);
      }
      :host([narrow]) .row-main state-badge {
        grid-row: 1 / span 3;
      }
      :host([narrow]) .row-main .text,
      :host([narrow]) .row-main .version,
      :host([narrow]) .row-main .chip {
        grid-column: 2;
        justify-self: start;
        min-width: 0;
      }
      :host([narrow]) .row-main .version {
        flex-wrap: wrap;
      }
      :host([narrow]) .row-main {
        min-height: 48px;
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
        border-radius: calc(var(--ha-border-radius-6xl) + 4px);
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
      @media (prefers-reduced-motion: reduce) {
        .ready,
        .row {
          animation: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-updates": HaConfigSectionUpdates;
  }
}
