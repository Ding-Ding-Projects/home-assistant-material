import { mdiCloudAlert, mdiCloudCheck, mdiCloudOff, mdiRestore } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import type {
  Stall,
  WorkerHealth,
  WorkerState,
  WorkerVerdict,
} from "../../../util/worker-health";
import {
  countStalls,
  readStalls,
  readWorkerHealth,
  readWorkerState,
  recordWorkerCheck,
  repairWorker,
  workerVerdict,
} from "../../../util/worker-health";
import { performanceStyles } from "./performance-styles";

const P = "ui.panel.config.performance.cache.";

const ICONS: Record<WorkerVerdict, string> = {
  healthy: mdiCloudCheck,
  attention: mdiCloudAlert,
  inactive: mdiCloudOff,
  unsupported: mdiCloudOff,
};

const TONES: Record<WorkerVerdict, string> = {
  healthy: "success",
  attention: "warning",
  inactive: "warning",
  unsupported: "neutral",
};

const TEXTS: Record<WorkerVerdict, string> = {
  healthy: "state_working",
  attention: "state_attention",
  inactive: "state_inactive",
  unsupported: "state_unsupported",
};

const WORKER_STATES: Record<string, string> = {
  activated: "worker_activated",
  activating: "worker_activating",
  installing: "worker_installing",
  installed: "worker_installed",
};

