import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiChevronDown,
  mdiChevronRight,
  mdiChevronUp,
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
import { STATE_RUNNING } from "home-assistant-js-websocket";
import type { TemplateResult, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import {
  probeLoadedBuild,
  reloadFresh,
} from "../../../util/recover-stale-build";
import { getTopOpenDialogTag } from "../../../dialogs/make-dialog-manager";
import { deepActiveElement } from "../../../common/dom/deep-active-element";
import { searchCountText } from "../../../components/ha-top-bar-search";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent } from "../../../common/dom/fire_event";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { Localize } from "../../../common/language-mode/language-mode";
import { withLanguageMode } from "../../../common/language-mode/language-mode";
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
import type {
  AutoUpdateInfo,
  UpdateRunRecord,
} from "../../../data/auto-update";
import {
  AUTO_SYSTEM_PARTS,
  autoUpdateRowState,
  formatAutoUpdateTime,
  setAutoUpdateAll,
  setAutoUpdateEntity,
  subscribeAutoUpdate,
  subscribeUpdateRun,
} from "../../../data/auto-update";
import type { ManagerState } from "../../../data/backup_manager";
import { subscribeBackupEvents } from "../../../data/backup_manager";
import {
  notesPageUrlForVersion,
  offeredNotesUrl,
} from "../../../data/build-notes";
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
import { isReduced } from "../../../common/motion/page-entry";
import {
  newlyInstalling,
  scrollBehaviorFor,
} from "./updates/scroll-to-installing";
import "./updates/ha-update-auto-system";
import "./updates/ha-update-backup-choice";
import "./updates/ha-update-changes";
import "./updates/ha-update-coming-soon";
import "./updates/ha-update-history";
import "./updates/ha-update-progress-block";
import "./updates/ha-update-usb";
import {
  markFor,
  planQueueBackups,
  settingsFromInfo,
  subjectFor,
  subjectWantsBackup,
} from "./updates/backup-choice";
import type { BackupMark } from "./updates/backup-choice";
import type { ChangesSearchState } from "./updates/ha-update-changes";
import { updateDisplayName } from "./updates/ha-update-queue-card";
import type { ProgressView } from "./updates/update-progress-feed";
import { UpdateProgressFeed } from "./updates/update-progress-feed";
import {
  progressKindOf,
  queueOrderOf,
  queuePositionOf,
  shortSystemName,
} from "./updates/update-progress-model";
import type { ProgressText } from "./updates/update-progress-strings";
import { makeProgressText } from "./updates/update-progress-strings";
import { UpdateQueueController } from "./updates/update-queue-controller";
import {
  orderUpdateQueue,
  supervisorUpdateFirst,
  updateBlockReason,
  updateRole,
} from "./updates/update-queue";
import { showJoinBetaDialog } from "./updates/show-dialog-join-beta";
import {
  BACKUP_WAIT_MS,
  pageShowsSpinner,
  RetryingLoad,
} from "./updates/update-page-loading";
import {
  DISCONNECT_NOTICE_MS,
  focusIsEditing,
  UpdatePageRecovery,
} from "./updates/update-page-recovery";

type Localizer = HomeAssistant["localize"];

type UpdateRowVariant = "install" | "skipped" | "manual" | "current";

// How many up to date entries the card shows before the person asks for all
const CURRENT_PREVIEW = 6;

