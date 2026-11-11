import type { ContextType } from "@lit/context";
import type { HassConfig } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { consume } from "../../common/decorators/consume";
import {
  consumeEntityRegistryEntry,
  consumeLocalize,
} from "../../common/decorators/consume-context-entry";
import { transform } from "../../common/decorators/transform";
import { navigate } from "../../common/navigate";
import type { LocalizeFunc } from "../../common/translations/localize";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import {
  apiContext,
  configContext,
  connectionContext,
} from "../../data/context";
import type { EntityRegistryDisplayEntry } from "../../data/entity/entity_registry";
import type { UpdateEntity } from "../../data/update";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../resources/styles";
import type {
  CurrentUser,
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantConfig,
} from "../../types";
import "../activity/ha-recovery-card";
import "../ha-alert";
import "../ha-button";
import "../progress/ha-progress-bar";
import type { UpdateRun, UpdateTrackerDeps } from "./update-install-tracker";
import { updateInstallTracker } from "./update-install-tracker";
import {
  buildProblemSummary,
  isConnectionLostError,
  UPDATE_STAGE_ORDER,
} from "./update-progress-logic";
import type { UpdateStage } from "./update-progress-logic";

// The hassio integration gives the Core update entity this fixed title.
const CORE_TITLE = "Home Assistant Core";

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-progress": HaUpdateProgress;
  }
}

/**
 * The progress of one update install, and the way forward when it fails. The
 * update list and the update more-info dialog both show this one component.
 * It shows nothing until an install is running or has just ended.
 */
@customElement("ha-update-progress")
export class HaUpdateProgress extends LitElement {
  @property({ attribute: false }) public stateObj?: UpdateEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @consume({ context: connectionContext, subscribe: true })
  private _connection!: ContextType<typeof connectionContext>;

  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _config!: HassConfig;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, CurrentUser | undefined>({
    transformer: ({ user }) => user,
  })
  private _user?: CurrentUser;

  @state()
  @consumeEntityRegistryEntry({ entityIdPath: ["stateObj", "entity_id"] })
  private _entityEntry?: EntityRegistryDisplayEntry;

  @state() private _run?: UpdateRun;

  @state() private _actionError?: string;

  @state() private _summaryCopied = false;

  private _unsubscribe?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = updateInstallTracker.subscribe(() => this._sync());
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  private _deps(): UpdateTrackerDeps | undefined {
    if (!this._connection || !this._api || !this._localize || !this._config) {
      return undefined;
    }
    const instanceState = this._config.state;
    return {
      connection: this._connection.connection,
      localize: this._localize,
      callService: this._api.callService.bind(this._api),
      instanceVersion: this._config.version,
      instanceState: () => instanceState,
      backupAvailable:
        isComponentLoaded(this._config, "backup") &&
        isComponentLoaded(this._config, "hassio"),
    };
  }

