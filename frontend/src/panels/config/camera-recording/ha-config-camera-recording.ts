import { mdiCog, mdiPause, mdiPlay, mdiPlus } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { relativeTime } from "../../../common/datetime/relative_time";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-checkbox";
import "../../../components/ha-slider";
import "../../../components/entity/ha-entity-picker";
import "../../../components/ha-svg-icon";
import {
  amountKey,
  fetchRecordingStatus,
  pauseRecording,
  setRecordingAmount,
  type RecordingAmount,
  type RecordingCameraStatus,
  type RecordingDestinationStatus,
} from "../../../data/camera_recording";
import { getConfigEntry } from "../../../data/config_entries";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

const REFRESH_MS = 10_000;

/** Binary sensor classes that can tell a camera saw something. */
const EVENT_SENSOR_CLASSES = [
  "motion",
  "moving",
  "occupancy",
  "presence",
  "door",
  "garage_door",
  "opening",
  "window",
  "sound",
  "vibration",
];

/** The entities worth offering as an extra event source: sensors of those classes and every event entity. */
export const isEventSourceCandidate = (stateObj: {
  entity_id: string;
  attributes: { device_class?: unknown };
}): boolean => {
  const domain = stateObj.entity_id.split(".")[0];
  if (domain === "event") {
    return true;
  }
  return (
    domain === "binary_sensor" &&
    EVENT_SENSOR_CLASSES.includes(String(stateObj.attributes.device_class))
  );
};

