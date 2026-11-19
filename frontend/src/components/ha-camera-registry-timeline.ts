import { mdiDocker } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { withLanguageMode } from "../common/language-mode/language-mode";
import {
  fetchRegistryRecordings,
  registryBars,
  registryOnlyRecordings,
  type RegistryPlayback,
  type RegistryRecording,
} from "../data/registry_storage";
import type { LocalizeFunc } from "../common/translations/localize";
import type { HomeAssistant } from "../types";
import "./ha-svg-icon";

const CACHE_MS = 30_000;

const cache = new Map<
  string,
  { at: number; recordings: Promise<RegistryRecording[]> }
>();

/**
 * The recordings of one camera that exist only in the registry inside a time
 * window, shared by the strip and the legend so the timeline asks once.
 */
const registryOnlyIn = (
  hass: Pick<HomeAssistant, "callWS">,
  entityId: string,
  start: number,
  end: number
): Promise<RegistryRecording[]> => {
  const key = `${entityId}|${start}|${end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.recordings;
  }
  const recordings = fetchRegistryRecordings(
    hass,
    entityId,
    start / 1000,
    end / 1000
  )
    .then((rows) => registryOnlyRecordings(rows))
    // No registry place yet: nothing to draw, and nothing to report.
    .catch(() => [] as RegistryRecording[]);
  cache.set(key, { at: Date.now(), recordings });
  return recordings;
};

class RegistryTimelineBase extends LitElement {
  @property({ attribute: false }) public api!: Pick<HomeAssistant, "callWS">;

  @property({ attribute: false }) public localize!: LocalizeFunc;

  @property({ attribute: "entity-id" }) public entityId!: string;

  /** The window being drawn, in milliseconds. */
  @property({ type: Number }) public start = 0;

  @property({ type: Number }) public end = 0;

  @state() protected _recordings: RegistryRecording[] = [];

  private _token = 0;

  protected willUpdate(changed: PropertyValues<this>) {
    if (
      this.api &&
      this.entityId &&
      this.end > this.start &&
      (changed.has("entityId") || changed.has("start") || changed.has("end"))
    ) {
      const token = ++this._token;
      registryOnlyIn(this.api, this.entityId, this.start, this.end).then(
        (recordings) => {
          if (token === this._token) {
            this._recordings = recordings;
          }
        }
      );
    }
  }

  protected _l(key: string) {
    return withLanguageMode(this.localize)(
      `ui.components.camera_timeline.${key}` as "ui.components.camera_timeline.label"
    );
  }
}

/** Hatched marks, on the timeline's band, for time that exists only in the registry. */
@customElement("ha-camera-registry-strip")
export class HaCameraRegistryStrip extends RegistryTimelineBase {
  protected render() {
    return registryBars(this._recordings, this.start, this.end).map(
      (bar) =>
        html`<div
          class="bar"
          style=${styleMap({
            left: `${bar.left * 100}%`,
            width: `${bar.width * 100}%`,
          })}
        ></div>`
    );
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .bar {
      position: absolute;
      top: 0;
      bottom: 0;
      min-width: 3px;
      border-radius: var(--ha-border-radius-sm);
      background: repeating-linear-gradient(
        135deg,
        var(--primary-color) 0 3px,
        transparent 3px 6px
      );
      border: 1px solid var(--primary-color);
      box-sizing: border-box;
    }
  `;
}

/** The legend for the strip: shown only when something exists only in the registry. */
@customElement("ha-camera-registry-legend")
export class HaCameraRegistryLegend extends RegistryTimelineBase {
  protected render() {
    if (!this._recordings.length) {
      return nothing;
    }
    return html`<span class="item"
        ><i class="swatch here"></i>${this._l("on_this_system")}</span
      ><span class="item"
        ><i class="swatch registry"></i>${this._l("in_registry")}</span
      >`;
  }

  static styles = css`
    :host {
      display: contents;
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .swatch {
      display: inline-block;
      width: 14px;
      height: 10px;
      border-radius: 2px;
    }
    .swatch.here {
      background: var(--primary-color);
    }
    .swatch.registry {
      border: 1px solid var(--primary-color);
      box-sizing: border-box;
      background: repeating-linear-gradient(
        135deg,
        var(--primary-color) 0 2px,
        transparent 2px 4px
      );
    }
  `;
}

/**
 * The mark on the sheet that plays a recording from the registry: where it
 * comes from, how much has arrived and how much has played.
 */
@customElement("ha-camera-registry-playback-mark")
export class HaCameraRegistryPlaybackMark extends LitElement {
  @property({ attribute: false }) public localize!: LocalizeFunc;

  @property({ attribute: false }) public playback?: RegistryPlayback;

  private _l(key: string, values?: Record<string, string | number>) {
    return withLanguageMode(this.localize)(
      `ui.panel.config.camera_recording.registry.playback.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  protected render() {
    const playback = this.playback;
    if (!playback) {
      return nothing;
    }
    const fetched = Math.round(
      Math.min(1, Math.max(0, playback.fetched)) * 100
    );
    const played = Math.round(Math.min(1, Math.max(0, playback.played)) * 100);
    return html`
      <div class="mark">
        <ha-svg-icon .path=${mdiDocker}></ha-svg-icon>
        <span>${this._l("mark")}</span>
      </div>
      <div
        class="bars"
        role="progressbar"
        aria-label=${this._l("mark")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${played}
        aria-valuetext=${this._l("progress", { fetched, played })}
      >
        <div class="fetched" style=${styleMap({ width: `${fetched}%` })}></div>
        <div class="played" style=${styleMap({ width: `${played}%` })}></div>
      </div>
      <p class=${classMap({ note: true, bad: playback.state === "failed" })}>
        ${
          playback.state === "failed"
            ? this._l("failed")
            : this._l("progress", { fetched, played })
        }
      </p>
      <p class="note">${this._l("note")}</p>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .mark {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--primary-color);
    }
    .bars {
      position: relative;
      height: 6px;
      border-radius: 3px;
      background: var(--divider-color);
      overflow: hidden;
    }
    .fetched,
    .played {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
    }
    .fetched {
      background: color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    .played {
      background: var(--primary-color);
    }
    .note {
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .note.bad {
      color: var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-registry-strip": HaCameraRegistryStrip;
    "ha-camera-registry-legend": HaCameraRegistryLegend;
    "ha-camera-registry-playback-mark": HaCameraRegistryPlaybackMark;
  }
}
