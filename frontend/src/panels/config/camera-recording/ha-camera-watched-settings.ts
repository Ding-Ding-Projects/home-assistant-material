import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { withLanguageMode } from "../../../common/language-mode/language-mode";
import "../../../components/ha-alert";
import "../../../components/ha-slider";
import "../../../components/ha-switch";
import {
  DEFAULT_WATCH_SETTINGS,
  fetchWatched,
  forgetWatchedSummary,
  saveWatchSettings,
  type WatchedSummary,
  type WatchSettings,
} from "../../../data/camera_watched";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";

type SwitchKey = "auto_start" | "keep_live" | "keep_snapshots";
type NumberKey = "longest_minutes" | "snapshot_seconds";

const SWITCHES: SwitchKey[] = ["auto_start", "keep_live", "keep_snapshots"];

const RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  longest_minutes: { min: 1, max: 60, step: 1 },
  snapshot_seconds: { min: 10, max: 600, step: 10 },
};

/** The three switches and two numbers for keeping what a camera is asked to show. */
@customElement("ha-camera-watched-settings")
export class HaCameraWatchedSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entryId!: string;

  @property({ attribute: false }) public entityId!: string;

  @state() private _summary?: WatchedSummary;

  @state() private _error?: string;

  @state() private _saving = false;

  private _l(key: string, values?: Record<string, string | number>) {
    return withLanguageMode(this.hass.localize)(
      `ui.panel.config.camera_recording.watched.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  public override connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  protected override updated(changed: Map<string, unknown>) {
    super.updated(changed);
    if (changed.has("entityId") && changed.get("entityId") !== undefined) {
      this._load();
    }
  }

  private async _load() {
    if (!this.hass || !this.entityId) {
      return;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      this._summary = await fetchWatched(
        this.hass,
        this.entityId,
        start,
        new Date()
      );
      this._error = undefined;
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : String(err);
    }
  }

  private get _settings(): WatchSettings {
    return this._summary?.settings ?? DEFAULT_WATCH_SETTINGS;
  }

  protected override render(): TemplateResult | typeof nothing {
    if (this._error) {
      return html`<ha-alert alert-type="warning"
        >${this._l("load_failed", { error: this._error })}</ha-alert
      >`;
    }
    if (!this._summary) {
      return nothing;
    }
    const settings = this._settings;
    const today = this._summary.kept_today;
    return html`
      <section class="watched" aria-labelledby="watched-title">
        <h3 id="watched-title">${this._l("title")}</h3>
        ${SWITCHES.map(
          (key) => html`
            <label class="row">
              <span class="text">
                <span class="name">${this._l(`${key}.title`)}</span>
                <span class="note">${this._l(`${key}.note`)}</span>
              </span>
              <ha-switch
                .checked=${settings[key]}
                .disabled=${this._saving}
                .field=${key}
                @change=${this._switchChanged}
              ></ha-switch>
            </label>
          `
        )}
        ${(Object.keys(RANGES) as NumberKey[]).map(
          (key) => html`
            <label class="row number">
              <span class="name"
                >${this._l(`${key}.title`, { value: settings[key] })}</span
              >
              <ha-slider
                labeled
                min=${RANGES[key].min}
                max=${RANGES[key].max}
                step=${RANGES[key].step}
                .value=${settings[key]}
                .field=${key}
                .disabled=${this._saving}
                @change=${this._numberChanged}
              ></ha-slider>
            </label>
          `
        )}
        ${
          today
            ? html`<p class="note">
                ${this._l("kept_today", {
                  live_views: today.live_views,
                  snapshots: today.snapshots,
                  size: bytesToString(today.size),
                })}
              </p>`
            : nothing
        }
        ${
          this._summary.live?.route === "home"
            ? html`<p class="note">${this._l("one_session")}</p>`
            : nothing
        }
      </section>
    `;
  }

  private _switchChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      checked: boolean;
      field: SwitchKey;
    };
    this._save({ [target.field]: target.checked });
  }

  private _numberChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & {
      value: number;
      field: NumberKey;
    };
    this._save({ [target.field]: Number(target.value) });
  }

  private async _save(changes: Partial<WatchSettings>) {
    this._saving = true;
    try {
      const result = await saveWatchSettings(
        this.hass,
        this.entryId,
        this.entityId,
        changes
      );
      this._summary = { ...this._summary!, ...result };
      forgetWatchedSummary(this.entityId);
      this._error = undefined;
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._saving = false;
    }
  }

  static styles = css`
    .watched {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding-block: var(--ha-space-2);
    }
    h3 {
      margin: 0;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      min-height: 52px;
    }
    .row.number {
      flex-wrap: wrap;
    }
    .row.number ha-slider {
      flex: 1 1 160px;
      min-width: 0;
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-size: var(--ha-font-size-m);
    }
    .note {
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-watched-settings": HaCameraWatchedSettings;
  }
}
