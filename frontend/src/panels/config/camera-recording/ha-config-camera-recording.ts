import { mdiCog, mdiPause, mdiPlay, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import {
  fetchRecordingStatus,
  pauseRecording,
  type RecordingDestinationStatus,
} from "../../../data/camera_recording";
import { getConfigEntry } from "../../../data/config_entries";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

const REFRESH_MS = 10_000;

const STATE_TONES: Record<string, string> = {
  recording: "ok",
  starting: "busy",
  reconnecting: "warn",
  no_stream: "warn",
  paused: "off",
  stopped: "off",
};

/** Every recording destination: its cameras, what waits to be copied, and space. */
@customElement("ha-config-camera-recording")
export class HaConfigCameraRecording extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _status?: RecordingDestinationStatus[];

  @state() private _error?: string;

  private _timer?: number;

  public connectedCallback() {
    super.connectedCallback();
    if (this.hass) {
      this._load();
    }
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
  }

  protected firstUpdated() {
    this._load();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  private async _load() {
    if (!this.hass) {
      return;
    }
    try {
      this._status = await fetchRecordingStatus(this.hass);
      this._error = undefined;
    } catch (err: unknown) {
      // The server only knows these commands once a destination has been
      // added, so before the first one this is an empty list, not an error.
      if ((err as { code?: string } | undefined)?.code === "unknown_command") {
        this._status = [];
        this._error = undefined;
        return;
      }
      this._error = (err as Error | undefined)?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>) {
    return this.hass.localize(
      `ui.panel.config.camera_recording.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/system"
        .header=${this._l("caption")}
      >
        <div class="content">
          <p class="intro">${this._l("description")}</p>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          ${
            this._status?.length === 0
              ? html`<ha-card>
                  <div class="card-content empty">
                    <p>${this._l("none")}</p>
                    <ha-button @click=${this._add}>
                      <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                      ${this._l("set_up")}
                    </ha-button>
                  </div>
                </ha-card>`
              : nothing
          }
          ${(this._status ?? []).map((dest) => this._renderDestination(dest))}
          ${
            this._status?.length
              ? html`<ha-button appearance="plain" @click=${this._add}>
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  ${this._l("add_another")}
                </ha-button>`
              : nothing
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderDestination(dest: RecordingDestinationStatus) {
    const recording = dest.cameras.filter(
      (cam) => cam.state === "recording"
    ).length;
    const waiting = dest.cameras.reduce((sum, cam) => sum + cam.waiting, 0);
    const limit = dest.max_bytes || undefined;
    const allPaused = dest.cameras.every((cam) => cam.state === "paused");
    return html`
      <ha-card .header=${dest.label}>
        <div class="card-content">
          <div class="stats">
            <div>
              <b
                >${this._l("count_of", {
                  count: recording,
                  total: dest.cameras.length,
                })}</b
              ><span>${this._l("recording")}</span>
            </div>
            <div>
              <b>${bytesToString(dest.used_bytes)}</b
              ><span
                >${
                  limit
                    ? this._l("used_of", { limit: bytesToString(limit) })
                    : this._l("used")
                }</span
              >
            </div>
            <div><b>${waiting}</b><span>${this._l("waiting")}</span></div>
            <div>
              <b
                >${
                  dest.last_copy
                    ? relativeTime(new Date(dest.last_copy), this.hass.locale)
                    : "—"
                }</b
              ><span>${this._l("last_copy")}</span>
            </div>
          </div>
          ${
            limit
              ? html`<div
                  class="meter"
                  role="meter"
                  aria-label=${this._l("used")}
                  aria-valuemin="0"
                  aria-valuemax=${limit}
                  aria-valuenow=${dest.used_bytes}
                >
                  <span
                    style="width:${Math.min(100, (dest.used_bytes / limit) * 100)}%"
                  ></span>
                </div>`
              : nothing
          }
          ${
            dest.error
              ? html`<ha-alert alert-type="warning"
                  >${this._l("copy_problem", { error: dest.error })}</ha-alert
                >`
              : nothing
          }
          <table>
            <thead>
              <tr>
                <th>${this._l("camera")}</th>
                <th>${this._l("state")}</th>
                <th>${this._l("newest")}</th>
                <th>${this._l("waiting")}</th>
                <th>${this._l("oldest")}</th>
                <th>
                  <span class="visually-hidden">${this._l("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              ${dest.cameras.map(
                (cam) => html`
                  <tr>
                    <td>
                      ${
                        this.hass.states[cam.entity_id]?.attributes
                          .friendly_name ?? cam.entity_id
                      }
                    </td>
                    <td>
                      <span class="pill ${STATE_TONES[cam.state] ?? "off"}"
                        >${this._l(`states.${cam.state}`)}</span
                      >
                      ${
                        cam.error && cam.state !== "recording"
                          ? html`<div class="problem">${cam.error}</div>`
                          : nothing
                      }
                    </td>
                    <td>${this._time(cam.newest)}</td>
                    <td>${cam.waiting}</td>
                    <td>${this._time(cam.oldest)}</td>
                    <td>
                      <ha-button
                        size="small"
                        appearance="plain"
                        .entity=${cam.entity_id}
                        .entryId=${dest.entry_id}
                        .paused=${cam.state !== "paused"}
                        @click=${this._togglePause}
                      >
                        <ha-svg-icon
                          slot="start"
                          .path=${cam.state === "paused" ? mdiPlay : mdiPause}
                        ></ha-svg-icon>
                        ${this._l(cam.state === "paused" ? "resume" : "pause")}
                      </ha-button>
                    </td>
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
        <div class="card-actions">
          <ha-button
            appearance="plain"
            .entryId=${dest.entry_id}
            .paused=${!allPaused}
            @click=${this._togglePause}
          >
            <ha-svg-icon
              slot="start"
              .path=${allPaused ? mdiPlay : mdiPause}
            ></ha-svg-icon>
            ${this._l(allPaused ? "resume_all" : "pause_all")}
          </ha-button>
          <ha-button
            appearance="plain"
            .entryId=${dest.entry_id}
            @click=${this._configure}
          >
            <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
            ${this._l("change")}
          </ha-button>
        </div>
      </ha-card>
    `;
  }

  private _time(seconds: number | null) {
    if (!seconds) {
      return "—";
    }
    return new Date(seconds * 1000).toLocaleString(this.hass.locale.language, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  private async _togglePause(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entity?: string;
      entryId: string;
      paused: boolean;
    };
    await pauseRecording(
      this.hass,
      target.entryId,
      target.paused,
      target.entity
    );
    await this._load();
  }

  private async _configure(ev: Event) {
    const entryId = (ev.currentTarget as HTMLElement & { entryId: string })
      .entryId;
    const { config_entry } = await getConfigEntry(this.hass.callWS, entryId);
    showOptionsFlowDialog(this, config_entry, {
      dialogClosedCallback: () => this._load(),
    });
  }

  private _add() {
    navigate("/config/integrations/dashboard/add?domain=camera_recording");
  }

  static styles: CSSResultGroup = css`
    .content {
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
    .intro {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-3);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-4);
    }
    .stats div {
      display: flex;
      flex-direction: column;
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .stats b {
      font-size: var(--ha-font-size-xl);
    }
    .stats span {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .meter {
      height: 10px;
      border-radius: 5px;
      background: var(--secondary-background-color);
      overflow: hidden;
      margin-bottom: var(--ha-space-4);
    }
    .meter span {
      display: block;
      height: 100%;
      background: var(--primary-color);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: var(--ha-space-3);
    }
    th,
    td {
      text-align: start;
      padding: var(--ha-space-2);
      border-bottom: 1px solid var(--divider-color);
      vertical-align: middle;
    }
    th {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      background: var(--secondary-background-color);
    }
    .pill.ok {
      background: color-mix(in srgb, var(--success-color) 22%, transparent);
    }
    .pill.warn {
      background: color-mix(in srgb, var(--warning-color) 25%, transparent);
    }
    .pill.busy {
      background: color-mix(in srgb, var(--info-color) 22%, transparent);
    }
    .problem {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      margin-top: var(--ha-space-1);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    @media (max-width: 700px) {
      thead {
        display: none;
      }
      tr {
        display: grid;
        grid-template-columns: 1fr auto;
        border-bottom: 1px solid var(--divider-color);
        padding: var(--ha-space-2) 0;
      }
      td {
        border: none;
        padding: var(--ha-space-1) var(--ha-space-2);
      }
      td:nth-child(3),
      td:nth-child(4),
      td:nth-child(5) {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-camera-recording": HaConfigCameraRecording;
  }
}