  private _sync(): void {
    const id = this.stateObj?.entity_id;
    const run = id ? updateInstallTracker.get(id) : undefined;
    // A copy, because the tracker changes its run in place.
    this._run = run ? { ...run } : undefined;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!this.stateObj) {
      return;
    }
    const deps = this._deps();
    if (deps) {
      updateInstallTracker.refreshDeps(this.stateObj.entity_id, deps);
      // Found installing with nothing following it: the page was reloaded or
      // the install was started somewhere else.
      if (this.stateObj.attributes.in_progress) {
        updateInstallTracker.adopt(deps, this.stateObj);
      }
    }
    if (changed.has("stateObj")) {
      this._actionError = undefined;
      this._summaryCopied = false;
    }
    this._sync();
  }

  private _l(key: string, placeholders?: Record<string, string | number>) {
    return this._localize(`ui.update_progress.${key}` as any, placeholders);
  }

  private _isAdmin(): boolean {
    return !!this._user?.is_admin;
  }

  private _isApp(): boolean {
    return (
      this._entityEntry?.platform === "hassio" &&
      this.stateObj?.attributes.title !== CORE_TITLE
    );
  }

  protected render() {
    const run = this._run;
    if (!run || !this._localize || !this.stateObj) {
      return nothing;
    }
    if (run.stage === "failed") {
      return this._renderFailed(run);
    }
    if (run.stage === "done") {
      return this._renderDone(run);
    }
    return this._renderRunning(run);
  }

  private _stepState(
    run: UpdateRun,
    step: UpdateStage
  ): "done" | "current" | "pending" {
    // "preparing" is the start of the install itself, before any detail.
    const current = run.stage === "preparing" ? "installing" : run.stage;
    const order = UPDATE_STAGE_ORDER.filter(
      (item) => item !== "backing_up" || run.backupRequested
    );
    const index = order.indexOf(current);
    const stepIndex = order.indexOf(step);
    if (stepIndex < index) {
      return "done";
    }
    return stepIndex === index ? "current" : "pending";
  }

  private _renderRunning(run: UpdateRun) {
    const steps = UPDATE_STAGE_ORDER.filter(
      (step) =>
        step !== "done" && (step !== "backing_up" || run.backupRequested)
    );
    return html`<section
      class="card"
      aria-label=${this._l("heading", { name: run.title })}
    >
      <h3>${this._l("heading", { name: run.title })}</h3>
      <p class="stage" role="status" aria-live="polite">
        ${this._l(`stage.${run.stage}`)}${
          run.percent !== undefined
            ? html` <span class="percent">${run.percent}%</span>`
            : nothing
        }
      </p>
      ${
        run.percent !== undefined
          ? html`<ha-progress-bar
              loading
              .value=${run.percent}
              aria-label=${this._l("progress_label", { name: run.title })}
            ></ha-progress-bar>`
          : html`<ha-progress-bar
              indeterminate
              aria-label=${this._l("progress_label", { name: run.title })}
            ></ha-progress-bar>`
      }
      <ol class="steps">
        ${steps.map((step) => {
          const stepState = this._stepState(run, step);
          return html`<li
            class=${classMap({ [stepState]: true })}
            aria-current=${stepState === "current" ? "step" : "false"}
          >
            <span class="marker" aria-hidden="true"></span>
            <span class="label"
              >${this._l(`step.${step}`)}<span class="visually-hidden">
                ${this._l(`step_state.${stepState}`)}</span
              ></span
            >
          </li>`;
        })}
      </ol>
      ${
        run.slow
          ? html`<p class="note slow">${this._l("slow_start")}</p>`
          : nothing
      }
      <p class="note">${this._l("keep_open_note")}</p>
    </section>`;
  }

  private _renderDone(run: UpdateRun) {
    return html`<section
      class="card"
      aria-label=${this._l("heading", { name: run.title })}
    >
      <p class="stage" role="status">
        ${this._l("done", {
          name: run.title,
          version: this.stateObj?.attributes.installed_version ?? "",
        })}
      </p>
      <div class="actions">
        <ha-button appearance="plain" @click=${this._dismiss}
          >${this._l("dismiss")}</ha-button
        >
      </div>
    </section>`;
  }

  private _renderFailed(run: UpdateRun) {
    const installed = this.stateObj?.attributes.installed_version;
    const changed = [
      installed ? this._l("changed_installed", { version: installed }) : "",
      run.backupRequested ? this._l("changed_backup") : "",
    ]
      .filter(Boolean)
      .join(" ");
    const attributes = this.stateObj!.attributes;
    const canSkip =
      this._isAdmin() &&
      this.stateObj!.state === "on" &&
      !attributes.auto_update &&
      attributes.skipped_version !== attributes.latest_version;
    return html`<div class="failed">
      <ha-recovery-card
        .hass=${this._recoveryHass()}
        .heading=${this._l("failed_heading", { name: run.title })}
        .message=${this._l("failed_message")}
        .changed=${changed}
        .details=${run.error ?? ""}
        .canRetry=${run.canRetry}
        .undoLabel=${
          run.backupRequested && this._isAdmin() ? this._l("open_backups") : ""
        }
        @recovery-retry=${this._retry}
        @recovery-undo=${this._openBackups}
      ></ha-recovery-card>
      <div class="actions">
        ${
          this._isAdmin()
            ? html`<ha-button appearance="plain" @click=${this._showLog}
                >${this._l("show_log")}</ha-button
              >`
            : nothing
        }
        ${
          canSkip
            ? html`<ha-button appearance="plain" @click=${this._skip}
                >${this._l("skip_version")}</ha-button
              >`
            : nothing
        }
        ${
          this._isAdmin() && !this._isApp()
            ? html`<ha-button appearance="plain" @click=${this._safeMode}
                >${this._l("safe_mode")}</ha-button
              >`
            : nothing
        }
        <ha-button appearance="plain" @click=${this._copySummary}
          >${
            this._summaryCopied
              ? this._l("summary_copied")
              : this._l("copy_summary")
          }</ha-button
        >
        <ha-button appearance="plain" @click=${this._dismiss}
          >${this._l("dismiss")}</ha-button
        >
      </div>
      <p class="note">${this._l("summary_note")}</p>
      ${
        this._actionError
          ? html`<ha-alert alert-type="error">${this._actionError}</ha-alert>`
          : nothing
      }
    </div>`;
  }

  private _recoveryHassFor?: LocalizeFunc;

  private _recoveryHassValue?: HomeAssistant;

  // The card only needs `localize`. The object is kept between renders so the
  // card does not see a new `hass` each time.
  private _recoveryHass(): HomeAssistant {
    if (this._recoveryHassFor !== this._localize) {
      this._recoveryHassFor = this._localize;
      this._recoveryHassValue = {
        localize: this._localize,
      } as unknown as HomeAssistant;
    }
    return this._recoveryHassValue!;
  }

  // In-app navigation keeps the page, and with it the run being followed.
  private _showLog(): void {
    navigate(
      this._entityEntry?.platform === "hassio"
        ? "/config/logs?provider=supervisor"
        : "/config/logs"
    );
  }

  private _retry(): void {
    this._actionError = undefined;
    updateInstallTracker.retry(this.stateObj!.entity_id);
  }

  private _dismiss(): void {
    updateInstallTracker.dismiss(this.stateObj!.entity_id);
  }

  private _openBackups(): void {
    navigate("/config/backup/backups");
  }

  private async _skip(): Promise<void> {
    this._actionError = undefined;
    try {
      await this._api.callService(
        "update",
        "skip",
        { entity_id: this.stateObj!.entity_id },
        undefined,
        false
      );
      updateInstallTracker.dismiss(this.stateObj!.entity_id);
    } catch (err: any) {
      this._actionError = err?.message ?? String(err);
    }
  }

  private async _safeMode(): Promise<void> {
    this._actionError = undefined;
    const confirmed = await showConfirmationDialog(this, {
      title: this._localize(
        "ui.dialogs.restart.restart-safe-mode.confirm_title"
      ),
      text: html`${this._localize(
          "ui.dialogs.restart.restart-safe-mode.confirm_description"
        )}<br /><br />${this._l("safe_mode_text")}`,
      confirmText: this._localize(
        "ui.dialogs.restart.restart-safe-mode.confirm_action"
      ),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await this._api.callService(
        "homeassistant",
        "restart",
        { safe_mode: true },
        undefined,
        false
      );
    } catch (err: any) {
      // The restart drops the socket, which is the expected end of the call.
      if (!isConnectionLostError(err)) {
        this._actionError = err?.message ?? String(err);
      }
    }
  }

  private async _copySummary(): Promise<void> {
    const run = this._run;
    if (!run) {
      return;
    }
    const text = buildProblemSummary(
      {
        title: run.title,
        fromVersion: run.fromVersion,
        toVersion: run.targetVersion,
        stage: this._l(`stage.${run.stage}`),
        error: run.error,
        instanceVersion: this._config.version,
        time: new Date().toISOString(),
      },
      {
        heading: this._l("summary.heading"),
        what: this._l("summary.what"),
        from: this._l("summary.from"),
        to: this._l("summary.to"),
        stage: this._l("summary.stage"),
        error: this._l("summary.error"),
        instance: this._l("summary.instance"),
        time: this._l("summary.time"),
        unknown: this._l("summary.unknown"),
      }
    );
    await copyToClipboard(text, this);
    this._summaryCopied = true;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      :host(:not([hidden])) {
        min-width: 0;
      }
      .card,
      .failed {
        box-sizing: border-box;
        max-width: 100%;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .failed {
        padding: 0;
        background: none;
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-m);
        overflow-wrap: anywhere;
      }
      p {
        margin: var(--ha-space-2) 0 0;
        overflow-wrap: anywhere;
      }
      .stage {
        font-weight: var(--ha-font-weight-medium);
      }
      .percent {
        color: var(--secondary-text-color);
      }
      .note {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      ha-progress-bar {
        display: block;
        width: 100%;
        margin-top: var(--ha-space-2);
      }
      .steps {
        list-style: none;
        margin: var(--ha-space-3) 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .steps li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 32px;
        color: var(--secondary-text-color);
      }
      .steps li.current {
        color: var(--primary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .marker {
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid var(--secondary-text-color);
        box-sizing: border-box;
      }
      li.done .marker {
        background: var(--primary-color);
        border-color: var(--primary-color);
      }
      li.current .marker {
        border-color: var(--primary-color);
        background: var(--primary-background-color);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
      .actions ha-button {
        min-height: 44px;
      }
      ha-alert {
        display: block;
        margin-top: var(--ha-space-2);
      }
      @media (prefers-reduced-motion: reduce) {
        ha-progress-bar {
          --ha-progress-bar-indicator-highlight-image: none;
        }
      }
    `,
  ];
}
