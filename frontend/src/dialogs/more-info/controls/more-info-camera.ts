import type { ContextType } from "@lit/context";
import {
  mdiDownload,
  mdiFastForward10,
  mdiMicrophone,
  mdiMicrophoneOff,
  mdiPause,
  mdiPlay,
  mdiRewind10,
} from "@mdi/js";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { watchAudioLevel } from "../../../common/audio/watch-audio-level";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-camera-stream";
import "../../../components/ha-camera-timeline";
import "../../../components/ha-icon-button";
import type {
  CameraStreamType,
  HaCameraStream,
} from "../../../components/ha-camera-stream";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tooltip";
import type { WebRtcMicrophoneState } from "../../../components/ha-web-rtc-player";
import { getSignedPath } from "../../../data/auth";
import { STREAM_TYPE_WEB_RTC, type CameraEntity } from "../../../data/camera";
import {
  segmentAfter,
  segmentAt,
  segmentPath,
  type RecordedSegment,
} from "../../../data/camera_recording";
import { apiContext, configContext } from "../../../data/context";
import { UNAVAILABLE } from "../../../data/entity/entity";
import {
  canAppStreamMicrophone,
  isWebRtcStreamErrorCode,
  startAppMicrophoneStream,
  stopAppMicrophoneStream,
  subscribeAppStreamStopped,
} from "../../../external_app/camera_microphone_stream";
import type {
  EMError,
  WebRtcStreamStopped,
} from "../../../external_app/external_messaging";
import { showToast } from "../../../util/toast";

