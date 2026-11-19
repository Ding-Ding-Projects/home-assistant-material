import type { ContextType } from "@lit/context";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import type { LocalizeFunc } from "../common/translations/localize";
import {
  addWebRtcCandidate,
  fetchWebRtcClientConfiguration,
  type WebRtcAnswer,
  type WebRTCClientConfiguration,
  webRtcOffer,
  type WebRtcOfferEvent,
} from "../data/camera";
import {
  cameraLive,
  computeLiveView,
  formatLastSeen,
  formatCountdown,
  isRateLimitMessage,
  mayStartLive,
  type LiveListener,
  type LiveViewKind,
} from "../data/camera-live-session";
import {
  keptFor,
  toOfferEvent,
  waitsForTap,
  watchCandidate,
  watchedSummaryCached,
  watchOffer,
  watchSubscribe,
  type WatchedSummary,
  type WatchEvent,
} from "../data/camera_watched";
import { apiContext, connectionContext } from "../data/context";
import "./ha-button";
import "./ha-spinner";
import { showToast } from "../util/toast";

const HIDDEN_CLEANUP_DELAY = 60000;

// A camera scrolled out of view keeps its video this long before it stops
const OFFSCREEN_CLEANUP_DELAY = 15000;

let nextPlayerId = 0;

interface WebRtcPlayerError {
  type: "not_supported" | "start_failed" | "connect_failed";
  message?: string;
}

export type WebRtcMicrophoneState = "off" | "connecting" | "on" | "denied";

/**
 * A WebRTC stream is established by first sending an offer through a signal
 * path via an integration. An answer is returned, then the rest of the stream
 * is handled entirely client side.
 */
