import type { ContextType } from "@lit/context";
import { STATE_RUNNING } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { supportsFeature } from "../common/entity/supports-feature";
import {
  CameraEntityFeature,
  computeMJPEGStreamUrl,
  fetchCameraCapabilities,
  fetchThumbnailUrlWithCache,
  STREAM_TYPE_HLS,
  STREAM_TYPE_WEB_RTC,
  type CameraCapabilities,
  type CameraEntity,
  type StreamType,
} from "../data/camera";
import {
  apiContext,
  configContext,
  connectionContext,
  formattersContext,
} from "../data/context";
import { formatLastSeen } from "../data/camera-live-session";
import type { LocalizeFunc } from "../common/translations/localize";
import "./ha-hls-player";
import "./ha-web-rtc-player";
import type { HaWebRtcPlayer } from "./ha-web-rtc-player";

const MJPEG_STREAM = "mjpeg";

export type CameraStreamType = StreamType | typeof MJPEG_STREAM;

interface Stream {
  type: CameraStreamType;
  visible: boolean;
}

@customElement("ha-camera-stream")
export class HaCameraStream extends LitElement {
  @state()
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection!: ContextType<typeof connectionContext>;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters?: ContextType<typeof formattersContext>;

  @property({ attribute: false }) public stateObj?: CameraEntity;

  @property({ attribute: false }) public aspectRatio?: number;

  @property({ attribute: false }) public fitMode?: "cover" | "contain" | "fill";

  @property({ type: Boolean, attribute: "controls" })
  public controls = false;

  @property({ type: Boolean, attribute: "muted" })
  public muted = false;

  @property({ type: Boolean, attribute: "allow-exoplayer" })
  public allowExoPlayer = false;

  /**
   * Show a still until it is tapped, for a camera that only offers live video
   * through its provider. Every view of such a camera uses part of the
   * provider's small allowance, so dashboards must not start them by themselves.
   */
  @property({ type: Boolean, attribute: "tap-to-start" })
  public tapToStart = false;

  // Video background image before its loaded
  @state() private _posterUrl?: string;

  @state() private _connected = false;

  @state() private _capabilities?: CameraCapabilities;

  @state() private _hlsStreams?: { hasAudio: boolean; hasVideo: boolean };

  @state() private _webRtcStreams?: { hasAudio: boolean; hasVideo: boolean };

  @query("ha-web-rtc-player") private _webRtcPlayer?: HaWebRtcPlayer;

  private _visibleStreamType?: Stream["type"];

  private _thumbnailApi = memoizeOne(
    (
      api: ContextType<typeof apiContext>,
      connection: ContextType<typeof connectionContext>
    ) => ({
      callWS: api.callWS,
      hassUrl: connection.hassUrl,
    })
  );

  public willUpdate(changedProps: PropertyValues): void {
    const entityChanged =
      changedProps.has("stateObj") &&
      this.stateObj &&
      (changedProps.get("stateObj") as CameraEntity | undefined)?.entity_id !==
        this.stateObj.entity_id;

    const oldConfig = changedProps.get("_config") as
      ContextType<typeof configContext> | undefined;
    const backendStarted =
      changedProps.has("_config") &&
      this._config &&
      this.stateObj &&
      oldConfig &&
      this._config.config.state === STATE_RUNNING &&
      oldConfig.config?.state !== STATE_RUNNING;

    if (entityChanged || backendStarted) {
      this._getCapabilities();
      this._getPosterUrl();
    }
  }

  /** The microphone track sent to the camera, only on WebRTC streams. */
  public get microphoneTrack(): MediaStreamTrack | undefined {
    return this._webRtcPlayer?.microphoneTrack;
  }

  /** Toggles sending the microphone to the camera, only on WebRTC streams. */
  public async toggleMicrophone() {
    await this._webRtcPlayer?.toggleMicrophone();
  }

  public connectedCallback() {
    super.connectedCallback();
    this._connected = true;
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._connected = false;
  }