@customElement("more-info-camera")
class MoreInfoCamera extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @consume({ context: apiContext })
  private _api!: ContextType<typeof apiContext>;

  @property({ attribute: false }) public stateObj?: CameraEntity;

  /** The recorded moment being played, in milliseconds; undefined while live */
  @state() private _playhead?: number;

  @state() private _playing?: { segment: RecordedSegment; url: string };

  @state() private _paused = false;

  @state() private _rate = "1";

  private _segments: RecordedSegment[] = [];

  private _seekTo?: number;

  private _seekRequest = 0;

  @query("video.recording") private _video?: HTMLVideoElement;

  @state() private _attached = false;

  @state() private _microphoneState: WebRtcMicrophoneState = "off";

  @state() private _streamType?: CameraStreamType;

  @state() private _supportsTwoWayAudio = false;

  @query("ha-camera-stream") private _cameraStream?: HaCameraStream;

  @query(".microphone-meter") private _microphoneMeter?: HTMLElement;

  private _stopAudioLevel?: () => void;

  private _appMicrophoneSession?: string;

  // Increased on every start and stop, so replies to older starts are ignored
  private _appMicrophoneRequest = 0;

  private _unsubAppStreamStopped?: () => void;

  public connectedCallback() {
    super.connectedCallback();
    this._attached = true;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._attached = false;
    this._stopMicrophoneMeter();
    this._resetMicrophone();
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    const oldStateObj = changedProps.get("stateObj");
    if (oldStateObj && oldStateObj.entity_id !== this.stateObj?.entity_id) {
      this._resetMicrophone();
      this._goLive();
    }
  }

  // A removed player can't fire microphone-changed anymore, so reset it here
  private _resetMicrophone() {
    this._stopAppMicrophone();
    this._microphoneState = "off";
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("_microphoneState")) {
      this._stopMicrophoneMeter();
      const track = this._cameraStream?.microphoneTrack;
      if (this._microphoneState === "on" && track) {
        // Set as CSS variable instead of state, to not re-render every frame
        this._stopAudioLevel = watchAudioLevel(track, (level) => {
          this._microphoneMeter?.style.setProperty(
            "--microphone-level",
            String(level)
          );
        });
      }
    }
  }

  private _stopMicrophoneMeter() {
    this._stopAudioLevel?.();
    this._stopAudioLevel = undefined;
    this._microphoneMeter?.style.removeProperty("--microphone-level");
  }

  protected render() {
    if (!this._attached || !this.stateObj) {
      return nothing;
    }

    return html`
      <div class="video">
        ${
          this._playing
            ? html`<video
                  class="recording"
                  .src=${this._playing.url}
                  autoplay
                  playsinline
                  muted
                  .playbackRate=${Number(this._rate)}
                  @loadedmetadata=${this._recordingLoaded}
                  @timeupdate=${this._recordingTime}
                  @ended=${this._recordingEnded}
                  @pause=${this._recordingPaused}
                  @play=${this._recordingPaused}
                ></video>
                <span class="recorded-chip">
                  ${this._localize("ui.components.camera_timeline.recorded")}
                </span>`
            : html`<ha-camera-stream
                  .stateObj=${this.stateObj}
                  allow-exoplayer
                  controls
                  @microphone-changed=${this._microphoneChanged}
                  @stream-type-changed=${this._streamTypeChanged}
                  @camera-capabilities-changed=${this._capabilitiesChanged}
                ></ha-camera-stream>
                ${
                  this.stateObj.state === "streaming"
                    ? html`<span class="live-chip">
                        ${this._localize("ui.dialogs.more_info_control.camera.live")}
                      </span>`
                    : nothing
                }`
        }
      </div>
      ${this._playing ? this._renderPlaybackControls() : nothing}
      ${
        this._supportsTwoWayAudio && !this._playing
          ? this._renderMicrophoneButton()
          : nothing
      }
      <ha-camera-timeline
        .entityId=${this.stateObj.entity_id}
        .playhead=${this._playhead}
        @camera-timeline-seek=${this._timelineSeek}
        @camera-timeline-live=${this._goLive}
        @camera-timeline-segments=${this._timelineSegments}
      ></ha-camera-timeline>
    `;
  }

  private _renderPlaybackControls() {
    return html`
      <div class="playback">
        <ha-icon-button
          .path=${mdiRewind10}
          .label=${this._localize("ui.components.camera_timeline.back_10")}
          @click=${this._back10}
        ></ha-icon-button>
        <ha-icon-button
          .path=${this._paused ? mdiPlay : mdiPause}
          .label=${this._localize(
            `ui.components.camera_timeline.${this._paused ? "play" : "pause"}`
          )}
          @click=${this._togglePause}
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiFastForward10}
          .label=${this._localize("ui.components.camera_timeline.forward_10")}
          @click=${this._forward10}
        ></ha-icon-button>
        <span class="grow"></span>
        <ha-button-toggle-group
          size="s"
          .buttons=${["1", "2", "4"].map((value) => ({
            value,
            label: `${value}×`,
          }))}
          .active=${this._rate}
          @value-changed=${this._rateChanged}
        ></ha-button-toggle-group>
        <ha-icon-button
          .path=${mdiDownload}
          .label=${this._localize("ui.components.camera_timeline.download")}
          .href=${this._playing!.url}
          .download=${this._playing!.segment.name}
        ></ha-icon-button>
      </div>
    `;
  }

  private _timelineSegments(
    ev: HASSDomEvent<HASSDomEvents["camera-timeline-segments"]>
  ) {
    this._segments = ev.detail.segments;
  }

  private _timelineSeek(
    ev: HASSDomEvent<HASSDomEvents["camera-timeline-seek"]>
  ) {
    this._segments = ev.detail.segments;
    this._playAt(ev.detail.time);
  }

  private async _playAt(time: number) {
    const segment =
      segmentAt(this._segments, time) ?? segmentAfter(this._segments, time);
    if (!segment || !this.stateObj) {
      showToast(this, {
        message: this._localize(
          "ui.components.camera_timeline.not_recorded_here"
        ),
      });
      return;
    }
    const at = Math.max(time, segment.start * 1000);
    this._playhead = at;
    if (this._playing?.segment.name === segment.name && this._video) {
      this._video.currentTime = (at - segment.start * 1000) / 1000;
      return;
    }
    const request = ++this._seekRequest;
    try {
      const signed = await getSignedPath(
        this._api,
        segmentPath(this.stateObj.entity_id, segment)
      );
      if (request !== this._seekRequest) {
        return;
      }
      this._seekTo = (at - segment.start * 1000) / 1000;
      this._paused = false;
      this._playing = { segment, url: signed.path };
    } catch (_err) {
      showToast(this, {
        message: this._localize("ui.components.camera_timeline.play_failed"),
      });
    }
  }

  private _goLive() {
    this._seekRequest++;
    this._playing = undefined;
    this._playhead = undefined;
    this._seekTo = undefined;
  }

  private _recordingLoaded(ev: Event) {
    const video = ev.currentTarget as HTMLVideoElement;
    video.playbackRate = Number(this._rate);
    if (this._seekTo !== undefined) {
      video.currentTime = this._seekTo;
      this._seekTo = undefined;
    }
  }

  private _recordingTime(ev: Event) {
    const video = ev.currentTarget as HTMLVideoElement;
    if (this._playing) {
      this._playhead =
        this._playing.segment.start * 1000 + video.currentTime * 1000;
    }
  }

  private _recordingPaused(ev: Event) {
    this._paused = (ev.currentTarget as HTMLVideoElement).paused;
  }

  private _recordingEnded() {
    if (!this._playing) {
      return;
    }
    const next = segmentAfter(
      this._segments,
      this._playing.segment.start * 1000
    );
    if (next) {
      this._playAt(next.start * 1000);
    } else {
      this._goLive();
    }
  }

  private _back10() {
    if (this._playhead !== undefined) {
      this._playAt(this._playhead - 10_000);
    }
  }

  private _forward10() {
    if (this._playhead !== undefined) {
      this._playAt(this._playhead + 10_000);
    }
  }

  private _togglePause() {
    const video = this._video;
    if (!video) {
      return;
    }
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }

  private _rateChanged(ev: CustomEvent<{ value: string }>) {
    this._rate = ev.detail.value;
  }

  /**
   * Browsers only allow microphone access in a secure context (HTTPS). Without
   * it, an app can send the microphone itself in a separate stream, while the
   * video stream keeps running in the frontend.
   */
  private get _useAppMicrophone(): boolean {
    return (
      !window.isSecureContext &&
      canAppStreamMicrophone(this._config?.auth.external)
    );
  }

  private _microphoneDisabledReason(): string | undefined {
    if (!window.isSecureContext && !this._useAppMicrophone) {
      return this._localize(
        "ui.dialogs.more_info_control.camera.microphone_not_secure"
      );
    }
    if (this._streamType !== STREAM_TYPE_WEB_RTC) {
      return this._localize(
        "ui.dialogs.more_info_control.camera.microphone_webrtc_only"
      );
    }
    if (this._microphoneState === "denied") {
      return this._localize(
        "ui.dialogs.more_info_control.camera.microphone_denied"
      );
    }
    return undefined;
  }

  private _renderMicrophoneButton() {
    const disabledReason = this._microphoneDisabledReason();

    const microphoneOn =
      this._microphoneState === "on" || this._microphoneState === "connecting";

    // Stopping is always possible, so the microphone is never stuck on
    const disabled =
      !microphoneOn &&
      (disabledReason !== undefined || this.stateObj!.state === UNAVAILABLE);

    const button = html`
      <ha-button
        .appearance=${microphoneOn ? "accent" : "filled"}
        .disabled=${disabled}
        @click=${this._toggleMicrophone}
      >
        ${
          this._microphoneState === "connecting"
            ? html`<ha-spinner slot="start" size="tiny"></ha-spinner>`
            : html`<ha-svg-icon
                slot="start"
                .path=${microphoneOn ? mdiMicrophone : mdiMicrophoneOff}
              ></ha-svg-icon>`
        }
        ${this._localize(`ui.dialogs.more_info_control.camera.${microphoneOn ? "stop_talking" : "start_talking"}`)}
      </ha-button>
    `;

    return html`
      <div class="buttons">
        <div
          id="microphone-button"
          class="microphone-meter"
          tabindex=${ifDefined(disabled && disabledReason ? "0" : undefined)}
        >
          ${
            this._microphoneState === "on"
              ? html`<span class="microphone-waves"></span>`
              : nothing
          }
          ${button}
        </div>
        ${
          disabled && disabledReason
            ? html`<ha-tooltip for="microphone-button"
                >${disabledReason}</ha-tooltip
              >`
            : nothing
        }
      </div>
    `;
  }

  private _toggleMicrophone() {
    if (this._useAppMicrophone) {
      this._toggleAppMicrophone();
      return;
    }
    this._cameraStream?.toggleMicrophone();
  }

  private async _toggleAppMicrophone() {
    // Stops a connected session, or cancels one the app is connecting
    if (this._appMicrophoneSession || this._microphoneState === "connecting") {
      this._stopAppMicrophone();
      return;
    }
    const request = ++this._appMicrophoneRequest;
    this._microphoneState = "connecting";
    try {
      const sessionId = await startAppMicrophoneStream(
        this._config.auth.external!,
        this.stateObj!.entity_id
      );
      // Cancelled, closed or replaced while the app was connecting
      if (request !== this._appMicrophoneRequest) {
        stopAppMicrophoneStream(this._config.auth.external!, sessionId);
        return;
      }
      this._appMicrophoneSession = sessionId;
      // Only connected sessions can be stopped by the app
      this._unsubAppStreamStopped = subscribeAppStreamStopped(
        this._appStreamStopped
      );
      this._microphoneState = "on";
    } catch (err: unknown) {
      if (request !== this._appMicrophoneRequest) {
        return;
      }
      this._microphoneState = "off";
      showToast(this, { message: this._appErrorMessage(err as EMError) });
    }
  }

  private _appErrorMessage({ code, message }: EMError): string {
    if (code === "unknown" || !isWebRtcStreamErrorCode(code)) {
      return this._localize(
        "ui.dialogs.more_info_control.camera.app_microphone_error.unknown",
        { message }
      );
    }
    return this._localize(
      `ui.dialogs.more_info_control.camera.app_microphone_error.${code}`
    );
  }

  private _stopAppMicrophone() {
    this._appMicrophoneRequest++;
    if (this._appMicrophoneSession) {
      stopAppMicrophoneStream(
        this._config.auth.external!,
        this._appMicrophoneSession
      );
      this._clearAppMicrophoneSession();
    }
    if (this._useAppMicrophone) {
      this._microphoneState = "off";
    }
  }

  private _clearAppMicrophoneSession() {
    this._appMicrophoneSession = undefined;
    this._unsubAppStreamStopped?.();
    this._unsubAppStreamStopped = undefined;
  }

  private _appStreamStopped = (stopped: WebRtcStreamStopped) => {
    if (stopped.session_id !== this._appMicrophoneSession) {
      return;
    }
    this._clearAppMicrophoneSession();
    this._microphoneState = "off";
    if (stopped.code === "interrupted") {
      return;
    }
    showToast(this, { message: this._appErrorMessage(stopped) });
  };

  private _streamTypeChanged(
    ev: HASSDomEvent<HASSDomEvents["stream-type-changed"]>
  ) {
    this._streamType = ev.detail.type;
  }

  private _capabilitiesChanged(
    ev: HASSDomEvent<HASSDomEvents["camera-capabilities-changed"]>
  ) {
    this._supportsTwoWayAudio = ev.detail.capabilities?.two_way_audio ?? false;
  }

  private _microphoneChanged(
    ev: HASSDomEvent<HASSDomEvents["microphone-changed"]>
  ) {
    if (this._useAppMicrophone) {
      return;
    }
    this._microphoneState = ev.detail.state;
  }

  static styles = css`
    :host {
      display: block;
    }

    .video {
      position: relative;
      border-radius: var(--ha-border-radius-3xl);
      overflow: hidden;
    }

    video.recording {
      display: block;
      width: 100%;
      max-height: var(--video-max-height, calc(100vh - 97px));
      background: #000;
    }

    .recorded-chip {
      position: absolute;
      top: var(--ha-space-3);
      inset-inline-start: var(--ha-space-3);
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      pointer-events: none;
    }

    .playback {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2) 0;
    }

    .grow {
      flex: 1;
    }

    ha-camera-timeline {
      margin-top: var(--ha-space-4);
    }

    .live-chip {
      position: absolute;
      top: var(--ha-space-3);
      inset-inline-start: var(--ha-space-3);
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      background: var(--error-color);
      color: var(--text-primary-color, #fff);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      pointer-events: none;
    }

    .buttons {
      display: flex;
      justify-content: center;
      padding: var(--ha-space-4);
    }

    .microphone-meter {
      position: relative;
      isolation: isolate;
    }

    ha-spinner {
      --ha-spinner-indicator-color: currentColor;
    }

    .microphone-waves {
      position: absolute;
      inset: 0;
      z-index: -1;
      opacity: var(--microphone-level, 0);
      transition: opacity 150ms linear;
    }

    .microphone-waves::before,
    .microphone-waves::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-primary-loud-resting);
      animation: microphone-wave 1.4s ease-out infinite;
    }

    .microphone-waves::after {
      animation-delay: 0.7s;
    }

    @keyframes microphone-wave {
      from {
        transform: scale(1);
        opacity: 0.4;
      }
      to {
        transform: scale(1.15, 1.6);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .microphone-waves::before,
      .microphone-waves::after {
        animation: none;
        transform: scale(1.08, 1.3);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-camera": MoreInfoCamera;
  }
}