@customElement("ha-web-rtc-player")
export class HaWebRtcPlayer extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection!: ContextType<typeof connectionContext>;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @property() public entityid?: string;

  @property({ attribute: false }) public aspectRatio?: number;

  @property({ attribute: false }) public fitMode?: "cover" | "contain" | "fill";

  @property({ type: Boolean, attribute: "controls" })
  public controls = false;

  @property({ type: Boolean, attribute: "muted" })
  public muted = false;

  @property({ type: Boolean, attribute: "autoplay" })
  public autoPlay = false;

  @property({ type: Boolean, attribute: "playsinline" })
  public playsInline = false;

  @property({ attribute: "poster-url" }) public posterUrl?: string;

  /** The camera entity's state, to tell an offline camera from one still starting */
  @property({ attribute: false }) public entityState?: string;

  /** When the camera last reported, as an ISO time; shown while it is offline */
  @property({ attribute: false }) public lastSeen?: string;

  /** Wait for a tap before asking the provider for live video */
  @property({ type: Boolean, attribute: "tap-to-start" })
  public tapToStart = false;

  @state() private _error?: WebRtcPlayerError;

  @state() private _playing = false;

  @state() private _tapped = false;

  @state() private _visible = false;

  @state() private _showDetails = false;

  @state() private _tick = 0;

  @state() private _reconnectPoster?: string;

  /** The camera's keeping settings and whether its live video goes through the home */
  @state() private _watch?: WatchedSummary;

  /** When the home started keeping what is shown, in seconds since the epoch */
  @state() private _keepingSince?: number | null;

  private _throughHome = false;

  private _homeUnavailable = false;

  private _watchUnsub?: Promise<UnsubscribeFunc>;

  private _keepTimer?: number;

  @query("#remote-stream") private _videoEl!: HTMLVideoElement;

  private _clientConfig?: WebRTCClientConfiguration;

  private _peerConnection?: RTCPeerConnection;

  private _remoteStream?: MediaStream;

  private _localReturnAudioTrack?: MediaStreamTrack;

  private _microphoneSender?: RTCRtpSender;

  private _timerRunning = false;

  private readonly _playerId = `player-${nextPlayerId++}`;

  private _joinedEntity?: string;

  private _intersection?: IntersectionObserver;

  private _offscreenTimeout?: number;

  private _tickTimer?: number;

  private _restartedIce = false;

  private _lastKind?: LiveViewKind;

  private _liveListener: LiveListener = {
    onStream: (stream) => {
      this._attachSharedStream(stream);
    },
    onPromote: () => {
      this._startWebRtc();
    },
    onError: (message) => {
      this._error = { type: "start_failed", message };
      this._scheduleTick();
    },
    onLimit: () => {
      this._scheduleTick();
      this.requestUpdate();
    },
  };

  private _microphoneConnecting = false;

  private _microphoneDenied = false;

  // Increased on every start, stop and clean up, so older starts are ignored
  private _microphoneRequest = 0;

  public get microphoneState(): WebRtcMicrophoneState {
    if (this._microphoneDenied) {
      return "denied";
    }
    if (this._microphoneConnecting) {
      return "connecting";
    }
    return this._localReturnAudioTrack ? "on" : "off";
  }

  public get microphoneTrack(): MediaStreamTrack | undefined {
    return this._localReturnAudioTrack;
  }

  public async toggleMicrophone() {
    if (this._localReturnAudioTrack || this._microphoneConnecting) {
      // Stop (not disable) so the browser releases the microphone, also cancels connecting
      this._microphoneRequest++;
      this._localReturnAudioTrack?.stop();
      this._localReturnAudioTrack = undefined;
      this._microphoneConnecting = false;
      this._fireMicrophoneChanged();
      await this._microphoneSender?.replaceTrack(null).catch(() => undefined);
      return;
    }
    if (this._microphoneDenied) {
      return;
    }

    const request = ++this._microphoneRequest;
    this._microphoneConnecting = true;
    this._fireMicrophoneChanged();
    const track = await this._getMicrophoneTrack();
    // Cancelled or cleaned up (closed, hidden or entity changed) while asking
    if (request !== this._microphoneRequest || !this.isConnected) {
      track?.stop();
      return;
    }
    if (!track) {
      this._logEvent("unable to add audio send track");
      this._microphoneConnecting = false;
      this._fireMicrophoneChanged();
      return;
    }
    this._logEvent("found microphone to use for audio return track");
    if (this._microphoneSender) {
      // The connection was already set up with a microphone, swap it back in
      const sender = this._microphoneSender;
      try {
        await sender.replaceTrack(track);
      } catch (_err: unknown) {
        track.stop();
        if (request === this._microphoneRequest) {
          this._microphoneConnecting = false;
          this._fireMicrophoneChanged();
        }
        return;
      }
      // Cancelled or cleaned up while swapping. Only stop the track, the
      // cancel already queued replaceTrack(null) and a newer start its track.
      if (request !== this._microphoneRequest) {
        track.stop();
        return;
      }
      this._localReturnAudioTrack = track;
      this._microphoneConnecting = false;
      this._fireMicrophoneChanged();
      return;
    }
    // Renegotiating the existing connection is not supported by all providers
    // (go2rtc answers with a new DTLS fingerprint, which Firefox rejects), so
    // start a new connection and session with the microphone track instead.
    this._captureReconnectFrame();
    await this._startWebRtc(track);
  }

  private _captureReconnectFrame() {
    const video = this._videoEl;
    if (!video?.videoWidth || !video.videoHeight) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    this._reconnectPoster = canvas.toDataURL("image/jpeg");
  }

  private _fireMicrophoneChanged() {
    fireEvent(this, "microphone-changed", { state: this.microphoneState });
  }

  private _unsub?: Promise<UnsubscribeFunc>;

  private _sessionId?: string;

  private _candidatesList: RTCIceCandidate[] = [];

  private _hiddenCleanupTimeout?: number;

  private _cleanUpCount = 0;

  private _handleVisibilityChange = () => {
    if (document.pictureInPictureElement) {
      // video is playing in picture-in-picture mode, don't do anything
      return;
    }
    if (document.hidden) {
      this._hiddenCleanupTimeout = window.setTimeout(() => {
        this._hiddenCleanupTimeout = undefined;
        this._cleanUp();
      }, HIDDEN_CLEANUP_DELAY);
    } else if (this._hiddenCleanupTimeout) {
      // stream was not cleaned up yet, just cancel the cleanup
      clearTimeout(this._hiddenCleanupTimeout);
      this._hiddenCleanupTimeout = undefined;
    } else if (!this._error) {
      this._maybeStart();
    }
  };

  private get _limitedSeconds(): number {
    return this.entityid ? cameraLive.limitedSeconds(this.entityid) : 0;
  }

  private get _waitingForTap(): boolean {
    return (
      waitsForTap(this.tapToStart, this._watch?.settings) &&
      !this._tapped &&
      !(this.entityid && cameraLive.hasStream(this.entityid))
    );
  }

  private _viewKind(): LiveViewKind {
    return computeLiveView({
      entityState: this.entityState,
      playing: this._playing,
      error: this._error?.message ?? this._error?.type,
      limitedSeconds: this._limitedSeconds,
      waitingForTap: this._waitingForTap && !this._error,
    });
  }

  protected override render(): TemplateResult {
    const kind = this._viewKind();
    const showVideo = kind === "live" || Boolean(this._reconnectPoster);
    return html`
      <video
        id="remote-stream"
        class=${classMap({ hidden: !showVideo })}
        ?autoplay=${this.autoPlay}
        .muted=${this.muted}
        ?playsinline=${this.playsInline}
        ?controls=${this.controls}
        poster=${ifDefined(this._reconnectPoster ?? this.posterUrl)}
        @loadeddata=${this._loadedData}
        @resize=${this._videoResized}
        style=${styleMap({
          height: this.aspectRatio == null ? "100%" : "auto",
          aspectRatio: this.aspectRatio,
          objectFit: this.fitMode,
        })}
      ></video>
      ${
        this._reconnectPoster
          ? html`<div class="reconnecting">
              <ha-spinner size="medium"></ha-spinner>
            </div>`
          : nothing
      }
      ${
        showVideo && this._keepingSince
          ? html`<div class="keeping" role="status">
              ${this._localize("ui.components.web-rtc-player.state.keeping", {
                time: keptFor(this._keepingSince),
              })}
            </div>`
          : nothing
      }
      ${showVideo ? nothing : this._renderState(kind)}
    `;
  }

  private _renderState(kind: LiveViewKind): TemplateResult {
    const l = (key: string, values?: Record<string, string | number>) =>
      this._localize(
        `ui.components.web-rtc-player.state.${key}` as "ui.components.web-rtc-player.state.starting_title",
        values
      );
    const poster = this.posterUrl
      ? { backgroundImage: `url("${this.posterUrl}")` }
      : {};
    let title: string;
    let text = "";
    let action: TemplateResult | typeof nothing = nothing;
    let details: string | undefined;
    let note = "";
    switch (kind) {
      case "limited":
        title = l("limited_title");
        text = l("limited_text", {
          time: formatCountdown(this._limitedSeconds),
        });
        note = l("limited_note");
        details = this._error?.message;
        action = html`<ha-button size="small" @click=${this._tryNow}
          >${l("try_now")}</ha-button
        >`;
        break;
      case "offline":
        title = l("offline_title");
        text = formatLastSeen(this.lastSeen)
          ? `${l("offline_last_seen", { time: formatLastSeen(this.lastSeen)! })} ${l("offline_text")}`
          : l("offline_text");
        break;
      case "error":
        title = l("error_title");
        text =
          this._error?.type === "not_supported"
            ? this._localize("ui.components.web-rtc-player.not_supported")
            : l("error_text");
        details = this._error?.message;
        action = html`<ha-button size="small" @click=${this._tryNow}
          >${l("try_again")}</ha-button
        >`;
        break;
      case "placeholder":
        title = l("placeholder_title");
        text = l("placeholder_text");
        action = html`<ha-button size="small" @click=${this._tap}
          >${l("start")}</ha-button
        >`;
        break;
      default:
        title = l("starting_title");
    }
    return html`
      <div
        class="state ${kind}"
        role=${kind === "starting" ? "status" : "group"}
        aria-live="polite"
        style=${styleMap({
          aspectRatio: this.aspectRatio ?? 16 / 9,
          ...poster,
        })}
      >
        <div class="message">
          ${
            kind === "starting"
              ? html`<ha-spinner size="small"></ha-spinner>`
              : nothing
          }
          <b>${title}</b>
          ${text ? html`<span>${text}</span>` : nothing} ${action}
          ${note ? html`<span class="note">${note}</span>` : nothing}
          ${
            details
              ? html`<div class="service">
                  <button
                    class="link"
                    aria-expanded=${this._showDetails}
                    @click=${this._toggleDetails}
                  >
                    ${l("service_said")} ·
                    ${this._showDetails ? l("hide_details") : l("show_details")}
                  </button>
                  ${this._showDetails ? html`<code>${details}</code>` : nothing}
                </div>`
              : nothing
          }
        </div>
      </div>
    `;
  }

  private _toggleDetails() {
    this._showDetails = !this._showDetails;
  }

  private _tryNow() {
    if (!this.entityid) {
      return;
    }
    cameraLive.skipWait(this.entityid);
    this._error = undefined;
    this._tapped = true;
    this._maybeStart();
  }

  private _tap() {
    this._tapped = true;
    this._maybeStart();
  }

  protected override updated(changed: PropertyValues<this>) {
    super.updated(changed);
    const keys = changed as Map<PropertyKey, unknown>;
    if (keys.has("_playing") || keys.has("_keepingSince")) {
      this._followKeeping();
    }
    const kind = this._viewKind();
    if (kind !== this._lastKind) {
      this._lastKind = kind;
      fireEvent(this, "camera-live-state", { kind });
    }
  }

  public override connectedCallback() {
    super.connectedCallback();
    this._observeVisibility();
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
  }

  private _observeVisibility() {
    if (typeof IntersectionObserver === "undefined") {
      this._visible = true;
      this._maybeStart();
      return;
    }
    this._intersection = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible === this._visible) {
        return;
      }
      this._visible = visible;
      clearTimeout(this._offscreenTimeout);
      this._offscreenTimeout = undefined;
      if (visible) {
        this._maybeStart();
      } else {
        this._offscreenTimeout = window.setTimeout(() => {
          this._offscreenTimeout = undefined;
          this._stopForNow();
        }, OFFSCREEN_CLEANUP_DELAY);
      }
    });
    this._intersection.observe(this);
  }

  /** Starts live video only when the camera is on screen, not waiting and not limited. */
  private _maybeStart() {
    if (!this.isConnected || !this.entityid) {
      return;
    }
    if (
      !mayStartLive({
        visible: this._visible,
        limitedSeconds: this._limitedSeconds,
        waitingForTap: this._waitingForTap,
      })
    ) {
      this._scheduleTick();
      return;
    }
    if (this._peerConnection || this._unsub) {
      return;
    }
    this._joinSession();
    if (cameraLive.role(this.entityid, this._playerId) === "viewer") {
      // The holder of the session shows its stream through the listener
      this._error = undefined;
      return;
    }
    this._startWebRtc();
  }

  private _joinSession() {
    if (!this.entityid || this._joinedEntity === this.entityid) {
      return;
    }
    this._leaveSession();
    this._joinedEntity = this.entityid;
    cameraLive.join(this.entityid, this._playerId, this._liveListener);
  }

  private _leaveSession() {
    if (this._joinedEntity) {
      cameraLive.leave(this._joinedEntity, this._playerId);
      this._joinedEntity = undefined;
    }
  }

  /** Stops the video but keeps the place in the shared session. */
  private _stopForNow() {
    this._cleanUp();
    this._playing = false;
  }

  private _attachSharedStream(stream?: MediaStream) {
    const video = this._videoEl;
    if (!video) {
      return;
    }
    if (!stream) {
      video.srcObject = null;
      this._playing = false;
      return;
    }
    video.srcObject = stream;
    this._error = undefined;
  }

  private _scheduleTick() {
    if (this._limitedSeconds <= 0) {
      window.clearInterval(this._tickTimer);
      this._tickTimer = undefined;
      return;
    }
    if (this._tickTimer === undefined) {
      this._tickTimer = window.setInterval(() => {
        this._tick++;
        if (this._limitedSeconds <= 0) {
          window.clearInterval(this._tickTimer);
          this._tickTimer = undefined;
          this._whenWaitEnds();
        }
      }, 1000);
    }
  }

  // After the wait, only the holder of the session asks again, once.
  private _whenWaitEnds() {
    if (
      this.entityid &&
      cameraLive.role(this.entityid, this._playerId) === "owner"
    ) {
      this._error = undefined;
      this._maybeStart();
    }
  }

  public override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange
    );
    clearTimeout(this._hiddenCleanupTimeout);
    this._hiddenCleanupTimeout = undefined;
    clearTimeout(this._offscreenTimeout);
    window.clearInterval(this._tickTimer);
    this._tickTimer = undefined;
    this._intersection?.disconnect();
    this._intersection = undefined;
    this._visible = false;
    this._cleanUp();
    this._leaveSession();
    this._playing = false;
  }

  protected override willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);
    if (!changedProperties.has("entityid")) {
      return;
    }
    this._cleanUp();
    this._leaveSession();
    this._playing = false;
    this._error = undefined;
    this._maybeStart();
  }

  private async _startWebRtc(
    localReturnAudioTrack?: MediaStreamTrack
  ): Promise<void> {
    this._cleanUp();

    if (localReturnAudioTrack) {
      this._localReturnAudioTrack = localReturnAudioTrack;
      this._microphoneConnecting = true;
      this._fireMicrophoneChanged();
    }

    // Browser support required for WebRTC
    if (typeof RTCPeerConnection === "undefined") {
      this._error = { type: "not_supported" };
      fireEvent(this, "streams", { hasAudio: false, hasVideo: false });
      return;
    }

    if (
      !this._api ||
      !this._connection ||
      !this.entityid ||
      !this.isConnected
    ) {
      return;
    }

    this._error = undefined;
    this._restartedIce = false;

    this._startTimer();

    const cleanUpCountAtStart = this._cleanUpCount;

    this._logEvent("start clientConfig");

    let clientConfig: WebRTCClientConfiguration;
    try {
      clientConfig = await fetchWebRtcClientConfiguration(
        this._api,
        this.entityid
      );
    } catch (err: any) {
      if (cleanUpCountAtStart === this._cleanUpCount) {
        this._failStart({ type: "start_failed", message: err.message });
      }
      return;
    }

    if (cleanUpCountAtStart !== this._cleanUpCount) {
      return;
    }

    this._clientConfig = clientConfig;

    // A camera that streams only through its service is watched through the
    // home, so the one live view the home pulls is both shown and kept.
    const watch = await watchedSummaryCached(this._api, this.entityid);
    if (cleanUpCountAtStart !== this._cleanUpCount) {
      return;
    }
    this._watch = watch;
    this._throughHome = watch?.live?.route === "home" && !this._homeUnavailable;

    this._logEvent("end clientConfig", this._clientConfig);

    this._peerConnection = new RTCPeerConnection(
      this._clientConfig.configuration
    );

    if (this._clientConfig.dataChannel && !this._throughHome) {
      // Some cameras (such as nest) require a data channel to establish a stream
      // however, not used by any integrations.
      this._peerConnection.createDataChannel(this._clientConfig.dataChannel);
    }

    this._peerConnection.onnegotiationneeded = this._startNegotiation;

    this._peerConnection.onicecandidate = this._handleIceCandidate;
    this._peerConnection.oniceconnectionstatechange =
      this._iceConnectionStateChanged;

    // just for debugging
    this._peerConnection.onsignalingstatechange = (ev) => {
      switch ((ev.target as RTCPeerConnection).signalingState) {
        case "stable":
          this._logEvent("ICE negotiation complete");
          break;
        default:
          this._logEvent(
            "Signaling state changed",
            (ev.target as RTCPeerConnection).signalingState
          );
      }
    };

    // Setup callbacks to render remote stream once media tracks are discovered.
    this._remoteStream = new MediaStream();
    this._peerConnection.ontrack = this._addTrack;

    if (this._localReturnAudioTrack) {
      this._microphoneSender = this._peerConnection.addTransceiver(
        this._localReturnAudioTrack,
        { direction: "sendrecv" }
      ).sender;
    } else {
      this._peerConnection.addTransceiver("audio", { direction: "recvonly" });
    }
    this._peerConnection.addTransceiver("video", { direction: "recvonly" });
  }

  private _startNegotiation = async () => {
    const peerConnection = this._peerConnection;
    if (!peerConnection) {
      return;
    }

    const offerOptions: RTCOfferOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    };

    this._logEvent("start createOffer", offerOptions);

    const offer: RTCSessionDescriptionInit =
      await peerConnection.createOffer(offerOptions);

    if (this._peerConnection !== peerConnection) {
      return;
    }

    this._logEvent("end createOffer", offer);

    this._logEvent("start setLocalDescription");

    await peerConnection.setLocalDescription(offer);

    if (this._peerConnection !== peerConnection || !this.entityid) {
      return;
    }

    this._logEvent("end setLocalDescription");

    let candidates = "";

    while (this._candidatesList.length) {
      const candidate = this._candidatesList.pop();
      if (candidate) {
        candidates += `a=${candidate}\r\n`;
      }
    }

    const offer_sdp = offer.sdp! + candidates;

    this._logEvent("start webRtcOffer", offer_sdp);

    this._unsub = this._throughHome
      ? watchOffer(this._connection, this.entityid, offer_sdp, (event) =>
          this._handleWatchEvent(peerConnection, event)
        )
      : webRtcOffer(this._connection, this.entityid, offer_sdp, (event) =>
          this._handleOfferEvent(peerConnection, event)
        );
    this._unsub.catch((err) => {
      if (this._peerConnection !== peerConnection) {
        return;
      }
      this._unsub = undefined;
      this._failStart({ type: "start_failed", message: err.message });
    });
  };

  private _iceConnectionStateChanged = () => {
    this._logEvent(
      "ice connection state change",
      this._peerConnection?.iceConnectionState
    );
    if (this._peerConnection?.iceConnectionState === "failed") {
      // Restarting ICE sends a new offer to the camera service, which counts
      // against its limits, so it is tried once per start.
      if (this._restartedIce) {
        this._failStart({ type: "connect_failed", message: "ICE failed" });
        return;
      }
      this._restartedIce = true;
      this._peerConnection.restartIce();
    }
  };

  private _handleWatchEvent(
    peerConnection: RTCPeerConnection,
    event: WatchEvent
  ) {
    if (this._peerConnection !== peerConnection) {
      return;
    }
    if (event.type === "state") {
      this._keepingSince = event.keeping_since;
      return;
    }
    if (event.type === "ended") {
      this._keepingSince = undefined;
      return;
    }
    if (
      event.type === "error" &&
      ["no_go2rtc", "not_through_home", "not_found"].includes(event.code)
    ) {
      // The home cannot pull this camera: watch it straight from its service.
      this._homeUnavailable = true;
      this._startWebRtc();
      return;
    }
    const offerEvent = toOfferEvent(event);
    if (offerEvent) {
      this._handleOfferEvent(peerConnection, offerEvent);
    }
  }

  private _sendCandidate(sessionId: string, candidate: RTCIceCandidate) {
    if (!this.entityid) {
      return;
    }
    if (this._throughHome) {
      watchCandidate(
        this._api,
        this.entityid,
        sessionId,
        candidate.candidate
      ).catch(() => undefined);
      return;
    }
    // toJSON returns RTCIceCandidateInit
    addWebRtcCandidate(this._api, this.entityid, sessionId, candidate.toJSON());
  }

  /** While a camera with its own stream address plays, the home keeps it. */
  private _followKeeping() {
    const keep =
      this._playing &&
      !this._throughHome &&
      Boolean(this._watch?.settings?.keep_live) &&
      Boolean(this.entityid);
    if (keep && !this._watchUnsub && this.entityid) {
      this._watchUnsub = watchSubscribe(
        this._connection,
        this.entityid,
        (event) => {
          if (event.type === "state") {
            this._keepingSince = event.keeping_since;
          }
        }
      );
      this._watchUnsub.catch(() => {
        this._watchUnsub = undefined;
      });
    } else if (!keep && this._watchUnsub) {
      this._stopFollowingKeeping();
    }
    window.clearInterval(this._keepTimer);
    this._keepTimer = undefined;
    if (this._playing && this._keepingSince) {
      this._keepTimer = window.setInterval(() => this.requestUpdate(), 1000);
    }
  }

  private _stopFollowingKeeping() {
    const unsub = this._watchUnsub;
    this._watchUnsub = undefined;
    unsub?.then((stop) => stop()).catch(() => undefined);
  }

  private async _handleOfferEvent(
    peerConnection: RTCPeerConnection,
    event: WebRtcOfferEvent
  ) {
    // Ignore events of a subscription that belongs to a superseded start
    if (this._peerConnection !== peerConnection || !this.entityid) {
      return;
    }
    if (event.type === "session") {
      this._sessionId = event.session_id;
      this._candidatesList.forEach((candidate) =>
        this._sendCandidate(event.session_id, candidate)
      );
      this._candidatesList = [];
    }
    if (event.type === "answer") {
      this._logEvent("answer", event.answer);

      this._handleAnswer(peerConnection, event);
    }
    if (event.type === "candidate") {
      this._logEvent("remote ice candidate", event.candidate);

      try {
        // The spdMid or sdpMLineIndex is required so set sdpMid="0" if not
        // sent from the backend.
        const candidate =
          event.candidate.sdpMid || event.candidate.sdpMLineIndex != null
            ? new RTCIceCandidate(event.candidate)
            : new RTCIceCandidate({
                candidate: event.candidate.candidate,
                sdpMid: "0",
              });

        await peerConnection.addIceCandidate(candidate);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    }
    if (event.type === "error") {
      this._failStart({ type: "start_failed", message: event.message });
    }
  }

  private _handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!this.entityid || !event.candidate?.candidate) {
      return;
    }

    this._logEvent(
      "local ice candidate",
      event.candidate?.candidate,
      event.candidate?.sdpMLineIndex
    );

    if (this._sessionId) {
      this._sendCandidate(this._sessionId, event.candidate);
    } else {
      this._candidatesList.push(event.candidate);
    }
  };

  private _addTrack = async (event: RTCTrackEvent) => {
    if (!this._remoteStream) {
      return;
    }
    // If the track is audio and the player is muted, we do not add it to the stream.
    if (event.track.kind === "audio" && this.muted) {
      return;
    }
    this._remoteStream.addTrack(event.track);
    if (!this.hasUpdated) {
      await this.updateComplete;
    }
    this._videoEl.srcObject = this._remoteStream;
    if (this._joinedEntity && !this._localReturnAudioTrack) {
      cameraLive.publish(
        this._joinedEntity,
        this._playerId,
        this._remoteStream
      );
    }
  };

  private async _handleAnswer(
    peerConnection: RTCPeerConnection,
    event: WebRtcAnswer
  ) {
    if (["stable", "closed"].includes(peerConnection.signalingState)) {
      return;
    }

    // Initiate the stream with the remote device
    const remoteDesc = new RTCSessionDescription({
      type: "answer",
      sdp: event.answer,
    });
    try {
      this._logEvent("start setRemoteDescription", remoteDesc);
      await peerConnection.setRemoteDescription(remoteDesc);
    } catch (err: any) {
      // Closing a superseded connection rejects its pending operations
      if (this._peerConnection !== peerConnection) {
        return;
      }
      this._failStart({ type: "connect_failed", message: err.message });
    }
    this._logEvent("end setRemoteDescription");
  }

  private async _getMicrophoneTrack(): Promise<MediaStreamTrack | undefined> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      return stream.getAudioTracks()[0];
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        this._microphoneDenied = true;
        return undefined;
      }
      // A missing or busy microphone should not replace the running video
      showToast(this, {
        message: this._localize(
          "ui.components.web-rtc-player.microphone_failed",
          { message: err instanceof Error ? err.message : String(err) }
        ),
      });
      return undefined;
    }
  }

  private _failStart(error: WebRtcPlayerError) {
    if (this.entityid && isRateLimitMessage(error.message)) {
      cameraLive.recordRateLimit(this.entityid);
      this._scheduleTick();
    }
    if (this._joinedEntity) {
      cameraLive.fail(
        this._joinedEntity,
        this._playerId,
        error.message ?? error.type
      );
    }
    // The camera can reject the microphone, keep the video running without it
    if (this._localReturnAudioTrack && this._microphoneConnecting) {
      showToast(this, {
        message: this._localize(
          "ui.components.web-rtc-player.microphone_connect_failed",
          { message: error.message ?? "" }
        ),
      });
      this._startWebRtc();
      return;
    }
    this._error = error;
    this._playing = false;
    this._cleanUp();
  }

  private _cleanUp() {
    if (this._joinedEntity) {
      cameraLive.publish(this._joinedEntity, this._playerId, undefined);
    }
    this._cleanUpCount++;
    this._microphoneRequest++;
    this._stopFollowingKeeping();
    this._keepingSince = undefined;
    window.clearInterval(this._keepTimer);
    this._keepTimer = undefined;
    if (this._remoteStream) {
      this._remoteStream.getTracks().forEach((track) => {
        track.stop();
      });

      this._remoteStream = undefined;
    }
    if (this._localReturnAudioTrack || this._microphoneConnecting) {
      this._localReturnAudioTrack?.stop();
      this._localReturnAudioTrack = undefined;
      this._microphoneConnecting = false;
      this._fireMicrophoneChanged();
    }
    const videoEl = this._videoEl;
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.removeAttribute("src");
      videoEl.load();
    }
    if (this._peerConnection) {
      this._peerConnection.close();

      this._peerConnection.onnegotiationneeded = null;
      this._peerConnection.onicecandidate = null;
      this._peerConnection.oniceconnectionstatechange = null;
      this._peerConnection.onicegatheringstatechange = null;
      this._peerConnection.ontrack = null;

      // just for debugging
      this._peerConnection.onsignalingstatechange = null;

      this._peerConnection = undefined;
      this._microphoneSender = undefined;

      this._logEvent("stopped");
      this._stopTimer();
    }
    // A rejected subscription is already handled in _startNegotiation
    this._unsub?.then(
      (unsub) => unsub(),
      () => undefined
    );
    this._unsub = undefined;
    this._sessionId = undefined;
    this._candidatesList = [];
  }

  private _loadedData() {
    const video = this._videoEl;
    const stream = video.srcObject as MediaStream;

    const data = {
      hasAudio: Boolean(stream?.getAudioTracks().length),
      hasVideo: Boolean(stream?.getVideoTracks().length),
    };

    fireEvent(this, "load");
    fireEvent(this, "streams", data);
    this._playing = data.hasVideo;
    if (data.hasVideo && this.entityid) {
      cameraLive.recordSuccess(this.entityid);
    }

    this._logEvent("loadedData", data);
    this._stopTimer();

    // Without a track the microphone is still waiting for permission
    if (this._microphoneConnecting && this._localReturnAudioTrack) {
      this._microphoneConnecting = false;
      this._fireMicrophoneChanged();
    }
  }

  private _videoResized() {
    if (this._videoEl.videoWidth && this._videoEl.videoHeight) {
      this._reconnectPoster = undefined;
    }
  }

  private _startTimer() {
    if (!__DEV__) {
      return;
    }
    // eslint-disable-next-line no-console
    console.time("WebRTC");
    this._timerRunning = true;
  }

  private _stopTimer() {
    if (!__DEV__) {
      return;
    }
    this._timerRunning = false;
    // eslint-disable-next-line no-console
    console.timeEnd("WebRTC");
  }

  private _logEvent(msg: string, ...args: unknown[]) {
    if (!__DEV__) {
      return;
    }
    if (!this._timerRunning) {
      // eslint-disable-next-line no-console
      console.log("WebRTC:", msg, ...args);
      return;
    }
    // eslint-disable-next-line no-console
    console.timeLog("WebRTC", msg, ...args);
  }

  static styles = css`
    :host,
    video {
      display: block;
    }

    :host {
      position: relative;
    }

    video {
      width: 100%;
      max-height: var(--video-max-height, calc(100vh - 97px));
    }

    video.hidden {
      display: none;
    }

    .state {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      text-align: center;
      background-color: var(--ha-color-fill-neutral-quiet-resting, #1b1c20);
      background-size: cover;
      background-position: center;
      color: var(--primary-text-color);
    }

    .keeping {
      position: absolute;
      inset-block-start: var(--ha-space-2);
      inset-inline-start: var(--ha-space-2);
      max-width: calc(100% - var(--ha-space-4));
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill, 999px);
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-condensed);
      color: var(--primary-text-color);
      background: color-mix(
        in srgb,
        var(--card-background-color) 82%,
        transparent
      );
      pointer-events: none;
    }

    .state .message {
      box-sizing: border-box;
      min-width: 0;
      max-width: 100%;
      max-height: 100%;
      overflow: auto;
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

    .state .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }

    .state b {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }

    .state span {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }

    .service {
      min-width: 0;
      max-width: 100%;
      font-size: var(--ha-font-size-s);
    }

    .service code {
      display: block;
      max-height: 6em;
      overflow: auto;
      margin-top: var(--ha-space-1);
      text-align: start;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--secondary-text-color);
    }

    button.link {
      min-height: 32px;
      padding: 0 var(--ha-space-2);
      border: none;
      background: none;
      color: var(--primary-color);
      font: inherit;
      cursor: pointer;
    }

    .reconnecting {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.4);
      --ha-spinner-indicator-color: white;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-web-rtc-player": HaWebRtcPlayer;
  }
  interface HASSDomEvents {
    "microphone-changed": { state: WebRtcMicrophoneState };
    "camera-live-state": { kind: LiveViewKind };
  }
}