  protected updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);
    if ((changedProps as PropertyValues).has("_capabilities")) {
      fireEvent(this, "camera-capabilities-changed", {
        capabilities: this._capabilities,
      });
    }
    const visibleStreamType = this._currentStreams().find(
      (stream) => stream.visible
    )?.type;
    if (visibleStreamType !== this._visibleStreamType) {
      this._visibleStreamType = visibleStreamType;
      fireEvent(this, "stream-type-changed", { type: visibleStreamType });
    }
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }
    const streams = this._currentStreams();
    if (
      this.stateObj.state === "unavailable" &&
      !streams.some((stream) => stream.type === STREAM_TYPE_WEB_RTC)
    ) {
      return this._renderOffline();
    }
    return html`${repeat(
      streams,
      (stream) => stream.type + this.stateObj!.entity_id,
      (stream) => this._renderStream(stream)
    )}`;
  }

  // Any camera that cannot report says so inside its picture area, not as
  // a black rectangle
  private _renderOffline() {
    const l = (key: string, values?: Record<string, string | number>) =>
      this._localize(
        `ui.components.web-rtc-player.state.${key}` as "ui.components.web-rtc-player.state.offline_title",
        values
      );
    const time = formatLastSeen(this.stateObj!.last_changed);
    return html`<div
      class="offline"
      role="group"
      style=${styleMap({ aspectRatio: this.aspectRatio ?? 16 / 9 })}
    >
      <div class="message">
        <b>${l("offline_title")}</b>
        <span
          >${
            time
              ? `${l("offline_last_seen", { time })} ${l("offline_text")}`
              : l("offline_text")
          }</span
        >
      </div>
    </div>`;
  }

  private _renderStream(stream: Stream) {
    if (!this.stateObj) {
      return nothing;
    }
    if (stream.type === MJPEG_STREAM) {
      const streamUrl = __DEMO__
        ? this.stateObj.attributes.entity_picture
        : this._connected
          ? computeMJPEGStreamUrl(this.stateObj)
          : this._posterUrl;
      if (!streamUrl) {
        return nothing;
      }
      return html`<img
        .src=${streamUrl}
        style=${styleMap({
          aspectRatio: this.aspectRatio,
          objectFit: this.fitMode,
        })}
        alt=${`Preview of the ${this._formatters?.formatEntityName(this.stateObj) ?? ""} camera.`}
        @load=${this._handleImageLoad}
      />`;
    }

    if (stream.type === STREAM_TYPE_HLS) {
      return html`<ha-hls-player
        autoplay
        playsinline
        .allowExoPlayer=${this.allowExoPlayer}
        .muted=${this.muted}
        .controls=${this.controls}
        .entityid=${this.stateObj.entity_id}
        .posterUrl=${this._posterUrl}
        @streams=${this._handleHlsStreams}
        class=${stream.visible ? "" : "hidden"}
        .aspectRatio=${this.aspectRatio}
        .fitMode=${this.fitMode}
      ></ha-hls-player>`;
    }

    if (stream.type === STREAM_TYPE_WEB_RTC) {
      return html`<ha-web-rtc-player
        autoplay
        playsinline
        .muted=${this.muted}
        .controls=${this.controls}
        .entityid=${this.stateObj.entity_id}
        .entityState=${this.stateObj.state}
        .lastSeen=${this.stateObj.last_changed}
        .tapToStart=${this.tapToStart && this._providerOnly}
        .posterUrl=${this._posterUrl}
        @streams=${this._handleWebRtcStreams}
        class=${stream.visible ? "" : "hidden"}
        .aspectRatio=${this.aspectRatio}
        .fitMode=${this.fitMode}
      ></ha-web-rtc-player>`;
    }

    return nothing;
  }

  private get _providerOnly(): boolean {
    const types = this._capabilities?.frontend_stream_types;
    return types?.length === 1 && types[0] === STREAM_TYPE_WEB_RTC;
  }

  private _currentStreams() {
    return this._streams(
      this._capabilities?.frontend_stream_types,
      this._hlsStreams,
      this._webRtcStreams,
      this.muted
    );
  }

  private async _getCapabilities() {
    this._capabilities = undefined;
    this._hlsStreams = undefined;
    this._webRtcStreams = undefined;
    if (!supportsFeature(this.stateObj!, CameraEntityFeature.STREAM)) {
      this._capabilities = {
        frontend_stream_types: [],
        two_way_audio: false,
      };
      return;
    }
    this._capabilities = await fetchCameraCapabilities(
      this._api,
      this.stateObj!.entity_id
    );
  }

  private async _getPosterUrl(): Promise<void> {
    try {
      this._posterUrl = await fetchThumbnailUrlWithCache(
        this._thumbnailApi(this._api, this._connection),
        this.stateObj!.entity_id,
        this.clientWidth,
        this.clientHeight
      );
    } catch (_err: any) {
      // poster url is optional
      this._posterUrl = undefined;
    }
  }

  private _handleImageLoad() {
    fireEvent(this, "load");
  }

  private _handleHlsStreams(ev: CustomEvent) {
    this._hlsStreams = ev.detail;
  }

  private _handleWebRtcStreams(ev: CustomEvent) {
    this._webRtcStreams = ev.detail;
  }

  private _streams = memoizeOne(
    (
      supportedTypes?: StreamType[],
      hlsStreams?: { hasAudio: boolean; hasVideo: boolean },
      webRtcStreams?: { hasAudio: boolean; hasVideo: boolean },
      muted?: boolean
    ): Stream[] => {
      if (__DEMO__) {
        return [{ type: MJPEG_STREAM, visible: true }];
      }
      if (!supportedTypes) {
        return [];
      }
      if (supportedTypes.length === 0) {
        // doesn't support any stream type, fallback to mjpeg
        return [{ type: MJPEG_STREAM, visible: true }];
      }
      if (supportedTypes.length === 1) {
        // only 1 stream type, no need to choose
        if (
          (supportedTypes[0] === STREAM_TYPE_HLS &&
            hlsStreams?.hasVideo === false) ||
          (supportedTypes[0] === STREAM_TYPE_WEB_RTC &&
            webRtcStreams?.hasVideo === false)
        ) {
          // stream failed to load, fallback to mjpeg
          return [{ type: MJPEG_STREAM, visible: true }];
        }
        return [{ type: supportedTypes[0], visible: true }];
      }
      if (hlsStreams && webRtcStreams) {
        // fully loaded
        if (
          hlsStreams.hasVideo &&
          hlsStreams.hasAudio &&
          !webRtcStreams.hasAudio &&
          !muted
        ) {
          // webRTC stream is missing audio and audio is not muted, use HLS
          return [{ type: STREAM_TYPE_HLS, visible: true }];
        }
        if (webRtcStreams.hasVideo) {
          return [{ type: STREAM_TYPE_WEB_RTC, visible: true }];
        }
        // both streams failed to load, fallback to mjpeg
        return [{ type: MJPEG_STREAM, visible: true }];
      }

      if (hlsStreams?.hasVideo !== webRtcStreams?.hasVideo) {
        // one of the two streams is loaded, or errored
        // choose the one that has video or is still loading
        if (hlsStreams?.hasVideo) {
          return [
            { type: STREAM_TYPE_HLS, visible: true },
            { type: STREAM_TYPE_WEB_RTC, visible: false },
          ];
        }
        if (hlsStreams?.hasVideo === false) {
          return [{ type: STREAM_TYPE_WEB_RTC, visible: true }];
        }
        if (webRtcStreams?.hasVideo) {
          return [
            { type: STREAM_TYPE_WEB_RTC, visible: true },
            { type: STREAM_TYPE_HLS, visible: false },
          ];
        }
        if (webRtcStreams?.hasVideo === false) {
          return [{ type: STREAM_TYPE_HLS, visible: true }];
        }
      }

      return [
        { type: STREAM_TYPE_HLS, visible: true },
        { type: STREAM_TYPE_WEB_RTC, visible: false },
      ];
    }
  );

  static styles = css`
    :host,
    img {
      display: block;
    }

    img {
      width: 100%;
    }

    ha-web-rtc-player {
      width: 100%;
      height: 100%;
    }

    ha-hls-player {
      width: 100%;
      height: 100%;
    }

    .hidden {
      display: none;
    }

    .offline {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      text-align: center;
      background-color: var(--ha-color-fill-neutral-quiet-resting, #1b1c20);
      color: var(--primary-text-color);
    }

    .offline .message {
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: color-mix(
        in srgb,
        var(--card-background-color) 82%,
        transparent
      );
    }

    .offline b {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }

    .offline span {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-camera-stream": HaCameraStream;
  }
  interface HASSDomEvents {
    load: undefined;
    "stream-type-changed": { type?: CameraStreamType };
    "camera-capabilities-changed": { capabilities?: CameraCapabilities };
    streams: {
      hasAudio: boolean;
      hasVideo: boolean;
      codecs?: string[];
    };
  }
}
