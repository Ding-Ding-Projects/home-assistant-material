import type { ContextType } from "@lit/context";
import {
  mdiCar,
  mdiChevronLeft,
  mdiChevronRight,
  mdiDoorbell,
  mdiEarHearing,
  mdiPaw,
  mdiPlay,
  mdiRun,
  mdiWalk,
} from "@mdi/js";
import { addDays, isSameDay, startOfDay } from "date-fns";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { formatDateWeekdayDay } from "../common/datetime/format_date";
import {
  formatTime,
  formatTimeWithSeconds,
} from "../common/datetime/format_time";
import { fireEvent } from "../common/dom/fire_event";
import type { LocalizeFunc } from "../common/translations/localize";
import {
  CAMERA_EVENT_KINDS,
  cameraEventEntities,
  fetchRecordedSegments,
  historyToEvents,
  recordedRanges,
  type CameraEvent,
  type CameraEventKind,
  type RecordedSegment,
} from "../data/camera_recording";
import {
  apiContext,
  configContext,
  entitiesContext,
  internationalizationContext,
  statesContext,
} from "../data/context";
import { fetchDateWS } from "../data/history";
import "./chips/ha-filter-chip";
import "./ha-button";
import "./ha-button-toggle-group";
import "./ha-icon-button";
import "./ha-svg-icon";

const HOUR = 3_600_000;
const REFRESH_MS = 30_000;
const STEP_MS = 10_000;
/** Markers closer than this share of the track are drawn as one group */
const CLUSTER_SHARE = 0.025;

const KIND_ICONS: Record<CameraEventKind, string> = {
  motion: mdiRun,
  person: mdiWalk,
  vehicle: mdiCar,
  animal: mdiPaw,
  doorbell: mdiDoorbell,
  sound: mdiEarHearing,
};

type Zoom = "1" | "6" | "24";

interface Cluster {
  x: number;
  events: CameraEvent[];
}

declare global {
  interface HASSDomEvents {
    "camera-timeline-seek": { time: number; segments: RecordedSegment[] };
    "camera-timeline-live": undefined;
    "camera-timeline-segments": { segments: RecordedSegment[] };
  }
}

/**
 * A day of a camera: recorded footage, gaps and events on a track under the
 * player, and a list of the events. Choosing a moment fires
 * `camera-timeline-seek`; returning to the live edge fires `camera-timeline-live`.
 */
@customElement("ha-camera-timeline")
export class HaCameraTimeline extends LitElement {
  @property({ attribute: "entity-id" }) public entityId!: string;

  /** The moment being played, in milliseconds; undefined while live */
  @property({ attribute: false }) public playhead?: number;

  @state() @consumeLocalize() private _localize!: LocalizeFunc;

  @consume({ context: apiContext })
  private _api!: ContextType<typeof apiContext>;

  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: ContextType<typeof entitiesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @state() private _day = startOfDay(new Date());

  @state() private _zoom: Zoom = "24";

  @state() private _hidden = new Set<CameraEventKind>();

  @state() private _segments: RecordedSegment[] = [];

  @state() private _recorded = false;

  @state() private _recordingNow = false;

  @state() private _width = 0;

  private _resize?: ResizeObserver;

  @state() private _events: CameraEvent[] = [];

  @state() private _now = Date.now();

  @state() private _error = false;

  private _timer?: number;

  private _request = 0;

  public connectedCallback() {
    super.connectedCallback();
    this._timer = window.setInterval(() => {
      this._now = Date.now();
      if (isSameDay(this._day, this._now)) {
        this._load();
      }
    }, REFRESH_MS);
  }

