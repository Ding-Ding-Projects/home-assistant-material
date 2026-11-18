import {
  mdiAlertCircleOutline,
  mdiGoogleDrive,
  mdiHarddisk,
  mdiMicrosoftOnedrive,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime } from "../../../common/datetime/format_time";
import { withLanguageMode } from "../../../common/language-mode/language-mode";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-card";
import "../../../components/ha-slider";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { RecordingDestinationStatus } from "../../../data/camera_recording";
import {
  CLOUD_DRIVE_NAMES,
  CLOUD_KEEP_DAYS_RANGE,
  cloudProblemKey,
  fetchCloudUploadStatus,
  setCloudDrive,
  type CloudDriveChange,
  type CloudDriveDomain,
  type CloudDriveStatus,
  type CloudSendChoice,
} from "../../../data/camera_recording_cloud";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

const REFRESH_MS = 10_000;

const DRIVE_ICONS: Record<CloudDriveDomain, string> = {
  onedrive: mdiMicrosoftOnedrive,
  google_drive: mdiGoogleDrive,
};

/**
 * Where camera recordings go: this system, and each cloud drive reached through
 * its own integration, which keeps the sign-in.
 */
@customElement("ha-camera-recording-places")
export class HaCameraRecordingPlaces extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The recording destinations on this system, from the page's own status. */
  @property({ attribute: false })
  public destinations?: RecordingDestinationStatus[];

  @state() private _drives?: CloudDriveStatus[];

  @state() private _error?: string;

  @state() private _busy = new Set<CloudDriveDomain>();

  private _timer?: number;

  public connectedCallback() {
    super.connectedCallback();
    this._load();
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
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
      this._drives = (await fetchCloudUploadStatus(this.hass)).drives;
      this._error = undefined;
    } catch (err: unknown) {
      // Before the first recording place is added the server has no such command.
      if ((err as { code?: string } | undefined)?.code === "unknown_command") {
        this._drives = [];
        this._error = undefined;
        return;
      }
      this._error = (err as Error | undefined)?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>) {
    return withLanguageMode(this.hass.localize)(
      `ui.panel.config.camera_recording.places.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  private _time(at: number) {
    return formatTime(new Date(at * 1000), this.hass.locale, this.hass.config);
  }

  protected render(): TemplateResult {
    const drives = this._drives ?? [];
    return html`
      <ha-card>
        <h2 class="title">${this._l("title")}</h2>
        ${
          this._error
            ? html`<ha-alert alert-type="error"
                >${this._l("load_failed", { error: this._error })}</ha-alert
              >`
            : nothing
        }
        <div class="rows">
          ${this._renderThisSystem()}
          ${drives.map((drive) => this._renderRow(drive))}
        </div>
        ${drives
          .filter((drive) => drive.enabled)
          .map((drive) => this._renderDetails(drive))}
        <p class="warning">
          <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
          <span>${this._l("warning")}</span>
        </p>
      </ha-card>
    `;
  }

  private _renderThisSystem() {
    const places = this.destinations ?? [];
    const used = places.reduce((sum, dest) => sum + dest.used_bytes, 0);
    const days = places.reduce((max, dest) => Math.max(max, dest.keep_days), 0);
    return html`
      <div class="row">
        <ha-svg-icon class="icon" .path=${mdiHarddisk}></ha-svg-icon>
        <div class="text">
          <span class="name">${this._l("this_system")}</span>
          <span class="secondary"
            >${
              places.length
                ? this._l("this_system_summary", {
                    used: bytesToString(used),
                    days,
                  })
                : this._l("this_system_none")
            }</span
          >
        </div>
        <ha-switch
          .checked=${places.length > 0}
          disabled
          .label=${this._l("this_system")}
        ></ha-switch>
      </div>
    `;
  }

  private _summary(drive: CloudDriveStatus): string {
    if (!drive.set_up) {
      return this._l("not_set_up");
    }
    if (!drive.loaded) {
      return this._l("not_loaded");
    }
    if (!drive.enabled) {
      return this._l("off");
    }
    if (drive.waiting_files > 0) {
      return this._l("waiting_summary", {
        count: drive.waiting_files,
        size: bytesToString(drive.waiting_bytes),
      });
    }
    if (drive.last_sent) {
      return this._l("up_to_date_last", {
        time: this._time(drive.last_sent.at),
      });
    }
    return this._l("nothing_sent_yet");
  }

  private _renderRow(drive: CloudDriveStatus) {
    const name = CLOUD_DRIVE_NAMES[drive.domain];
    return html`
      <div class="row">
        <ha-svg-icon
          class="icon"
          .path=${DRIVE_ICONS[drive.domain]}
        ></ha-svg-icon>
        <div class="text">
          <span class="name">${name}</span>
          <span class="secondary">${this._summary(drive)}</span>
        </div>
        ${
          drive.set_up
            ? html`<ha-switch
                .checked=${drive.enabled}
                .disabled=${this._busy.has(drive.domain)}
                .label=${name}
                .domain=${drive.domain}
                @change=${this._switchChanged}
              ></ha-switch>`
            : html`<ha-button
                appearance="plain"
                size="small"
                .domain=${drive.domain}
                @click=${this._setUp}
                >${this._l("set_up")}</ha-button
              >`
        }
      </div>
    `;
  }

  private _renderDetails(drive: CloudDriveStatus) {
    const name = CLOUD_DRIVE_NAMES[drive.domain];
    const forever = drive.keep_days === null;
    const sendButtons: { value: CloudSendChoice; label: string }[] = [
      { value: "events", label: this._l("send_events") },
      { value: "everything", label: this._l("send_everything") },
    ];
    const lastSent = drive.last_sent;
    const camera = lastSent
      ? (this.hass.states[lastSent.entity_id]?.attributes.friendly_name ??
        lastSent.entity_id)
      : undefined;
    return html`
      <section class="details" aria-label=${name}>
        <h3 class="overline">${name}</h3>
        <div class="field">
          <span class="label">${this._l("send")}</span>
          <ha-button-toggle-group
            size="s"
            .buttons=${sendButtons}
            .active=${drive.send}
            .domain=${drive.domain}
            @value-changed=${this._sendChanged}
          ></ha-button-toggle-group>
        </div>
        <div class="field">
          <span class="label">${this._l("folder")}</span>
          <span class="value">${this._l("folder_path")}</span>
        </div>
        <div class="field keep">
          <span class="label">${this._l("keep")}</span>
          <span class="value"
            >${
              forever
                ? this._l("keep_forever")
                : this._l("keep_days", { days: drive.keep_days ?? 0 })
            }</span
          >
        </div>
        ${
          forever
            ? nothing
            : html`<ha-slider
                labeled
                min=${CLOUD_KEEP_DAYS_RANGE.min}
                max=${CLOUD_KEEP_DAYS_RANGE.max}
                step="1"
                .value=${drive.keep_days ?? CLOUD_KEEP_DAYS_RANGE.default}
                .domain=${drive.domain}
                .label=${this._l("keep")}
                @change=${this._keepChanged}
              ></ha-slider>`
        }
        <label class="field">
          <span class="label">${this._l("keep_forever_switch")}</span>
          <ha-switch
            .checked=${forever}
            .domain=${drive.domain}
            @change=${this._foreverChanged}
          ></ha-switch>
        </label>
        <div class="field">
          <span class="label">${this._l("waiting")}</span>
          <span class="value"
            >${
              drive.waiting_files
                ? this._l("waiting_value", {
                    count: drive.waiting_files,
                    size: bytesToString(drive.waiting_bytes),
                  })
                : this._l("nothing_waiting")
            }</span
          >
        </div>
        <div class="field">
          <span class="label">${this._l("last_sent")}</span>
          <span class="value"
            >${
              lastSent
                ? this._l("last_sent_value", {
                    time: this._time(lastSent.at),
                    camera: String(camera),
                  })
                : this._l("none_yet")
            }</span
          >
        </div>
        <div class="field">
          <span class="label">${this._l("last_problem")}</span>
          <span class="value ${drive.last_problem ? "bad" : ""}"
            >${
              drive.last_problem
                ? this._l("last_problem_value", {
                    time: this._time(drive.last_problem.at),
                    reason: this._l(
                      `reasons.${cloudProblemKey(drive.last_problem.reason)}`
                    ),
                  })
                : this._l("no_problem")
            }</span
          >
        </div>
        ${
          drive.free_bytes !== null
            ? html`<p class="note">
                ${this._l("free", { size: bytesToString(drive.free_bytes) })}
              </p>`
            : nothing
        }
      </section>
    `;
  }

  private async _change(domain: CloudDriveDomain, change: CloudDriveChange) {
    this._busy = new Set(this._busy).add(domain);
    try {
      this._drives = (await setCloudDrive(this.hass, domain, change)).drives;
      this._error = undefined;
    } catch (err: unknown) {
      this._error = (err as Error | undefined)?.message ?? String(err);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(domain);
      this._busy = busy;
    }
  }

  private async _switchChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      domain: CloudDriveDomain;
      checked: boolean;
    };
    const domain = target.domain;
    if (!target.checked) {
      await this._change(domain, { enabled: false });
      return;
    }
    const name = CLOUD_DRIVE_NAMES[domain];
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("confirm_title", { drive: name }),
      text: this._l("warning"),
      confirmText: this._l("confirm_ok"),
      dismissText: this._l("confirm_cancel"),
    });
    if (!confirmed) {
      target.checked = false;
      return;
    }
    await this._change(domain, {
      enabled: true,
      video_leaves_home_confirmed: true,
    });
  }

  private async _sendChanged(ev: CustomEvent<{ value: CloudSendChoice }>) {
    const target = ev.currentTarget as HTMLElement & {
      domain: CloudDriveDomain;
    };
    await this._change(target.domain, { send: ev.detail.value });
  }

  private async _keepChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      domain: CloudDriveDomain;
      value: number;
    };
    await this._change(target.domain, { keep_days: Number(target.value) });
  }

  private async _foreverChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      domain: CloudDriveDomain;
      checked: boolean;
    };
    await this._change(target.domain, {
      keep_days: target.checked ? null : CLOUD_KEEP_DAYS_RANGE.default,
    });
  }

  private _setUp(ev: Event) {
    const domain = (ev.currentTarget as HTMLElement & { domain: string })
      .domain;
    navigate(`/config/integrations/dashboard/add?domain=${domain}`);
  }

  static styles: CSSResultGroup = css`
    ha-card {
      padding: var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .rows {
      display: flex;
      flex-direction: column;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 56px;
    }
    .icon {
      flex: none;
      color: var(--secondary-text-color);
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-size: var(--ha-font-size-m);
    }
    .secondary,
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    ha-switch,
    ha-button {
      flex: none;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .details {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
    }
    .overline {
      margin: 0;
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .value {
      font-size: var(--ha-font-size-s);
      text-align: end;
    }
    .value.bad {
      color: var(--error-color);
    }
    ha-slider {
      width: 100%;
    }
    .note {
      margin: 0;
    }
    .warning {
      display: flex;
      gap: var(--ha-space-2);
      align-items: flex-start;
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .warning ha-svg-icon {
      flex: none;
      --mdc-icon-size: 20px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-recording-places": HaCameraRecordingPlaces;
  }
}