/** Health of the offline copy of the app on this device, with a repair for a blank page. */
@customElement("ha-config-performance-cache")
export class HaConfigPerformanceCache extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _health?: WorkerHealth;

  @state() private _stalls: Stall[] = [];

  @state() private _state?: WorkerState;

  @state() private _checking = false;

  @state() private _checkResult?: string;

  @state() private _repairing = false;

  @state() private _error?: string;

  private _started = false;

  protected willUpdate(changed: PropertyValues<this>) {
    if (!this._started && this.hass) {
      this._started = true;
      this._refresh();
    }
    super.willUpdate(changed);
  }

  private async _refresh() {
    this._stalls = readStalls();
    this._state = readWorkerState();
    this._health = await readWorkerHealth();
  }

  private _l(key: string, args?: Record<string, string | number>): string {
    return this.hass.localize(`${P}${key}` as any, args);
  }

  private _when(ms: number): string {
    return `${formatDateTime(new Date(ms), this.hass.locale, this.hass.config)} (${relativeTime(new Date(ms), this.hass.locale)})`;
  }

  private _totalBytes(): number {
    return (this._health?.caches ?? []).reduce((sum, c) => sum + c.bytes, 0);
  }

  protected render(): TemplateResult {
    const health = this._health;
    const week = countStalls(this._stalls, 7, Date.now());
    const verdict = health ? workerVerdict(health, week) : undefined;
    return html`
      <hass-subpage
        back-path="/config/performance"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._l("title")}
        .breadcrumb=${[
          this.hass.localize("panel.config"),
          this.hass.localize("ui.panel.config.dashboard.system.main"),
          this.hass.localize("ui.panel.config.performance.caption"),
        ].join(", ")}
        .summary=${this._l("summary")}
      >
        <div class="page">
          ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
          <div class="cards">
            ${this._renderStatus(health, verdict, week)}
            ${this._renderRepair(health)}
          </div>
          ${health?.caches.length ? this._renderCaches(health) : nothing}
          ${this._renderStalls()}
        </div>
      </hass-subpage>
    `;
  }

  private _renderStatus(
    health: WorkerHealth | undefined,
    verdict: WorkerVerdict | undefined,
    week: number
  ): TemplateResult {
    const version = (window as any).frontendVersion as string | undefined;
    const size = this._totalBytes();
    const hint =
      verdict === "unsupported"
        ? this._l("unsupported_text")
        : verdict === "inactive"
          ? this._l("inactive_text")
          : health?.updateWaiting
            ? this._l("waiting_text")
            : version
              ? size
                ? this._l("version_size", {
                    version,
                    size: bytesToString(size, 0),
                  })
                : this._l("version_only", { version })
              : "";
    return html`<div class="card">
      <h3>${this._l("status")}</h3>
      <div class="row">
        <span class="tile tone-${verdict ? TONES[verdict] : "neutral"}"
          ><ha-svg-icon
            .path=${verdict ? ICONS[verdict] : mdiCloudCheck}
          ></ha-svg-icon
        ></span>
        <div class="text">
          <span class="title"
            >${verdict ? this._l(TEXTS[verdict]) : nothing}</span
          >
          <span class="sub">${hint}</span>
        </div>
      </div>
      <dl class="facts">
        <dt>${this._l("row_last_check")}</dt>
        <dd>
          ${
            this._state
              ? this._when(this._state.lastCheck)
              : this._l("not_recorded")
          }
        </dd>
        <dt>${this._l("row_since")}</dt>
        <dd>
          ${
            this._state
              ? this._when(this._state.since)
              : this._l("not_recorded")
          }
        </dd>
        <dt>${this._l("row_worker")}</dt>
        <dd>
          ${
            health?.state
              ? this._l(WORKER_STATES[health.state] ?? "worker_none")
              : this._l("worker_none")
          }
        </dd>
        <dt>${this._l("row_stalls")}</dt>
        <dd>${week}</dd>
        <dt>${this._l("row_stalls_all")}</dt>
        <dd>${this._stalls.length}</dd>
      </dl>
      ${this._checkResult ? html`<p class="note" aria-live="polite">${this._checkResult}</p>` : nothing}
      ${
        health?.registered
          ? html`<div class="toolbar">
              <ha-button
                appearance="plain"
                .disabled=${this._checking}
                @click=${this._checkNow}
                >${this._checking ? this._l("checking") : this._l("check_now")}</ha-button
              >
            </div>`
          : nothing
      }
    </div>`;
  }

  private _renderRepair(health: WorkerHealth | undefined): TemplateResult {
    return html`<div class="card">
      <h3>${this._l("repair")}</h3>
      <ha-alert alert-type="info">${this._l("repair_note")}</ha-alert>
      <div class="toolbar">
        <ha-button
          .disabled=${this._repairing || !health}
          @click=${this._repair}
        >
          <ha-svg-icon slot="start" .path=${mdiRestore}></ha-svg-icon>
          ${this._l("repair_button")}
        </ha-button>
      </div>
    </div>`;
  }

  private _renderCaches(health: WorkerHealth): TemplateResult {
    return html`<div class="card">
      <h3>${this._l("caches")}</h3>
      <ul>
        ${health.caches.map(
          (cache) =>
            html`<li>
              <div class="row">
                <div class="text">
                  <span class="title">${cache.name}</span>
                  <span class="sub"
                    >${this._l(
                      cache.partial ? "cache_row_partial" : "cache_row",
                      {
                        entries: cache.entries,
                        size: bytesToString(cache.bytes, 1),
                      }
                    )}</span
                  >
                </div>
              </div>
            </li>`
        )}
      </ul>
    </div>`;
  }

  private _renderStalls(): TemplateResult {
    const recent = [...this._stalls].reverse().slice(0, 5);
    return html`<div class="card">
      <h3>${this._l("stalls")}</h3>
      ${
        recent.length
          ? html`<ul>
              ${recent.map(
                (stall) =>
                  html`<li>
                    <div class="row">
                      <div class="text">
                        <span class="title"
                          >${this._l(
                            stall.k === "import"
                              ? "stall_import"
                              : stall.k === "reload"
                                ? "stall_reload"
                                : "stall_gave_up"
                          )}</span
                        >
                        <span class="sub">${this._when(stall.t)}</span>
                      </div>
                    </div>
                  </li>`
              )}
            </ul>`
          : html`<p class="note">${this._l("stalls_none")}</p>`
      }
    </div>`;
  }

  private async _checkNow() {
    this._checking = true;
    this._checkResult = undefined;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        return;
      }
      await registration.update();
      recordWorkerCheck(
        ((window as any).frontendVersion as string | undefined) ?? ""
      );
      this._checkResult =
        registration.installing || registration.waiting
          ? this._l("check_newer")
          : this._l("check_current");
    } catch (err: unknown) {
      this._checkResult = this._l("check_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this._checking = false;
      this._refresh();
    }
  }

  private async _repair() {
    const health = this._health;
    if (!health) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("repair_confirm_title"),
      text: this._l("repair_confirm_text", {
        size: bytesToString(this._totalBytes(), 1),
        count: health.caches.length,
      }),
      confirmText: this._l("repair_confirm"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._repairing = true;
    this._error = undefined;
    try {
      await repairWorker();
      location.reload();
    } catch (err: unknown) {
      this._error = this._l("repair_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      this._repairing = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      performanceStyles,
      css`
        ha-alert {
          margin-bottom: var(--ha-space-4);
        }
        .card > .toolbar {
          margin-top: var(--ha-space-4);
        }
        .card .row {
          padding-top: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-performance-cache": HaConfigPerformanceCache;
  }
}