const STATE_TONES: Record<string, string> = {
  recording: "ok",
  starting: "busy",
  reconnecting: "warn",
  no_stream: "warn",
  limited: "warn",
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

  @state() private _problem?: string;

  @state() private _open = new Set<string>();

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
                    <td>${this._renderState(cam)}</td>
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
                  <tr class="amount-row">
                    <td colspan="6">${this._renderAmount(dest, cam)}</td>
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

  private _renderState(cam: RecordingCameraStatus) {
    const key = amountKey(cam);
    if (cam.provider_only) {
      const kept = cam.event_clips > 0;
      return html`<span class="pill ${kept ? "ok" : "warn"}"
          >${this._l("states.event_clips")}</span
        >
        <div class="problem">${this._l("provider_only_note")}</div>`;
    }
    return html`<span class="pill ${STATE_TONES[cam.state] ?? "off"}"
        >${this._l(`states.${cam.state}`)}</span
      >
      ${
        key === "light" && cam.state === "recording"
          ? html`<div class="problem">${this._l("light_short")}</div>`
          : nothing
      }
      ${
        cam.error && cam.state !== "recording"
          ? html`<div class="problem">${cam.error}</div>`
          : nothing
      }`;
  }

  private _renderAmount(
    dest: RecordingDestinationStatus,
    cam: RecordingCameraStatus
  ) {
    const buttons: { value: RecordingAmount; label: string }[] = [];
    if (cam.continuous_possible) {
      buttons.push({ value: "all_day", label: this._l("amount.all_day") });
    }
    if (cam.light_possible) {
      buttons.push({ value: "light", label: this._l("amount.light") });
    }
    buttons.push({ value: "off", label: this._l("amount.off") });
    const active: RecordingAmount = cam.provider_only
      ? cam.effective_mode === "off"
        ? "off"
        : "light"
      : cam.effective_mode;
    const open = this._open.has(cam.entity_id);
    const mb = bytesToString(cam.bytes_today);
    return html`
      <div class="amount">
        <div class="amount-head">
          <span class="amount-title"
            >${this._l("amount.title")} ·
            ${
              this.hass.states[cam.entity_id]?.attributes.friendly_name ??
              cam.entity_id
            }</span
          >
          <ha-button-toggle-group
            size="s"
            .buttons=${buttons}
            .active=${active}
            .entryId=${dest.entry_id}
            .entity=${cam.entity_id}
            @value-changed=${this._amountChanged}
          ></ha-button-toggle-group>
        </div>
        <p class="amount-text">
          ${
            cam.provider_only
              ? this._l("amount.provider_only", { days: dest.keep_days })
              : this._l(`amount.explain_${active}`, {
                  pre: cam.pre,
                  post: cam.post,
                })
          }
        </p>
        ${
          active === "light"
            ? html`<p class="amount-today">
                ${this._l("amount.today", { count: cam.events_today, size: mb })}
              </p>`
            : nothing
        }
        ${
          cam.mode_reason === "no_event_source" ||
          (!cam.light_possible && !cam.provider_only)
            ? html`<p class="amount-note">
                ${this._l("amount.no_event_source")}
              </p>`
            : nothing
        }
        ${
          cam.cap_hit
            ? html`<p class="amount-note">
                ${this._l("amount.cap_hit", {
                  minutes: Math.round(cam.max_clip / 60),
                })}
              </p>`
            : nothing
        }
        <p class="amount-note">${this._l("amount.keeps_existing")}</p>
        ${
          active === "light" && !cam.provider_only
            ? this._renderLightSettings(dest, cam, open)
            : nothing
        }
      </div>
    `;
  }

  private _renderLightSettings(
    dest: RecordingDestinationStatus,
    cam: RecordingCameraStatus,
    open: boolean
  ) {
    return html`
      <div class="sliders">
        <label>
          <span>${this._l("amount.before", { seconds: cam.pre })}</span>
          <ha-slider
            labeled
            min="0"
            max="60"
            step="5"
            .value=${cam.pre}
            .entryId=${dest.entry_id}
            .entity=${cam.entity_id}
            .field=${"pre"}
            @change=${this._secondsChanged}
          ></ha-slider>
        </label>
        <label>
          <span>${this._l("amount.after", { seconds: cam.post })}</span>
          <ha-slider
            labeled
            min="5"
            max="300"
            step="5"
            .value=${cam.post}
            .entryId=${dest.entry_id}
            .entity=${cam.entity_id}
            .field=${"post"}
            @change=${this._secondsChanged}
          ></ha-slider>
        </label>
      </div>
      <button
        class="link"
        aria-expanded=${open}
        .entity=${cam.entity_id}
        @click=${this._toggleSources}
      >
        ${this._l("amount.sources")} ·
        ${
          cam.sources_chosen === null
            ? this._l("amount.sources_auto")
            : this._l("amount.sources_count", { count: cam.sources.length })
        }
      </button>
      ${
        open
          ? html`<div class="sources">
              <label class="source">
                <ha-checkbox
                  .checked=${cam.sources_chosen === null}
                  .entryId=${dest.entry_id}
                  .entity=${cam.entity_id}
                  @change=${this._autoSources}
                ></ha-checkbox>
                ${this._l("amount.sources_auto")}
              </label>
              ${(cam.sources_chosen ?? [])
                .filter(
                  (source) =>
                    !cam.source_options.some((item) => item.source === source)
                )
                .map(
                  (source) =>
                    html`<label class="source">
                      <ha-checkbox
                        .checked=${true}
                        .entryId=${dest.entry_id}
                        .entity=${cam.entity_id}
                        .source=${source}
                        @change=${this._sourceChanged}
                      ></ha-checkbox>
                      ${
                        this.hass.states[source]?.attributes.friendly_name ??
                        source
                      }
                      <span class="kind">${this._l("amount.kinds.other")}</span>
                    </label>`
                )}
              ${cam.source_options.map(
                (option) =>
                  html`<label class="source">
                    <ha-checkbox
                      .checked=${cam.sources.includes(option.source)}
                      .disabled=${cam.sources_chosen === null}
                      .entryId=${dest.entry_id}
                      .entity=${cam.entity_id}
                      .source=${option.source}
                      @change=${this._sourceChanged}
                    ></ha-checkbox>
                    ${
                      option.source === "integration"
                        ? this._l("amount.source_integration")
                        : (this.hass.states[option.source]?.attributes
                            .friendly_name ?? option.source)
                    }
                    <span class="kind"
                      >${this._l(
                        `amount.kinds.${option.kind}` as "amount.kinds.motion"
                      )}</span
                    >
                  </label>`
              )}
              <ha-entity-picker
                .hass=${this.hass}
                .label=${this._l("amount.add_source")}
                .helper=${this._l("amount.add_source_helper")}
                .value=${""}
                .includeDomains=${["binary_sensor", "event"]}
                .entityFilter=${this._sourceFilter(cam)}
                .entryId=${dest.entry_id}
                .entity=${cam.entity_id}
                @value-changed=${this._sourceAdded}
              ></ha-entity-picker>
            </div>`
          : nothing
      }
      ${this._problem ? html`<ha-alert alert-type="error">${this._problem}</ha-alert>` : nothing}
    `;
  }

  private _toggleSources(ev: Event) {
    const entity = (ev.currentTarget as HTMLElement & { entity: string })
      .entity;
    const open = new Set(this._open);
    if (open.has(entity)) {
      open.delete(entity);
    } else {
      open.add(entity);
    }
    this._open = open;
  }

  private async _apply(
    entryId: string,
    entity: string,
    mode: RecordingAmount,
    extra: { pre?: number; post?: number; sources?: string[] | null } = {}
  ) {
    try {
      await setRecordingAmount(this.hass, entryId, entity, mode, extra);
      this._problem = undefined;
    } catch (err: unknown) {
      const code = (err as { code?: string } | undefined)?.code;
      this._problem =
        code === "no_event_source"
          ? this._l("amount.no_event_source")
          : ((err as Error | undefined)?.message ?? String(err));
    }
    await this._load();
  }

  private async _amountChanged(ev: CustomEvent<{ value: RecordingAmount }>) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
    };
    await this._apply(target.entryId, target.entity, ev.detail.value);
  }

  private async _secondsChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      field: "pre" | "post";
      value: number;
    };
    await this._apply(target.entryId, target.entity, "light", {
      [target.field]: Number(target.value),
    });
  }

  private async _autoSources(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      checked: boolean;
    };
    const cam = this._camera(target.entryId, target.entity);
    await this._apply(target.entryId, target.entity, "light", {
      sources: target.checked ? null : (cam?.sources ?? []),
    });
  }

  private async _sourceChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      source: string;
      checked: boolean;
    };
    const cam = this._camera(target.entryId, target.entity);
    const chosen = new Set(cam?.sources_chosen ?? cam?.sources ?? []);
    if (target.checked) {
      chosen.add(target.source);
    } else {
      chosen.delete(target.source);
    }
    await this._apply(target.entryId, target.entity, "light", {
      sources: [...chosen],
    });
  }

  private _sourceFilter(cam: RecordingCameraStatus) {
    const taken = new Set(cam.sources);
    return (stateObj: HassEntity) =>
      !taken.has(stateObj.entity_id) && isEventSourceCandidate(stateObj);
  }

  private async _sourceAdded(ev: CustomEvent<{ value?: string }>) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      value?: string;
    };
    const added = ev.detail.value;
    if (!added) {
      return;
    }
    const cam = this._camera(target.entryId, target.entity);
    const chosen = new Set(cam?.sources_chosen ?? cam?.sources ?? []);
    chosen.add(added);
    target.value = "";
    await this._apply(target.entryId, target.entity, "light", {
      sources: [...chosen],
    });
  }

  private _camera(entryId: string, entity: string) {
    return this._status
      ?.find((dest) => dest.entry_id === entryId)
      ?.cameras.find((cam) => cam.entity_id === entity);
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
    .amount-row td {
      padding-top: 0;
    }
    .amount {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
    }
    .amount-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .amount-title {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .amount p {
      margin: 0;
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .amount-note,
    .amount-today {
      color: var(--secondary-text-color);
    }
    .sliders {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--ha-space-2);
    }
    .sliders label {
      display: flex;
      flex-direction: column;
      font-size: var(--ha-font-size-s);
    }
    .sources {
      display: flex;
      flex-direction: column;
    }
    .source {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      font-size: var(--ha-font-size-s);
    }
    .kind {
      color: var(--secondary-text-color);
    }
    button.link {
      align-self: flex-start;
      min-height: 44px;
      padding: 0;
      border: none;
      background: none;
      color: var(--primary-color);
      font: inherit;
      font-size: var(--ha-font-size-s);
      cursor: pointer;
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
      tr.amount-row {
        display: block;
      }
      td:nth-child(3),
      td:nth-child(4),
      td:nth-child(5) {
        display: none;
      }
      tr.amount-row td:nth-child(n) {
        display: block;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-camera-recording": HaConfigCameraRecording;
  }
}
