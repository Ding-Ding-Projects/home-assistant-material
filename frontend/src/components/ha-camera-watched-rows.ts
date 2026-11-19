import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import { withLanguageMode } from "../common/language-mode/language-mode";
import { getSignedPath } from "../data/auth";
import {
  fetchWatched,
  type WatchedKind,
  type WatchedRow,
} from "../data/camera_watched";
import type { HomeAssistant } from "../types";
import { bytesToString } from "../util/bytes-to-string";
import "./chips/ha-filter-chip";
import "./ha-button";

export type WatchedFilter = "all" | "events" | WatchedKind;

const FILTERS: WatchedFilter[] = ["all", "events", "live_view", "snapshot"];

const FILTER_KEYS: Record<WatchedFilter, string> = {
  all: "filter_all",
  events: "filter_events",
  live_view: "filter_live",
  snapshot: "filter_snapshots",
};

const pad = (value: number) => value.toString().padStart(2, "0");

/** 24-hour clock time of a UNIX time, for example 11:08. */
export const clockTime = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** A length in minutes and seconds, for example 1:12. */
export const lengthText = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${pad(whole % 60)}`;
};

/** Rows that pass a filter. Events are listed by the timeline, not here. */
export const filterWatched = (
  rows: WatchedRow[],
  filter: WatchedFilter
): WatchedRow[] =>
  filter === "all"
    ? rows
    : filter === "events"
      ? []
      : rows.filter((row) => row.kind === filter);

/**
 * The "Live view" and "Snapshot" rows of a camera, with the filter chips
 * shared with the event list. It fires `watched-filter-changed` so the page
 * that mounts it can hide or show its event rows to match.
 */
@customElement("ha-camera-watched-rows")
export class HaCameraWatchedRows extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId!: string;

  @state() private _rows: WatchedRow[] = [];

  @state() private _filter: WatchedFilter = "all";

  @state() private _loaded = false;

  private _l(key: string, values?: Record<string, string | number>) {
    return withLanguageMode(this.hass.localize)(
      `ui.panel.config.camera_recording.watched.rows.${key}` as "ui.panel.config.camera_recording.caption",
      values
    );
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed);
    if (changed.has("entityId") && this.entityId) {
      this._load();
    }
  }

  private async _load() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      const summary = await fetchWatched(
        this.hass,
        this.entityId,
        start,
        new Date()
      );
      this._rows = [...summary.rows].reverse();
    } catch (_err: unknown) {
      this._rows = [];
    }
    this._loaded = true;
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this._loaded) {
      return nothing;
    }
    const rows = filterWatched(this._rows, this._filter);
    return html`
      <div class="filters" role="group">
        ${FILTERS.map(
          (filter) =>
            html`<ha-filter-chip
              .label=${this._l(FILTER_KEYS[filter])}
              .selected=${this._filter === filter}
              .filter=${filter}
              @click=${this._pick}
            ></ha-filter-chip>`
        )}
      </div>
      ${
        this._filter !== "events" && !this._rows.length
          ? html`<p class="note">${this._l("empty")}</p>`
          : nothing
      }
      <ul>
        ${rows.map((row) => this._renderRow(row))}
      </ul>
    `;
  }

  private _renderRow(row: WatchedRow): TemplateResult {
    const parts: string[] = [clockTime(row.start)];
    if (row.kind === "live_view" && row.duration) {
      parts.push(lengthText(row.duration));
    }
    if (row.state === "none") {
      parts.push(this._l("not_kept"));
    } else if (row.state === "saving") {
      parts.push(this._l("saving"));
    } else if (row.points_at === "recording") {
      parts.push(this._l("in_recording"));
    }
    if (row.origin) {
      parts.push(this._l(`origin.${row.origin}`));
    }
    if (row.kind === "snapshot" && row.size) {
      parts.push(bytesToString(row.size));
    }
    const reason = row.state === "none" && row.reason ? row.reason : undefined;
    const playable = row.state === "saved" && row.name;
    return html`
      <li class=${row.kind}>
        <div class="text">
          <span class="name">${this._l(row.kind)}</span>
          <span class="meta">${parts.join(" · ")}</span>
          ${
            reason
              ? html`<span class="reason"
                  >${
                    withLanguageMode(this.hass.localize)(
                      `ui.components.camera_timeline.clip.reason.${reason}` as "ui.panel.config.camera_recording.caption"
                    ) || reason
                  }</span
                >`
              : nothing
          }
        </div>
        ${
          playable
            ? html`<ha-button
                size="small"
                appearance="plain"
                .row=${row}
                @click=${this._open}
                >${this._l(row.kind === "snapshot" ? "picture" : "play")}</ha-button
              >`
            : nothing
        }
      </li>
    `;
  }

  private _pick(ev: Event) {
    const filter = (ev.currentTarget as HTMLElement & { filter: WatchedFilter })
      .filter;
    this._filter = filter;
    fireEvent(this, "watched-filter-changed", { filter });
  }

  private async _open(ev: Event) {
    const row = (ev.currentTarget as HTMLElement & { row: WatchedRow }).row;
    const signed = await getSignedPath(
      this.hass,
      `/api/camera_recording/watched/${row.entry_id}/${this.entityId}/${row.name}`
    );
    window.open(signed.path, "_blank", "noreferrer");
  }

  static styles = css`
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      padding-block: var(--ha-space-2);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      min-height: 52px;
      border-block-end: 1px solid var(--divider-color);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-size: var(--ha-font-size-m);
    }
    .meta,
    .reason,
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .note {
      margin: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-watched-rows": HaCameraWatchedRows;
  }
  interface HASSDomEvents {
    "watched-filter-changed": { filter: WatchedFilter };
  }
}