@customElement("ha-config-section-updates")
class HaConfigSectionUpdates extends SubscribeMixin(LitElement) {
  private get _modeLocalize(): Localize {
    return withLanguageMode(this.hass.localize);
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _showSkipped = false;

  /** The search of the changes list, kept here because it lives in the top bar. */
  @state() private _changesQuery = "";

  @state() private _changesSearch?: ChangesSearchState;

  @state() private _showAllCurrent = false;

  // Rows whose detail line (notes, automatic switch, summary) is open on a phone.
  @state() private _openRows = new Set<string>();

  @state() private _backupState?: ManagerState;

  @state() private _supervisorInfo?: HassioSupervisorInfo;

  @state() private _autoInfo?: AutoUpdateInfo;

  // An "Update everything" run another browser is driving, shown read-only.
  @state() private _sharedRun?: UpdateRunRecord;

  // The automatic updates card rests as one summary row and opens its settings.
  @state() private _autoOpen = false;

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

  // After a restart of Home Assistant the page checks once whether the server
  // still serves the build it runs, reloads itself once when it does not, and
  // offers a reload when the connection stays away.
  private _recovery = new UpdatePageRecovery({
    probe: probeLoadedBuild,
    busy: () =>
      !!window.isDirtyState ||
      getTopOpenDialogTag() !== undefined ||
      focusIsEditing(deepActiveElement()),
    reload: reloadFresh,
    changed: () => this.requestUpdate(),
    storage: (() => {
      try {
        return window.sessionStorage;
      } catch (_err) {
        return undefined;
      }
    })(),
  });

  private _noticeTimer?: ReturnType<typeof setTimeout>;

  private _lang = new LanguageModeController(this);

  private _queue = new UpdateQueueController(this, () => this.hass);

  private _progress = new UpdateProgressFeed(this, () => this.hass);

  private _progressTextFor?: Localizer;

  private _progressTextMode?: string;

  private _progressTextFn?: ProgressText;

  // The labels of the progress block, in the chosen language mode, with a
  // readable English text for any key a translation file does not have yet.
  private _pt(): ProgressText {
    if (
      !this._progressTextFn ||
      this._progressTextFor !== this.hass.localize ||
      this._progressTextMode !== this._lang.mode
    ) {
      this._progressTextFor = this.hass.localize;
      this._progressTextMode = this._lang.mode;
      this._progressTextFn = makeProgressText((key, values) => {
        const text = this._lang.text(this.hass.localize, key, values);
        return text && text !== key ? text : "";
      });
    }
    return this._progressTextFn;
  }

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

  private _changesQueryInput(ev: CustomEvent<{ value: string }>): void {
    this._changesQuery = ev.detail.value ?? "";
  }

  private _changesSearchState(ev: CustomEvent<ChangesSearchState>): void {
    this._changesSearch = ev.detail;
  }

  private _changesQueryClear(): void {
    this._changesQuery = "";
  }

  private _changesSearchCount(): string | undefined {
    const search = this._changesSearch;
    if (!search?.available || this._changesQuery.trim() === "") {
      return undefined;
    }
    return searchCountText(this.hass.localize, {
      current: search.shown,
      total: search.total,
    });
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("hass")) {
      // A step that is running, or a stored queue after a reload.
      this._queue.tick();
      this._progress.sync(
        filterUpdateEntities(this.hass.states, this.hass.formatEntityName)
      );
      this._progress.prune();
      const old = changedProps.get("hass") as HomeAssistant | undefined;
      if (old && old.connected === false && this.hass.connected !== false) {
        this._supervisorLoad.retryNow();
      }
      this._updateRecovery();
    }
  }

  private _updateRecovery(): void {
    const connected = this.hass.connected !== false;
    this._recovery.update({
      connected,
      running: this.hass.config?.state === STATE_RUNNING,
    });
    if (connected) {
      clearTimeout(this._noticeTimer);
      this._noticeTimer = undefined;
    } else if (this._noticeTimer === undefined) {
      // Nothing else changes while the connection is away: show the notice
      // when it is due.
      this._noticeTimer = setTimeout(() => {
        this._noticeTimer = undefined;
        this.requestUpdate();
      }, DISCONNECT_NOTICE_MS + 100);
    }
  }

  private _reloadPage(): void {
    location.reload();
  }

