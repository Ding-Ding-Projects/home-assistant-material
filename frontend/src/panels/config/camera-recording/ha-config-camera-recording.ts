import {
  mdiAlertCircleOutline,
  mdiChevronDown,
  mdiCog,
  mdiMagnify,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiVideo,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { formatShortDateTimeWithConditionalYear } from "../../../common/datetime/format_date_time";
import { relativeTime } from "../../../common/datetime/relative_time";
import { storage } from "../../../common/decorators/storage";
import {
  composeForMode,
  withLanguageMode,
} from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import { regexQuery } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-checkbox";
import "../../../components/ha-icon-button";
import "../../../components/input/ha-input-search";
import "../../../components/ha-slider";
import "../../../components/ha-switch";
import "../../../components/entity/ha-entity-picker";
import "../../../components/ha-svg-icon";
import "../../../components/skeleton/ha-skeleton-text";
import "./ha-camera-recording-places";
import "./ha-camera-watched-settings";
import {
  cameraKey,
  filterCameras,
  readExpanded,
  setExpanded,
  toggleExpanded,
} from "./camera-recording-list";
import {
  amountKey,
  fetchRecordingStatus,
  CLIP_SECONDS_RANGE,
  CLIPS_PER_HOUR_RANGE,
  KEEP_DAYS_RANGE,
  pauseRecording,
  recordTestClip,
  setKeepDays,
  setLiveOptions,
  setRecordingAmount,
  type RecordingAmount,
  type RecordingCameraStatus,
  type RecordingCheck,
  type RecordingDestinationStatus,
} from "../../../data/camera_recording";
import { getConfigEntry } from "../../../data/config_entries";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import "../../../layouts/hass-subpage";
import { haMotionKeyframes } from "../../../resources/motion-styles";
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

  @state() private _query = "";

  /** Keys of the folded-open camera rows, remembered across reloads. */
  @state()
  @storage({
    key: "camera-recording-open-rows",
    state: true,
    subscribe: false,
  })
  private _openRows?: string[];

  @state() private _testing = new Set<string>();

  @query("ha-input-search") private _searchField?: HTMLElement;

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
    return withLanguageMode(this.hass.localize)(
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
        <div class="content" aria-busy=${this._status ? "false" : "true"}>
          <p class="intro">${this._l("description")}</p>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          ${
            this._problem
              ? html`<ha-alert alert-type="error" role="alert"
                  >${this._problem}</ha-alert
                >`
              : nothing
          }
          ${
            !this._status && !this._error
              ? html`<ha-card>
                  <div
                    class="card-content loading"
                    role="status"
                    aria-label=${this._l("loading")}
                  >
                    <ha-skeleton-text></ha-skeleton-text>
                    <ha-skeleton-text></ha-skeleton-text>
                    <ha-skeleton-text></ha-skeleton-text>
                  </div>
                </ha-card>`
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
          ${this._renderSearch()}
          ${(this._status ?? []).map((dest) => this._renderDestination(dest))}
          <ha-camera-recording-places
            .hass=${this.hass}
            .destinations=${this._status}
          ></ha-camera-recording-places>
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

  private get _expanded(): string[] {
    return readExpanded(this._openRows);
  }

  private _name(cam: RecordingCameraStatus): string {
    return (
      (this.hass.states[cam.entity_id]?.attributes.friendly_name as
        string | undefined) ?? cam.entity_id
    );
  }

  private _activeAmount(cam: RecordingCameraStatus): RecordingAmount {
    return cam.provider_only
      ? cam.effective_mode === "off"
        ? "off"
        : "light"
      : cam.effective_mode;
  }

  private _stateText(cam: RecordingCameraStatus): string {
    return this._l(
      cam.provider_only
        ? "states.event_clips"
        : (`states.${cam.state}` as "states.recording")
    );
  }

  private _shown(dest: RecordingDestinationStatus): RecordingCameraStatus[] {
    return filterCameras(dest.cameras, this._query, (cam) => ({
      name: this._name(cam),
      entityId: cam.entity_id,
      state: this._stateText(cam),
      amount: this._l(`amount.${this._activeAmount(cam)}`),
      place: dest.label,
    }));
  }

  private _shownKeys(): string[] {
    return (this._status ?? []).flatMap((dest) =>
      this._shown(dest).map((cam) => cameraKey(dest.entry_id, cam.entity_id))
    );
  }

  private _renderSearch() {
    const total = (this._status ?? []).reduce(
      (sum, dest) => sum + dest.cameras.length,
      0
    );
    if (!total) {
      return nothing;
    }
    const keys = this._shownKeys();
    const patternError = regexQuery(this._query)?.error;
    const searching = this._query.trim() !== "" && !patternError;
    const expanded = this._expanded;
    const allOpen =
      keys.length > 0 && keys.every((key) => expanded.includes(key));
    const samples = (this._status ?? []).flatMap((dest) =>
      dest.cameras.flatMap((cam) => [this._name(cam), cam.entity_id])
    );
    return html`
      <div class="search" role="search">
        <ha-input-search
          appearance="outlined"
          .label=${this._l("search.label")}
          .value=${this._query}
          .patternSamples=${samples}
          @input=${this._queryChanged}
        ></ha-input-search>
        ${
          patternError
            ? html`<p class="pattern-error" role="alert">
                <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
                ${this._l("search.pattern_error", {
                  reason: withLanguageMode(this.hass.localize)(
                    `ui.regex.filter_error.${patternError}` as any
                  ),
                })}
              </p>`
            : nothing
        }
        <div class="count-row">
          <span class="count" role="status"
            >${
              searching
                ? this._l("search.count_of", { shown: keys.length, total })
                : this._l("search.count", { count: total })
            }</span
          >
          ${
            keys.length
              ? html`<ha-button
                  appearance="plain"
                  size="small"
                  class="tall"
                  aria-label=${this._l(
                    allOpen
                      ? "search.collapse_all_label"
                      : "search.expand_all_label"
                  )}
                  @click=${this._toggleAll}
                >
                  ${this._l(allOpen ? "search.collapse_all" : "search.expand_all")}
                </ha-button>`
              : nothing
          }
        </div>
        ${
          searching && !keys.length
            ? html`<div class="no-match" role="status">
                <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
                <p>
                  ${this._l("search.no_match", { query: this._query.trim() })}
                </p>
                <ha-button
                  appearance="plain"
                  class="tall"
                  @click=${this._clearSearch}
                >
                  ${this._l("search.clear")}
                </ha-button>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _queryChanged(ev: Event) {
    this._query = (ev.target as HTMLInputElement).value ?? "";
  }

  private async _clearSearch() {
    this._query = "";
    // The button that was pressed leaves with the no-match card, so focus
    // goes to the search field instead of falling back to the page.
    await this.updateComplete;
    this._searchField?.focus();
  }

  private _toggleAll() {
    const keys = this._shownKeys();
    const expanded = this._expanded;
    const allOpen = keys.every((key) => expanded.includes(key));
    this._openRows = setExpanded(expanded, keys, !allOpen);
  }

  private _toggleRow(ev: Event) {
    const key = (ev.currentTarget as HTMLElement & { rowKey: string }).rowKey;
    this._openRows = toggleExpanded(this._expanded, key);
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
          <label class="keep">
            <span>${this._l("keep.label", { days: dest.keep_days })}</span>
            <ha-slider
              labeled
              min=${KEEP_DAYS_RANGE.min}
              max=${KEEP_DAYS_RANGE.max}
              step="1"
              .value=${Math.min(dest.keep_days, KEEP_DAYS_RANGE.max)}
              .entryId=${dest.entry_id}
              @change=${this._keepDaysChanged}
            ></ha-slider>
            <span class="amount-note">${this._l("keep.note")}</span>
          </label>
          ${
            dest.error
              ? html`<ha-alert alert-type="warning"
                  >${this._l("copy_problem", { error: dest.error })}
                  <ha-button
                    slot="action"
                    appearance="plain"
                    size="small"
                    @click=${this._load}
                  >
                    ${this._l("try_again")}
                  </ha-button></ha-alert
                >`
              : nothing
          }
          ${this._renderCameraList(dest)}
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

  private _renderCameraList(dest: RecordingDestinationStatus) {
    const shown = this._shown(dest);
    if (!shown.length) {
      return this._query.trim() && this._shownKeys().length
        ? html`<p class="none-here">${this._l("search.none_here")}</p>`
        : nothing;
    }
    return html`
      <div class="cameras">
        <div class="col-head" aria-hidden="true">
          <span></span>
          <span>${this._l("camera")}</span>
          <span>${this._l("amount.title")}</span>
          <span>${this._l("newest")}</span>
          <span>${this._l("waiting")}</span>
          <span>${this._l("oldest")}</span>
          <span></span>
        </div>
        ${repeat(
          shown,
          (cam) => cameraKey(dest.entry_id, cam.entity_id),
          (cam) => this._renderCameraRow(dest, cam)
        )}
      </div>
    `;
  }

  /** True when the camera has a problem worth showing while its row is folded. */
  private _hasProblem(cam: RecordingCameraStatus): boolean {
    return (
      !!cam.error &&
      cam.state !== "recording" &&
      cam.state !== "paused" &&
      !cam.provider_only
    );
  }

  /** A short phrase for a camera with a problem, in the language it is built for. */
  private _problemPhrase(
    cam: RecordingCameraStatus,
    part: (key: string, values?: Record<string, string | number>) => string
  ): string {
    const prefix = "ui.panel.config.camera_recording.row";
    const since = cam.newest ? "_since" : "";
    const time = this._time(cam.newest);
    if (cam.state === "no_stream") {
      return part(`${prefix}.no_video${since}`, { time });
    }
    if (cam.state === "reconnecting") {
      return part(`${prefix}.trying_again${since}`, { time });
    }
    return cam.error ?? "";
  }

  // Each language half is built whole and then joined by the language mode,
  // so the both-languages line does not run one language into the other.
  private _summary(cam: RecordingCameraStatus): string {
    const prefix = "ui.panel.config.camera_recording";
    const active = this._activeAmount(cam);
    return composeForMode(
      this.hass.localize as unknown as (
        key: string,
        values?: Record<string, string | number>
      ) => string,
      (part) => {
        let rest: string;
        if (this._hasProblem(cam)) {
          rest = this._problemPhrase(cam, part);
        } else if (active === "light" && !cam.newest) {
          rest = part(`${prefix}.row.events_today`, {
            count: cam.events_today,
          });
        } else if (cam.newest) {
          rest = part(`${prefix}.row.newest_waiting`, {
            time: this._time(cam.newest),
            count: cam.waiting,
          });
        } else {
          rest = part(`${prefix}.row.nothing_kept`);
        }
        return part(`${prefix}.row.summary`, {
          amount: part(`${prefix}.amount.${active}`),
          rest,
        });
      }
    );
  }

  private _renderCameraRow(
    dest: RecordingDestinationStatus,
    cam: RecordingCameraStatus
  ) {
    const key = cameraKey(dest.entry_id, cam.entity_id);
    const open = this._expanded.includes(key);
    const regionId = `camera-${key}`;
    const name = this._name(cam);
    const paused = cam.state === "paused";
    const notes = this._renderNotes(cam);
    const parts = this._renderAmountParts(dest, cam);
    return html`
      <div class="camera ${open ? "open" : ""}">
        <div class="camera-head">
          <button
            class="disclosure"
            aria-expanded=${open ? "true" : "false"}
            aria-controls=${regionId}
            .rowKey=${key}
            @click=${this._toggleRow}
          >
            <span class="lead ${this._leadTone(cam)}"
              ><ha-svg-icon .path=${mdiVideo}></ha-svg-icon
            ></span>
            <span class="main">
              <span class="top"
                ><span class="name">${name}</span>${this._renderPill(cam)}</span
              >
              <span class="summary">${this._summary(cam)}</span>
              <span class="eid">${cam.entity_id}</span>
              ${
                this._hasProblem(cam)
                  ? html`<span class="err">${this._composeProblem(cam)}</span>`
                  : nothing
              }
            </span>
            <span class="cell"
              ><span class="sr">${this._l("amount.title")}: </span>${this._l(
                `amount.${this._activeAmount(cam)}`
              )}</span
            >
            <span class="cell"
              ><span class="sr">${this._l("newest")}: </span>${this._time(
                cam.newest
              )}</span
            >
            <span class="cell"
              ><span class="sr">${this._l("waiting")}: </span>${
                cam.waiting
              }</span
            >
            <span class="cell"
              ><span class="sr">${this._l("oldest")}: </span>${this._time(
                cam.oldest
              )}</span
            >
            <ha-svg-icon class="chev" .path=${mdiChevronDown}></ha-svg-icon>
          </button>
          <ha-icon-button
            .path=${paused ? mdiPlay : mdiPause}
            .label=${this._l(
              paused ? "row.resume_camera" : "row.pause_camera",
              {
                name,
              }
            )}
            .entity=${cam.entity_id}
            .entryId=${dest.entry_id}
            .paused=${!paused}
            @click=${this._togglePause}
          ></ha-icon-button>
        </div>
        ${
          open
            ? html`<div
                class="body"
                id=${regionId}
                role="region"
                aria-label=${this._l("row.settings_of", { name })}
              >
                <div class="facts">
                  <span
                    ><b>${this._time(cam.newest)}</b
                    ><i>${this._l("newest")}</i></span
                  >
                  <span><b>${cam.waiting}</b><i>${this._l("waiting")}</i></span>
                  <span
                    ><b>${this._time(cam.oldest)}</b
                    ><i>${this._l("oldest")}</i></span
                  >
                </div>
                ${notes}
                <div class="cols">
                  <div class="grp g1">${parts.main}</div>
                  <div class="grp g2">${parts.check}</div>
                  <div class="grp g3">${parts.rest}</div>
                  <div class="grp g4">
                    <ha-camera-watched-settings
                      .hass=${this.hass}
                      .entryId=${dest.entry_id}
                      .entityId=${cam.entity_id}
                    ></ha-camera-watched-settings>
                  </div>
                </div>
              </div>`
            : html`<div class="body" id=${regionId} hidden></div>`
        }
      </div>
    `;
  }

  private _composeProblem(cam: RecordingCameraStatus): string {
    return composeForMode(
      this.hass.localize as unknown as (
        key: string,
        values?: Record<string, string | number>
      ) => string,
      (part) => this._problemPhrase(cam, part)
    );
  }

  private _leadTone(cam: RecordingCameraStatus): string {
    const tone = cam.provider_only ? "off" : (STATE_TONES[cam.state] ?? "off");
    return tone === "ok" || tone === "warn" ? tone : "";
  }

  private _renderPill(cam: RecordingCameraStatus) {
    if (cam.provider_only) {
      return html`<span class="pill ${cam.event_clips > 0 ? "ok" : "warn"}"
        >${this._l("states.event_clips")}</span
      >`;
    }
    return html`<span class="pill ${STATE_TONES[cam.state] ?? "off"}"
      >${this._l(`states.${cam.state}`)}</span
    >`;
  }

  /** The lines that used to sit under the state in the table. */
  private _renderNotes(cam: RecordingCameraStatus) {
    const key = amountKey(cam);
    if (cam.provider_only) {
      return html`<div class="problem">${this._l("provider_only_note")}</div>`;
    }
    return html`${
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

  /**
   * The settings of an open camera, in three parts: how much to keep, the
   * recording check, and what follows it. They sit in two columns on a wide
   * window and in this order on a narrow one.
   */
  private _renderAmountParts(
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
    const active = this._activeAmount(cam);
    const open = this._open.has(cam.entity_id);
    const mb = bytesToString(cam.bytes_today);
    const main = html`
      <div class="amount-head">
        <span class="amount-title">${this._l("amount.title")}</span>
        <ha-button-toggle-group
          size="m"
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
      ${cam.provider_only ? this._renderLive(dest, cam) : nothing}
    `;
    const check = cam.check ? this._renderCheck(dest, cam, cam.check) : nothing;
    const rest = html`
      <p class="amount-note">${this._l("amount.keeps_existing")}</p>
      ${
        active === "light" && !cam.provider_only
          ? this._renderLightSettings(dest, cam, open)
          : nothing
      }
    `;
    return { main, check, rest };
  }

  private _renderLive(
    dest: RecordingDestinationStatus,
    cam: RecordingCameraStatus
  ) {
    const blocked =
      cam.live_reason === "no_go2rtc" ||
      cam.live_reason === "external_go2rtc" ||
      cam.live_reason === "core_https"
        ? cam.live_reason
        : undefined;
    const available = !blocked;
    return html`
      <div class="live">
        <label class="live-switch">
          <ha-switch
            .checked=${cam.live_enabled}
            .disabled=${!available}
            .entryId=${dest.entry_id}
            .entity=${cam.entity_id}
            @change=${this._liveToggled}
          ></ha-switch>
          <span>${this._l("amount.live_title")}</span>
        </label>
        <p class="amount-note">
          ${
            available
              ? this._l("amount.live_explain", { seconds: cam.clip_seconds })
              : this._l(`amount.live_${blocked ?? "no_go2rtc"}`)
          }
        </p>
        ${
          available
            ? html`<div class="sliders">
                  <label>
                    <span
                      >${this._l("amount.clip_length", {
                        seconds: cam.clip_seconds,
                      })}</span
                    >
                    <ha-slider
                      labeled
                      min=${CLIP_SECONDS_RANGE.min}
                      max=${CLIP_SECONDS_RANGE.max}
                      step="5"
                      .value=${cam.clip_seconds}
                      .entryId=${dest.entry_id}
                      .entity=${cam.entity_id}
                      .field=${"clip_seconds"}
                      @change=${this._liveNumberChanged}
                    ></ha-slider>
                  </label>
                  <label>
                    <span
                      >${this._l("amount.clips_per_hour", {
                        count: cam.clips_per_hour,
                      })}</span
                    >
                    <ha-slider
                      labeled
                      min=${CLIPS_PER_HOUR_RANGE.min}
                      max=${CLIPS_PER_HOUR_RANGE.max}
                      step="1"
                      .value=${cam.clips_per_hour}
                      .entryId=${dest.entry_id}
                      .entity=${cam.entity_id}
                      .field=${"clips_per_hour"}
                      @change=${this._liveNumberChanged}
                    ></ha-slider>
                  </label>
                </div>
                <p class="amount-note">
                  ${this._l("amount.live_left", { count: cam.live_left })}
                </p>`
            : nothing
        }
      </div>
    `;
  }

  private _renderCheck(
    dest: RecordingDestinationStatus,
    cam: RecordingCameraStatus,
    check: RecordingCheck
  ) {
    const program =
      check.go2rtc_problem ??
      (check.core_problem === "core_https" ? "core_https" : null);
    const testing = this._testing.has(cam.entity_id);
    const canTest = check.provider_only && !program && !check.recording_now;
    const test = check.last_test;
    const rows: [string, string][] = [
      [
        this._l("check.program"),
        program ? this._l(`check.program_${program}`) : this._l("check.ready"),
      ],
      [
        this._l("check.provider_only"),
        this._l(check.provider_only ? "check.yes" : "check.no"),
      ],
      [
        this._l("check.last_event"),
        check.last_event
          ? [
              this._time(check.last_event.at),
              check.last_event.kind
                ? this._kindText(check.last_event.kind)
                : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : this._l("check.none_yet"),
      ],
      [
        this._l("check.last_clip"),
        check.last_clip
          ? [
              this._time(check.last_clip.at),
              this._l(
                check.last_clip.origin === "home"
                  ? "check.from_home"
                  : "check.from_service"
              ),
              this._l("check.length", {
                seconds: Math.round(check.last_clip.duration),
              }),
              check.last_clip.cut_short ? this._l("check.cut_short") : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : this._l("check.none_yet"),
      ],
      [
        this._l("check.last_problem"),
        check.last_problem
          ? `${this._time(check.last_problem.at)} · ${this._reasonText(
              check.last_problem.reason
            )}`
          : this._l("check.no_problem"),
      ],
      [
        this._l("check.clips_left"),
        this._l("check.clips_left_value", {
          count: check.clips_left,
          total: cam.clips_per_hour,
        }),
      ],
    ];
    return html`
      <section class="check" aria-label=${this._l("check.title")}>
        <h3>${this._l("check.title")}</h3>
        <dl>
          ${rows.map(
            ([label, value]) =>
              html`<div class="check-row">
                <dt>${label}</dt>
                <dd>${value}</dd>
              </div>`
          )}
        </dl>
        ${
          check.provider_only
            ? html`<div class="check-test">
                <ha-button
                  size="small"
                  class="tall"
                  appearance="filled"
                  .disabled=${!canTest || testing}
                  .entryId=${dest.entry_id}
                  .entity=${cam.entity_id}
                  @click=${this._testClip}
                >
                  ${this._l(testing ? "check.testing" : "check.test")}
                </ha-button>
                <span class="amount-note">${this._l("check.test_note")}</span>
              </div>`
            : nothing
        }
        ${
          test
            ? html`<p
                class="check-result ${test.ok ? "ok" : "bad"}"
                role="status"
              >
                ${
                  test.ok
                    ? this._l("check.test_ok", {
                        time: this._time(test.at),
                        seconds: Math.round(test.duration ?? 0),
                        size: bytesToString(test.size ?? 0),
                      })
                    : this._failedText(test.at, test.reason ?? "failed")
                }
              </p>`
            : nothing
        }
      </section>
    `;
  }

  private _kindText(kind: string): string {
    const known = [
      "doorbell_chime",
      "camera_motion",
      "camera_person",
      "camera_sound",
      "doorbell",
      "motion",
      "person",
      "sound",
      "ring",
    ];
    return known.includes(kind)
      ? this._l(`check.kinds.${kind}`)
      : this._l("check.kinds.other");
  }

  // The reason is put into the sentence in the sentence's own language, so
  // the both-languages mode does not repeat it inside each half.
  private _failedText(at: number, reason: string): string {
    const prefix = "ui.panel.config.camera_recording.check";
    return composeForMode(
      this.hass.localize as unknown as (
        key: string,
        values?: Record<string, string | number>
      ) => string,
      (part) =>
        part(`${prefix}.test_failed`, {
          time: this._time(at),
          reason: part(`${prefix}.reasons.${this._reasonCode(reason)}`),
        })
    );
  }

  private _reasonText(reason: string): string {
    return this._l(`check.reasons.${this._reasonCode(reason)}`);
  }

  private _reasonCode(reason: string): string {
    const known = [
      "recording_off",
      "rate_limited",
      "timed_out",
      "unsupported",
      "storage_full",
      "storage_unreachable",
      "removed",
      "no_media",
      "failed",
      "stream_ended",
      "camera_busy",
      "hourly_limit",
      "busy",
      "no_go2rtc",
      "external_go2rtc",
      "core_https",
      "not_needed",
      "no_http",
    ];
    return known.includes(reason) ? reason : "failed";
  }

  private async _testClip(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
    };
    const entity = target.entity;
    this._testing = new Set(this._testing).add(entity);
    try {
      await recordTestClip(this.hass, target.entryId, entity);
      this._problem = undefined;
    } catch (err: unknown) {
      this._problem = (err as Error | undefined)?.message ?? String(err);
    }
    const testing = new Set(this._testing);
    testing.delete(entity);
    this._testing = testing;
    await this._load();
  }

  private async _keepDaysChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      value: number;
    };
    try {
      await setKeepDays(this.hass, target.entryId, Number(target.value));
      this._problem = undefined;
    } catch (err: unknown) {
      this._problem = (err as Error | undefined)?.message ?? String(err);
    }
    await this._load();
  }

  private async _applyLive(
    entryId: string,
    entity: string,
    options: Parameters<typeof setLiveOptions>[3]
  ) {
    try {
      await setLiveOptions(this.hass, entryId, entity, options);
      this._problem = undefined;
    } catch (err: unknown) {
      this._problem = (err as Error | undefined)?.message ?? String(err);
    }
    await this._load();
  }

  private async _liveToggled(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      checked: boolean;
    };
    await this._applyLive(target.entryId, target.entity, {
      live: target.checked,
    });
  }

  private async _liveNumberChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      entryId: string;
      entity: string;
      field: "clip_seconds" | "clips_per_hour";
      value: number;
    };
    await this._applyLive(target.entryId, target.entity, {
      [target.field]: Number(target.value),
    });
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
    return formatShortDateTimeWithConditionalYear(
      new Date(seconds * 1000),
      this.hass.locale,
      this.hass.config
    );
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
    await this.updateComplete;
    // A search on a state can remove the row whose button was just pressed.
    if (!target.isConnected) {
      this._searchField?.focus();
    }
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

  static styles: CSSResultGroup = [
    haMotionKeyframes,
    css`
      .content {
        container-type: inline-size;
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
      .grp p {
        margin: 0;
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .amount-note,
      .amount-today {
        color: var(--secondary-text-color);
      }
      .live-switch {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 48px;
      }
      .live {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .sliders {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--ha-space-2);
      }
      .sliders label {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
      }
      .sliders ha-slider {
        width: 100%;
        margin-block: var(--ha-space-3);
      }
      .sources {
        display: flex;
        flex-direction: column;
      }
      .source {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 48px;
        font-size: var(--ha-font-size-s);
      }
      .kind {
        color: var(--secondary-text-color);
      }
      button.link {
        align-self: flex-start;
        min-height: 48px;
        padding: 0;
        border: none;
        background: none;
        color: var(--primary-color);
        font: inherit;
        font-size: var(--ha-font-size-s);
        cursor: pointer;
      }
      .keep {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        margin-bottom: var(--ha-space-3);
      }
      /* The slider's touch area reaches past its own box, so it needs room
       above and below or it sits over the label. */
      .keep ha-slider {
        width: 100%;
        margin-block: var(--ha-space-3);
      }
      .check {
        margin-top: var(--ha-space-2);
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        background: var(--secondary-background-color);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        min-width: 0;
      }
      .check h3 {
        margin: 0;
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-medium);
      }
      .check dl {
        margin: 0;
        display: flex;
        flex-direction: column;
      }
      .check-row {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) 0;
        border-bottom: 1px solid var(--divider-color);
        font-size: var(--ha-font-size-s);
      }
      .check-row:last-child {
        border-bottom: none;
      }
      .check dt {
        color: var(--secondary-text-color);
        overflow-wrap: anywhere;
      }
      .check dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .check-test {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .check-result {
        margin: 0;
        font-size: var(--ha-font-size-s);
      }
      .check-result.bad {
        color: var(--error-color);
      }
      @media (max-width: 450px) {
        .check-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 0;
        }
      }
      .problem {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        margin-top: var(--ha-space-1);
      }
      .search {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .count-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-2);
        min-height: 48px;
        padding-inline-start: var(--ha-space-4);
      }
      ha-button.tall {
        --ha-button-height: 48px;
      }
      .pattern-error {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-2);
        margin: 0;
        padding-inline: var(--ha-space-4);
        color: var(--error-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .loading ha-skeleton-text {
        --ha-skeleton-text-width: 100%;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .err {
        display: none;
        color: var(--error-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .count {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .no-match {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl);
        background: var(--card-background-color);
        color: var(--secondary-text-color);
        text-align: center;
      }
      .no-match p {
        margin: 0;
        color: var(--primary-text-color);
        overflow-wrap: anywhere;
      }
      .none-here {
        margin: 0;
        padding: var(--ha-space-3) var(--ha-space-2);
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }

      /* One folding row per camera. Under about 700 px the row is a name, a
       state and one summary line; wider, it carries the columns. */
      .cameras {
        --cols: 40px minmax(190px, 2.3fr) minmax(96px, 1fr) minmax(96px, 1fr)
          minmax(96px, 1fr) minmax(84px, 0.9fr) 24px;
        display: flex;
        flex-direction: column;
        margin-top: var(--ha-space-3);
      }
      .col-head {
        display: none;
      }
      .camera {
        border-radius: var(--ha-border-radius-lg);
        transition: background-color var(--ha-animation-duration-normal, 200ms)
          ease;
      }
      .camera + .camera {
        box-shadow: 0 -1px 0 var(--divider-color);
      }
      .camera.open {
        background: var(--secondary-background-color);
        box-shadow: none;
      }
      .camera.open + .camera {
        box-shadow: none;
      }
      .camera-head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        padding-inline-end: var(--ha-space-1);
      }
      .disclosure {
        flex: 1;
        min-width: 0;
        min-height: 68px;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) 24px;
        align-items: center;
        gap: var(--ha-space-3);
        padding-block: var(--ha-space-2);
        padding-inline: var(--ha-space-2) var(--ha-space-1);
        border: none;
        border-radius: var(--ha-border-radius-lg);
        background: none;
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }
      .disclosure:hover {
        background: color-mix(
          in srgb,
          var(--primary-text-color) 5%,
          transparent
        );
      }
      .disclosure:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .lead {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      .lead.ok {
        background: color-mix(in srgb, var(--success-color) 22%, transparent);
        color: var(--success-color);
      }
      .lead.warn {
        background: color-mix(in srgb, var(--warning-color) 25%, transparent);
        color: var(--warning-color);
      }
      .camera.open .lead:not(.ok):not(.warn) {
        background: var(--card-background-color);
      }
      .main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px var(--ha-space-2);
      }
      .name {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .summary {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .eid,
      .cell {
        display: none;
      }
      .chev {
        color: var(--secondary-text-color);
        transition: transform var(--ha-animation-duration-normal, 200ms) ease;
      }
      .camera.open .chev {
        transform: rotate(180deg);
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-1) var(--ha-space-3) var(--ha-space-4);
        animation: ha-rise var(--ha-animation-duration-normal, 200ms) ease both;
      }
      .body[hidden] {
        display: none;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        background: var(--card-background-color);
      }
      .facts span {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .facts b {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .facts i {
        min-width: 0;
        overflow-wrap: anywhere;
        font-style: normal;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .cols {
        display: contents;
      }
      .grp {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        min-width: 0;
      }
      .grp:empty {
        display: none;
      }
      .camera.open .check {
        background: var(--card-background-color);
      }

      @container (min-width: 860px) {
        .col-head {
          display: grid;
          grid-template-columns: var(--cols);
          gap: var(--ha-space-3);
          padding-block: var(--ha-space-1) var(--ha-space-2);
          padding-inline: var(--ha-space-3) 60px;
          box-shadow: inset 0 -1px 0 var(--divider-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .col-head > span {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .disclosure {
          grid-template-columns: var(--cols);
          padding-inline-start: var(--ha-space-3);
        }
        .summary,
        .facts {
          display: none;
        }
        .eid {
          display: block;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .err {
          display: block;
        }
        .cell {
          display: block;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .body {
          padding-inline: 64px var(--ha-space-4);
        }
        .cols {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-areas:
            "main check"
            "rest watched";
          gap: var(--ha-space-3) var(--ha-space-6, 28px);
          align-items: start;
        }
        .g1 {
          grid-area: main;
        }
        .g2 {
          grid-area: check;
        }
        .g3 {
          grid-area: rest;
        }
        .g4 {
          grid-area: watched;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-camera-recording": HaConfigCameraRecording;
  }
}