  protected firstUpdated() {
    this._resize = new ResizeObserver((entries) => {
      this._width = entries[0].contentRect.width;
    });
    this._resize.observe(this);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._resize?.disconnect();
    window.clearInterval(this._timer);
    this._timer = undefined;
    this._request++;
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("entityId") || changed.has("_day")) {
      this._load();
    }
    if (
      changed.has("playhead") &&
      this.playhead !== undefined &&
      !isSameDay(this._day, this.playhead)
    ) {
      this._day = startOfDay(this.playhead);
    }
  }

  private async _load() {
    if (!this.entityId || !this._api) {
      return;
    }
    const request = ++this._request;
    const start = this._day;
    const end = addDays(start, 1);
    const kinds = cameraEventEntities(
      this.entityId,
      this._entities ?? {},
      this._states ?? {}
    );
    try {
      const [recording, history] = await Promise.all([
        fetchRecordedSegments(this._api, this.entityId, start, end).catch(
          () => undefined
        ),
        kinds.size
          ? fetchDateWS(
              { states: this._states, callWS: this._api.callWS },
              start,
              end,
              [...kinds.keys()]
            )
          : Promise.resolve({}),
      ]);
      if (request !== this._request) {
        return;
      }
      this._recorded = recording?.recorded ?? false;
      this._recordingNow = recording?.recording ?? false;
      this._segments = recording?.segments ?? [];
      this._events = historyToEvents(
        history as Parameters<typeof historyToEvents>[0],
        kinds,
        start.getTime(),
        Math.min(end.getTime(), Date.now())
      );
      this._error = false;
      fireEvent(this, "camera-timeline-segments", { segments: this._segments });
    } catch (_err) {
      if (request === this._request) {
        this._error = true;
      }
    }
  }

  private _window(): [number, number] {
    const dayStart = this._day.getTime();
    const dayEnd = dayStart + 24 * HOUR;
    const span = Number(this._zoom) * HOUR;
    if (span >= 24 * HOUR) {
      return [dayStart, dayEnd];
    }
    const center = this.playhead ?? Math.min(this._now, dayEnd);
    const start = Math.min(
      Math.max(center - span / 2, dayStart),
      dayEnd - span
    );
    return [start, start + span];
  }

  private _visibleEvents = memoizeOne(
    (events: CameraEvent[], hidden: Set<CameraEventKind>) =>
      events.filter((event) => !hidden.has(event.kind))
  );

  private _kindsPresent = memoizeOne((events: CameraEvent[]) =>
    CAMERA_EVENT_KINDS.filter((kind) => events.some((e) => e.kind === kind))
  );

  private _clusters(events: CameraEvent[], start: number, span: number) {
    const clusters: Cluster[] = [];
    // Markers are 28 px wide, so keep groups at least that far apart on narrow tracks
    const minShare = Math.max(
      CLUSTER_SHARE,
      this._width ? 32 / this._width : 0
    );
    for (const event of events) {
      if (event.start < start || event.start > start + span) {
        continue;
      }
      const x = (event.start - start) / span;
      const last = clusters[clusters.length - 1];
      if (last && x - last.x < minShare) {
        last.events.push(event);
      } else {
        clusters.push({ x, events: [event] });
      }
    }
    return clusters;
  }

  private _time(ms: number, seconds = false) {
    const fmt = seconds ? formatTimeWithSeconds : formatTime;
    return fmt(new Date(ms), this._i18n.locale, this._config.config);
  }

  private _dayLabel() {
    const today = startOfDay(new Date());
    if (isSameDay(this._day, today)) {
      return this._localize("ui.components.camera_timeline.today");
    }
    if (isSameDay(this._day, addDays(today, -1))) {
      return this._localize("ui.components.camera_timeline.yesterday");
    }
    return formatDateWeekdayDay(
      this._day,
      this._i18n.locale,
      this._config.config
    );
  }

  private _kindName(event: CameraEvent) {
    return this._localize(`ui.components.camera_timeline.kinds.${event.kind}`);
  }

  private _eventName(event: CameraEvent) {
    const name =
      this._states?.[event.entityId]?.attributes.friendly_name ??
      event.entityId;
    return `${this._kindName(event)} · ${name}`;
  }

  private _duration(event: CameraEvent) {
    const seconds = Math.round((event.end - event.start) / 1000);
    if (seconds < 1) {
      return "";
    }
    if (seconds < 60) {
      return this._localize("ui.components.camera_timeline.seconds", {
        count: seconds,
      });
    }
    return this._localize("ui.components.camera_timeline.minutes", {
      minutes: Math.floor(seconds / 60),
      seconds: seconds % 60,
    });
  }

  protected render() {
    if (!this._localize || !this._i18n || !this._config) {
      return nothing;
    }
    const [start, end] = this._window();
    const span = end - start;
    const pct = (ms: number) =>
      `${Math.min(100, Math.max(0, ((ms - start) / span) * 100))}%`;
    const events = this._visibleEvents(this._events, this._hidden);
    const liveEdge = Math.min(this._now, end);
    const isToday = isSameDay(this._day, this._now);
    const ranges = recordedRanges(this._segments);
    if (isToday && this._recordingNow) {
      // The segment being written is not listed until it is finished
      const last = ranges[ranges.length - 1];
      if (last) {
        last[1] = this._now;
      } else {
        ranges.push([this._now - 60_000, this._now]);
      }
    }
    const head = this.playhead ?? liveEdge;
    const ticks = Array.from({ length: 5 }, (_, i) => start + (span * i) / 4);
    const kinds = this._kindsPresent(this._events);

    return html`
      <div class="bar">
        <ha-icon-button
          .path=${mdiChevronLeft}
          .label=${this._localize("ui.components.camera_timeline.previous_day")}
          @click=${this._previousDay}
        ></ha-icon-button>
        <span class="day">${this._dayLabel()}</span>
        <ha-icon-button
          .path=${mdiChevronRight}
          .label=${this._localize("ui.components.camera_timeline.next_day")}
          .disabled=${isToday}
          @click=${this._nextDay}
        ></ha-icon-button>
        <span class="grow"></span>
        <ha-button-toggle-group
          size="s"
          .buttons=${(["1", "6", "24"] as Zoom[]).map((value) => ({
            value,
            label: this._localize("ui.components.camera_timeline.hours", {
              count: Number(value),
            }),
          }))}
          .active=${this._zoom}
          @value-changed=${this._zoomChanged}
        ></ha-button-toggle-group>
      </div>

      <div
        class="track"
        role="slider"
        tabindex="0"
        aria-label=${this._localize("ui.components.camera_timeline.label")}
        aria-valuemin=${start}
        aria-valuemax=${end}
        aria-valuenow=${head}
        aria-valuetext=${
          this.playhead === undefined
            ? this._localize("ui.components.camera_timeline.live")
            : this._time(head, true)
        }
        @pointerdown=${this._pointerDown}
        @keydown=${this._keyDown}
      >
        <div class="ticks" aria-hidden="true">
          ${ticks.map(
            (t) =>
              html`<span style=${styleMap({ left: pct(t) })}
                >${this._time(t)}</span
              >`
          )}
        </div>
        <div class="band" aria-hidden="true">
          ${
            this._recorded && ranges.length
              ? html`<div
                  class="gap"
                  style=${styleMap({
                    left: pct(ranges[0][0]),
                    width: `calc(${pct(isToday ? liveEdge : ranges[ranges.length - 1][1])} - ${pct(ranges[0][0])})`,
                  })}
                ></div>`
              : nothing
          }
          ${ranges.map(
            ([from, to]) =>
              html`<div
                class="recorded"
                style=${styleMap({
                  left: pct(from),
                  width: `calc(${pct(to)} - ${pct(from)})`,
                })}
              ></div>`
          )}
          ${
            isToday
              ? html`<div
                  class="future"
                  style=${styleMap({ left: pct(liveEdge) })}
                ></div>`
              : nothing
          }
        </div>
        ${this._clusters(events, start, span).map(
          (cluster) =>
            html`<span
              class=${classMap({ marker: true, many: cluster.events.length > 1 })}
              style=${styleMap({
                left: `${cluster.x * 100}%`,
                "--kind-color": `var(--camera-event-${cluster.events[0].kind})`,
              })}
              title=${cluster.events.map((e) => `${this._time(e.start)} ${this._eventName(e)}`).join("\n")}
              aria-hidden="true"
            >
              ${
                cluster.events.length > 1
                  ? cluster.events.length
                  : html`<ha-svg-icon
                      .path=${KIND_ICONS[cluster.events[0].kind]}
                    ></ha-svg-icon>`
              }
            </span>`
        )}
        <span
          class=${classMap({ head: true, live: this.playhead === undefined })}
          style=${styleMap({ left: pct(head) })}
          aria-hidden="true"
        ></span>
      </div>

      <div class="legend">
        ${
          this._recorded
            ? html`<span
                  ><i class="swatch recorded"></i>${this._localize(
                    "ui.components.camera_timeline.recorded"
                  )}</span
                ><span
                  ><i class="swatch gap"></i>${this._localize(
                    "ui.components.camera_timeline.not_recorded"
                  )}</span
                >${
                  this._config.user?.is_admin
                    ? html`<a href="/config/camera_recording"
                        >${this._localize(
                          "ui.components.camera_timeline.settings"
                        )}</a
                      >`
                    : nothing
                }`
            : html`<span class="hint"
                >${this._localize("ui.components.camera_timeline.not_set_up")}
                <a href="/config/integrations/integration/camera_recording"
                  >${this._localize("ui.components.camera_timeline.set_up")}</a
                ></span
              >`
        }
        <span class="grow"></span>
        ${
          this.playhead !== undefined
            ? html`<ha-button size="small" @click=${this._goLive}
                >${this._localize("ui.components.camera_timeline.back_to_live")}</ha-button
              >`
            : nothing
        }
      </div>

      ${
        kinds.length
          ? html`<div
              class="filters"
              role="group"
              aria-label=${this._localize("ui.components.camera_timeline.filter")}
            >
              ${kinds.map(
                (kind) =>
                  html`<ha-filter-chip
                    .label=${this._localize(`ui.components.camera_timeline.kinds.${kind}`)}
                    .selected=${!this._hidden.has(kind)}
                    .kind=${kind}
                    @click=${this._toggleKind}
                  ></ha-filter-chip>`
              )}
            </div>`
          : nothing
      }
      ${
        this._error
          ? html`<p class="hint">
              ${this._localize("ui.components.camera_timeline.load_failed")}
            </p>`
          : nothing
      }

      <ul class="events">
        ${
          events.length === 0
            ? html`<li class="hint">
                ${this._localize("ui.components.camera_timeline.no_events")}
              </li>`
            : [...events].reverse().map(
                (event) => html`
                  <li
                    class=${classMap({
                      current:
                        this.playhead !== undefined &&
                        this.playhead >= event.start - 5000 &&
                        this.playhead <=
                          Math.max(event.end, event.start + 10000),
                    })}
                  >
                    <span
                      class="kind"
                      style=${styleMap({
                        "--kind-color": `var(--camera-event-${event.kind})`,
                      })}
                      ><ha-svg-icon
                        .path=${KIND_ICONS[event.kind]}
                      ></ha-svg-icon
                    ></span>
                    <span class="text">
                      <b>${this._kindName(event)}</b>
                      <span
                        >${[
                          this._time(event.start),
                          this._duration(event),
                          this._states?.[event.entityId]?.attributes
                            .friendly_name ?? event.entityId,
                        ]
                          .filter(Boolean)
                          .join(" · ")}</span
                      >
                    </span>
                    <ha-button
                      size="small"
                      appearance="filled"
                      variant="brand"
                      .disabled=${!this._recorded}
                      .event=${event}
                      @click=${this._playEvent}
                    >
                      <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
                      ${this._localize("ui.components.camera_timeline.play")}
                    </ha-button>
                  </li>
                `
              )
        }
      </ul>
    `;
  }

  private _previousDay() {
    this._day = addDays(this._day, -1);
  }

  private _nextDay() {
    this._day = addDays(this._day, 1);
  }

  private _zoomChanged(ev: CustomEvent<{ value: Zoom }>) {
    this._zoom = ev.detail.value;
  }

  private _toggleKind(ev: Event) {
    const kind = (ev.currentTarget as HTMLElement & { kind: CameraEventKind })
      .kind;
    const hidden = new Set(this._hidden);
    if (hidden.has(kind)) {
      hidden.delete(kind);
    } else {
      hidden.add(kind);
    }
    this._hidden = hidden;
  }

  private _seek(time: number) {
    const [start, end] = this._window();
    const clamped = Math.min(Math.max(time, start), Math.min(end, Date.now()));
    const lastEnd = Math.max(0, ...this._segments.map((seg) => seg.end * 1000));
    // Moments in the segment still being written are closest to live
    const beingWritten = this._recordingNow && clamped >= lastEnd;
    if (
      isSameDay(this._day, Date.now()) &&
      (Date.now() - clamped < STEP_MS || beingWritten)
    ) {
      this._goLive();
      return;
    }
    fireEvent(this, "camera-timeline-seek", {
      time: clamped,
      segments: this._segments,
    });
  }

  private _goLive() {
    fireEvent(this, "camera-timeline-live", undefined);
  }

  private _playEvent(ev: Event) {
    const event = (ev.currentTarget as HTMLElement & { event: CameraEvent })
      .event;
    this._seek(event.start - 5000);
  }

  private _timeFromPointer(ev: PointerEvent) {
    const track = ev.currentTarget as HTMLElement;
    const box = track.getBoundingClientRect();
    let share = (ev.clientX - box.left) / box.width;
    if (getComputedStyle(track).direction === "rtl") {
      share = 1 - share;
    }
    const [start, end] = this._window();
    return start + share * (end - start);
  }

  private _pointerDown(ev: PointerEvent) {
    if (ev.button !== 0) {
      return;
    }
    const track = ev.currentTarget as HTMLElement;
    track.setPointerCapture(ev.pointerId);
    const up = (upEv: PointerEvent) => {
      track.removeEventListener("pointerup", up);
      track.removeEventListener("pointercancel", up);
      if (upEv.type === "pointerup") {
        this._seek(this._timeFromPointer(upEv));
      }
    };
    track.addEventListener("pointerup", up);
    track.addEventListener("pointercancel", up);
  }

  private _keyDown(ev: KeyboardEvent) {
    const head = this.playhead ?? Date.now();
    const events = this._visibleEvents(this._events, this._hidden);
    let target: number | undefined;
    switch (ev.key) {
      case "ArrowLeft":
      case "ArrowDown":
        target = head - STEP_MS;
        break;
      case "ArrowRight":
      case "ArrowUp":
        target = head + STEP_MS;
        break;
      case "PageUp":
        target = [...events]
          .reverse()
          .find((e) => e.start < head - 6000)?.start;
        break;
      case "PageDown":
        target = events.find((e) => e.start > head)?.start;
        break;
      case "Home":
        target = this._window()[0];
        break;
      case "End":
        this._goLive();
        ev.preventDefault();
        return;
      default:
        return;
    }
    ev.preventDefault();
    if (target !== undefined) {
      this._seek(target);
    }
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      --camera-event-motion: var(--orange-color, #ff9800);
      --camera-event-person: var(--blue-color, #2196f3);
      --camera-event-vehicle: var(--teal-color, #009688);
      --camera-event-animal: var(--brown-color, #795548);
      --camera-event-doorbell: var(--purple-color, #926bc7);
      --camera-event-sound: var(--green-color, #4caf50);
    }
    .bar,
    .legend {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      flex-wrap: wrap;
    }
    .day {
      font-weight: var(--ha-font-weight-medium);
      min-width: 6em;
      text-align: center;
    }
    .grow {
      flex: 1;
    }
    .track {
      position: relative;
      height: 88px;
      margin: 0 var(--ha-space-4);
      cursor: pointer;
      touch-action: none;
      border-radius: var(--ha-border-radius-md);
      outline: none;
    }
    .track:focus-visible {
      box-shadow: 0 0 0 2px var(--primary-color);
    }
    .ticks span {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      font-size: var(--ha-font-size-xs);
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .ticks span:first-child {
      transform: none;
    }
    .ticks span:last-child {
      transform: translateX(-100%);
    }
    .band {
      position: absolute;
      inset-inline: 0;
      top: 58px;
      height: 12px;
      border-radius: 6px;
      background: var(--secondary-background-color);
      overflow: hidden;
    }
    .band > div {
      position: absolute;
      top: 0;
      bottom: 0;
    }
    .recorded {
      background: color-mix(
        in srgb,
        var(--success-color) 60%,
        var(--card-background-color, #fff)
      );
    }
    .gap {
      background: repeating-linear-gradient(
        45deg,
        transparent 0 5px,
        var(--error-color) 5px 7px
      );
      opacity: 0.6;
    }
    .future {
      right: 0;
      background: var(--secondary-background-color);
    }
    .marker {
      position: absolute;
      top: 22px;
      width: 28px;
      height: 28px;
      margin-inline-start: -14px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--kind-color);
      color: var(--text-primary-color, #fff);
      box-shadow: 0 0 0 2px var(--card-background-color, #fff);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-bold);
      --mdc-icon-size: 16px;
    }
    .head {
      position: absolute;
      top: 18px;
      bottom: 6px;
      width: 3px;
      margin-inline-start: -1.5px;
      border-radius: 2px;
      background: var(--primary-text-color);
      pointer-events: none;
    }
    .head.live {
      background: var(--error-color);
    }
    .legend {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .swatch {
      display: inline-block;
      width: 18px;
      height: 10px;
      border-radius: 5px;
    }
    .swatch.recorded {
      background: color-mix(
        in srgb,
        var(--success-color) 60%,
        var(--card-background-color, #fff)
      );
    }
    .swatch.gap {
      background: repeating-linear-gradient(
        45deg,
        transparent 0 3px,
        var(--error-color) 3px 5px
      );
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .events {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .events li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
    }
    .events li.current {
      background: var(
        --ha-color-fill-primary-quiet-resting,
        rgba(3, 169, 244, 0.12)
      );
    }
    .kind {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg);
      display: grid;
      place-items: center;
      background: var(--kind-color);
      color: var(--text-primary-color, #fff);
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .text b {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .text span {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-timeline": HaCameraTimeline;
  }
}