  private _renderRecoveryNotice() {
    if (!this._recovery.noticeDue()) {
      return nothing;
    }
    const key = this._recovery.newerBuild
      ? "recovery.newer_build"
      : "recovery.disconnected";
    return html`<ha-alert alert-type="warning" class="recovery">
      ${this._ui(key)}
      <ha-button slot="action" @click=${this._reloadPage}>
        ${this._ui("recovery.reload")}
      </ha-button>
    </ha-alert>`;
  }

  private _installingIds?: Set<string>;

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (!changedProps.has("hass")) {
      return;
    }
    const running = filterUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    )
      .filter((entity) => updateIsInstalling(entity))
      .map((entity) => entity.entity_id);
    const started = newlyInstalling(this._installingIds, running);
    this._installingIds = new Set(running);
    if (started.length) {
      this.shadowRoot?.getElementById(`row-${started[0]}`)?.scrollIntoView({
        block: "center",
        behavior: scrollBehaviorFor(isReduced()),
      });
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
    clearTimeout(this._noticeTimer);
    this._noticeTimer = undefined;
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
      subscriptions.push(
        subscribeUpdateRun(this.hass, (run) => {
          this._sharedRun = run ?? undefined;
        }).catch(() => {
          // An older server keeps no shared run; only this browser's queue shows.
          this._sharedRun = undefined;

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
          .title=${this._modeLocalize(
            `ui.panel.config.updates.backup_in_progress.title.${this._backupState}`
          )}
        >
          ${this.hass.localize(
            `ui.panel.config.updates.backup_in_progress.${this._backupState}`,
            {
              backups_link: html`<a href="/config/backup"
                >${this._modeLocalize(
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
        .searchable=${!!this._changesSearch?.available}
        .searchLabel=${this._lang.text(
          this.hass.localize,
          "ui.panel.config.updates.compare.search"
        )}
        .searchValue=${this._changesQuery}
        .searchCountText=${this._changesSearchCount()}
        .searchSamples=${this._changesSearch?.samples}
        @top-bar-search-input=${this._changesQueryInput}
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
        ${this._renderRecoveryNotice()}
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
                  ${this._renderHero(readyCount)}
                  <ha-update-coming-soon
                    .hass=${this.hass}
                  ></ha-update-coming-soon>
                  ${this._renderAutomatic()}
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
                  ${this._renderFinished(
                    new Set(installableUpdates.map((item) => item.entity_id))
                  )}
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
                    .query=${this._changesQuery}
                    @changes-search-state=${this._changesSearchState}
                    @changes-query-clear=${this._changesQueryClear}
                  ></ha-update-changes>
                  <ha-update-history
                    .hass=${this.hass}
                    .supervisorAvailable=${!!this._supervisorInfo}
                    .busy=${this._queue.active || this._usbRunning}
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
    const notesUrl = offeredNotesUrl(
      system,
      latest,
      entity.attributes.release_url
    );
    const hasNotes =
      !!notesUrl || supportsFeature(entity, UpdateEntityFeature.RELEASE_NOTES);
    const showNotes =
      variant === "install" || variant === "manual" || variant === "current";
    const supervisorFirst =
      variant === "install"
        ? supervisorUpdateFirst(
            entity,
            this._filterInstallableUpdateEntities(
              this.hass.states,
              this.hass.formatEntityName
            )
          )
        : undefined;
    const view =
      variant === "install" ? this._progress.view(entity) : undefined;
    const shownName = this._rowTitle(entity, name);
    // A phone keeps the resting row to one line of name and one of versions;
    // the summary, notes and the automatic switch open under it.
    const compact =
      !!this.narrow &&
      (variant === "install" || variant === "manual" || variant === "current");
    const open = compact && this._openRows.has(entity.entity_id);
    const autoSwitch =
      variant === "manual" ? nothing : this._renderAutoSwitch(entity);
    const notesButton =
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
        : nothing;

    return html`
      <div
        class="row ${compact ? "compact" : ""}"
        id=${`row-${entity.entity_id}`}
      >
        <button
          class="row-main"
          aria-label=${name}
          .entityId=${entity.entity_id}
          @click=${this._openMoreInfo}
        >
          <state-badge
            .title=${title || name}
            .hass=${this.hass}
            .stateObj=${entity}
          ></state-badge>
          <span class="text">
            <span class="name" title=${name}>${shownName}</span>
            ${sub && !compact ? html`<span class="sub">${sub}</span>` : nothing}
            ${compact ? nothing : this._renderAutoResult(entity)}
            ${compact || variant !== "install" ? nothing : this._renderBackupMark(entity)}
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
        ${compact ? nothing : autoSwitch}
        ${
          variant === "current"
            ? compact
              ? nothing
              : html`<span class="chip current"
                  >${localize("ui.panel.config.updates.current")}</span
                >`
            : html`
                ${compact ? nothing : notesButton}
                ${
                  variant === "install"
                    ? installing
                      ? html`<span class="installing">
                          <ha-spinner size="small"></ha-spinner>
                          ${localize("ui.panel.config.updates.update_in_progress")}
                        </span>`
                      : supervisorFirst
                        ? html`<ha-button
                            appearance="accent"
                            size="s"
                            title=${this._text("supervisor_first_hint")}
                            .entityId=${entity.entity_id}
                            .disabled=${!!blockText}
                            @click=${this._updateSupervisorThenCore}
                          >
                            ${this._text("supervisor_first")}
                          </ha-button>`
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
                    ? this._renderWaiting(entity, blockText)
                    : nothing
                }
              `
        }
        ${
          compact && (sub || autoSwitch !== nothing || hasNotes)
            ? html`<ha-icon-button
                class="row-toggle"
                .path=${open ? mdiChevronUp : mdiChevronDown}
                .label=${localize(
                  open
                    ? "ui.panel.config.updates.row_less"
                    : "ui.panel.config.updates.row_more"
                )}
                aria-expanded=${open ? "true" : "false"}
                .entityId=${entity.entity_id}
                @click=${this._toggleRow}
              ></ha-icon-button>`
            : nothing
        }
        ${
          open
            ? html`<div class="row-detail">
                ${sub ? html`<span class="sub">${sub}</span>` : nothing}
                ${variant === "install" ? this._renderBackupMark(entity) : nothing}
                ${this._renderAutoResult(entity)}
                <div class="row-detail-actions">
                  ${notesButton} ${autoSwitch}
                </div>
              </div>`
            : nothing
        }
        ${
          view
            ? html`<ha-update-progress-block
                class="progress"
                .view=${view}
                .text=${this._pt()}
                .name=${name}
                .notesUrl=${this._notesUrlOf(entity, view)}
                .dismissLabel=${this._modeLocalize("ui.update_progress.dismiss")}
                @update-progress-dismiss=${this._dismissProgress}
              ></ha-update-progress-block>`
            : nothing
        }
      </div>
    `;
  }

  private _toggleRow(ev: Event): void {
    const id = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    const next = new Set(this._openRows);
    if (!next.delete(id)) {
      next.add(id);
    }
    this._openRows = next;
  }

  // The shorter title of a row: the system updates drop "Home Assistant" and
  // "Update", other updates drop a trailing "Update". The full name stays in
  // the accessible name and the tooltip.
  private _rowTitle(entity: UpdateEntity, name: string): string {
    const kind = progressKindOf(
      entity,
      this.hass.entities?.[entity.entity_id]?.platform
    );
    if (kind === "core" || kind === "supervisor" || kind === "os") {
      return shortSystemName(name);
    }
    return name.replace(/\s+update$/i, "").trim() || name;
  }

  private _notesUrlOf(
    entity: UpdateEntity,
    view: ProgressView
  ): string | undefined {
    const kind = view.kind;
    if (kind === "core" || kind === "supervisor" || kind === "os") {
      return notesPageUrlForVersion(view.record.toVersion);
    }
    return entity.attributes.release_url || undefined;
  }

  private _dismissProgress(ev: CustomEvent<{ entityId: string }>): void {
    this._progress.dismiss(ev.detail.entityId);
  }

  // What a waiting update waits for, where it stands in the queue and why.
  private _renderWaiting(
    entity: UpdateEntity,
    blockText: string
  ): TemplateResult {
    const t = this._pt();
    const kind = progressKindOf(
      entity,
      this.hass.entities?.[entity.entity_id]?.platform
    );
    const order = this._queue.active
      ? queueOrderOf(this._queue.queue)
      : orderUpdateQueue(
          this._filterInstallableUpdateEntities(
            this.hass.states,
            this.hass.formatEntityName
          )
        ).map((item) => item.entity_id);
    const place =
      order.length > 1
        ? queuePositionOf(order, entity.entity_id, kind)
        : undefined;
    const after = place?.afterEntityId
      ? updateDisplayName(this.hass, place.afterEntityId)
      : undefined;
    return html`<div class="waiting block-reason">
      ${
        place
          ? html`<span class="place"
              >${
                after
                  ? t("queue_after", {
                      position: place.position,
                      total: place.total,
                      name: after,
                    })
                  : t("queue_place", {
                      position: place.position,
                      total: place.total,
                    })
              }</span
            >`
          : nothing
      }
      <span>${blockText}</span>
      <span
        >${
          place?.restartsSystem ||
          kind === "core" ||
          kind === "supervisor" ||
          kind === "os"
            ? t("waiting_alone")
            : t("waiting_one_at_a_time")
        }</span
      >
    </div>`;
  }

  // Updates that ended a moment ago and are no longer a row of the list to
  // install: the result stays visible until it is closed.
  private _renderFinished(
    shownIds: Set<string>
  ): TemplateResult | typeof nothing {
    const finished = filterUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    )
      .filter((entity) => !shownIds.has(entity.entity_id))
      .map((entity) => ({ entity, view: this._progress.view(entity) }))
      .filter(
        (item): item is { entity: UpdateEntity; view: ProgressView } =>
          !!item.view && !item.view.running
      );
    if (!finished.length) {
      return nothing;
    }
    return html`
      <div class="rows">
        ${finished.map(({ entity, view }) => {
          const name = this.hass.formatEntityName(entity) || entity.entity_id;
          return html`<div class="row finished">
            <div class="finished-title">
              <state-badge .hass=${this.hass} .stateObj=${entity}></state-badge>
              <span class="name" title=${name}
                >${this._rowTitle(entity, name)}</span
              >
            </div>
            <ha-update-progress-block
              class="progress"
              .view=${view}
              .text=${this._pt()}
              .name=${name}
              .notesUrl=${this._notesUrlOf(entity, view)}
              .dismissLabel=${this._modeLocalize("ui.update_progress.dismiss")}
              @update-progress-dismiss=${this._dismissProgress}
            ></ha-update-progress-block>
          </div>`;
        })}
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
    // A run started in another browser is shown read-only; that browser
    // keeps driving it.
    // A failed run may still be retried there, so this browser does not
    // offer a second run beside it.
    const sharedRunning =
      this._sharedRun?.state === "running" ||
      this._sharedRun?.state === "failed";
    const shared = this._sharedRun
      ? html`<ha-update-queue-card
          .hass=${this.hass}
          .controller=${this._queue}
          .sharedRun=${this._sharedRun}
        ></ha-update-queue-card>`
      : nothing;
    const ready = orderUpdateQueue(installable);
    if (ready.length < 2 || sharedRunning) {
      return shared;
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
      ${shared}
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
    const systemOn = info.system
      ? AUTO_SYSTEM_PARTS.filter((part) => info.system!.enabled[part]).length
      : 0;
    const summary = info.system
      ? localize("ui.panel.config.updates.auto_summary_system", {
          apps: localize(
            info.all
              ? "ui.panel.config.updates.auto_on"
              : "ui.panel.config.updates.auto_off"
          ),
          count: systemOn,
          total: AUTO_SYSTEM_PARTS.length,
        })
      : localize("ui.panel.config.updates.auto_summary", {
          apps: localize(
            info.all
              ? "ui.panel.config.updates.auto_on"
              : "ui.panel.config.updates.auto_off"
          ),
        });
    return html`
      <section
        class="card auto-card ${this._autoOpen ? "open" : "folded"}"
        aria-labelledby="auto-title"
      >
        <button
          class="auto-summary"
          aria-expanded=${this._autoOpen ? "true" : "false"}
          aria-controls="auto-body"
          @click=${this._toggleAutoOpen}
        >
          <span class="text">
            <span class="name" id="auto-title"
              >${localize("ui.panel.config.updates.auto_title")}</span
            >
            <span class="sub">${summary}</span>
          </span>
          <ha-svg-icon
            class="chevron"
            .path=${this._autoOpen ? mdiChevronUp : mdiChevronDown}
          ></ha-svg-icon>
        </button>
        <div id="auto-body" ?hidden=${!this._autoOpen}>
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
          ${
            info.system
              ? html`<ha-update-auto-system
                  .hass=${this.hass}
                  .system=${info.system}
                ></ha-update-auto-system>`
              : nothing
          }
        </div>
      </section>
    `;
  }

  private _toggleAutoOpen(): void {
    this._autoOpen = !this._autoOpen;
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
        ${
          this._autoInfo
            ? html`<ha-update-backup-choice
                .hass=${this.hass}
                .info=${this._autoInfo}
                .hasSupervisor=${!!this._supervisorInfo}
              ></ha-update-backup-choice>`
            : nothing
        }
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
    const ordered = orderUpdateQueue(
      this._filterInstallableUpdateEntities(
        this.hass.states,
        this.hass.formatEntityName
      )
    );
    const plan = this._autoInfo
      ? planQueueBackups(
          ordered.map((entity) => this._backupSubject(entity)),
          settingsFromInfo(this._autoInfo)
        )
      : undefined;
    this._queue.start(ordered, !!plan?.carriers.length, plan?.carriers ?? []);
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

  // Core waits for the Supervisor: one press updates the Supervisor, then Core,
  // through the same queue "Update everything" uses.
  private _updateSupervisorThenCore(ev: Event): void {
    const entityId = (ev.currentTarget as any).entityId as string;
    if (this._isBlockedNow(entityId)) {
      return;
    }
    const updates = this._filterInstallableUpdateEntities(
      this.hass.states,
      this.hass.formatEntityName
    );
    const core = updates.find((entity) => entity.entity_id === entityId);
    const supervisor = core ? supervisorUpdateFirst(core, updates) : undefined;
    if (!core || !supervisor) {
      return;
    }
    const ordered = orderUpdateQueue([core, supervisor]);
    const plan = this._autoInfo
      ? planQueueBackups(
          ordered.map((entity) => this._backupSubject(entity)),
          settingsFromInfo(this._autoInfo)
        )
      : undefined;
    this._queue.start(ordered, !!plan?.carriers.length, plan?.carriers ?? []);
  }

  private _backupSubject(entity: UpdateEntity) {
    return subjectFor(
      entity,
      this.hass.entities?.[entity.entity_id]?.platform,
      this._autoInfo
    );
  }

  // The one decision that every way of starting an update shares.
  private _wantsBackupFor(entityId: string): boolean {
    const entity = this.hass.states[entityId] as UpdateEntity | undefined;
    if (!entity || !this._autoInfo) {
      return false;
    }
    return subjectWantsBackup(
      this._backupSubject(entity),
      settingsFromInfo(this._autoInfo)
    );
  }

  private _backupMark(entity: UpdateEntity): BackupMark | undefined {
    return this._autoInfo
      ? markFor(this._backupSubject(entity), settingsFromInfo(this._autoInfo))
      : undefined;
  }

  private _renderBackupMark(
    entity: UpdateEntity
  ): TemplateResult | typeof nothing {
    const mark = this._backupMark(entity);
    if (!mark) {
      return nothing;
    }
    return html`<span class="backup-mark ${mark}"
      >${this._lang.text(
        this.hass.localize,
        `ui.panel.config.updates.backup_choice.${mark}`
      )}</span
    >`;
  }

  private async _install(entityIds: string[]): Promise<void> {
    if (!entityIds.length) {
      return;
    }
    try {
      await Promise.all(
        entityIds.map((entityId) =>
          installUpdatesTracked(
            this.hass,
            [entityId],
            false,
            this._wantsBackupFor(entityId)
          )
        )
      );
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
      :host([narrow]) ha-alert.recovery {
        padding: var(--ha-space-2) var(--ha-space-3) 0;
      }
      /* The last line of the page stays above the floating phone bar. */
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3)
          calc(var(--ha-space-6) + 144px + var(--safe-area-inset-bottom, 0px));
      }
      .row {
        scroll-margin-bottom: 144px;
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8) 0;
      }
      ha-alert {
        display: block;
      }
      ha-alert.recovery {
        box-sizing: border-box;
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) 0;
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
        font-size: clamp(20px, 3vw, 28px);
        font-weight: 700;
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
        min-height: var(--ha-list-row-min, 52px);
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-list-row-radius, 16px);
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
        font-size: var(--ha-list-row-title-size, 14px);
        font-weight: var(--ha-list-row-title-weight, 600);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      state-badge {
        flex: none;
        width: var(--ha-list-row-icon-tile, 36px);
        height: var(--ha-list-row-icon-tile, 36px);
      }
      .progress {
        flex: 1 1 100%;
        min-width: 0;
        margin-bottom: var(--ha-space-2);
      }
      .finished {
        flex-direction: column;
        align-items: stretch;
        padding-block: var(--ha-space-2);
      }
      .finished-title {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-width: 0;
      }
      .waiting {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .waiting .place {
        font-family: var(--ha-font-family-code, monospace);
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
      /* The title fills the column, so a long one ends with an ellipsis
         before the button instead of running under it. */
      :host([narrow]) .row-main .text {
        justify-self: stretch;
        max-width: 100%;
      }
      :host([narrow]) .row-main .version {
        flex-wrap: wrap;
      }
      :host([narrow]) .row-main {
        min-height: 48px;
      }
      /* A resting phone row: the name and the versions on the left, the one
         main action and the toggle for the rest on the right. */
      :host([narrow]) .row.compact {
        flex-wrap: wrap;
        gap: 0 var(--ha-space-2);
        padding: var(--ha-space-1) var(--ha-space-1) var(--ha-space-1)
          var(--ha-space-3);
      }
      :host([narrow]) .row.compact .row-main {
        flex: 1 1 0;
        min-height: 52px;
      }
      :host([narrow]) .row.compact ha-button {
        --ha-button-height: 44px;
      }
      .row-toggle {
        flex: none;
        --ha-icon-button-size: 44px;
      }
      .backup-mark {
        align-self: flex-start;
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        padding: 2px 10px;
        border-radius: 14px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .backup-mark.backup_first {
        background: var(--success-color);
        color: var(--text-primary-color);
      }
      .row-detail {
        display: flex;
        flex: 1 1 100%;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-1);
        border-top: 1px solid var(--divider-color);
      }
      .row-detail-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      :host([narrow]) .card {
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-4xl, 24px);
      }
      :host([narrow]) h2 {
        font-size: var(--ha-font-size-l);
      }
      :host([narrow]) .check {
        --ha-button-height: 44px;
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
      .auto-summary {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        width: 100%;
        min-height: 52px;
        padding: 0;
      }
      .auto-summary .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .auto-summary .name {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .auto-card.open .auto-summary {
        margin-bottom: var(--ha-space-2);
      }
      .auto-card [hidden] {
        display: none;
      }
      .auto-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        padding: var(--ha-space-2) 0;
      }
      .auto-row .name {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
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
