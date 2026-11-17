import type { ContextType } from "@lit/context";
import { mdiAlertOutline, mdiChevronDoubleRight } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { currentMotionLock } from "../common/appearance/motion-profiles";
import type { KeyName, TwoKeyState } from "../common/confirm/two-key";
import {
  bothTurned,
  emptyTwoKeyState,
  holdKey,
  isTurned,
  KEY_LETTERS,
  keyForLetter,
  releaseKey,
  remaining,
} from "../common/confirm/two-key";
import type { ConfirmationDrama } from "../common/confirm/two-key-drama";
import {
  confirmStage,
  confirmStatus,
  coreLabel,
  DEFAULT_CONFIRMATION_DRAMA,
  dramaClass,
  dramaProfile,
  effectFlags,
  levelOf,
  slideTickDue,
} from "../common/confirm/two-key-drama";
import { playConfirmEffect } from "../common/confirm/two-key-effect";
import { consume } from "../common/decorators/consume";
import { fireEvent } from "../common/dom/fire_event";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import {
  getPersonalPreferences,
  subscribePersonalPreferences,
} from "../common/preferences/personal-preferences";
import { playActionCue } from "../common/sound/action-sound";
import type { LocalizeFunc } from "../common/translations/localize";
import { internationalizationContext } from "../data/context";
import { forwardHaptic } from "../data/haptics";
import "./ha-slider";
import type { HaSlider } from "./ha-slider";
import "./ha-svg-icon";
import "./input/ha-input";
import type { HaInput } from "./input/ha-input";

declare global {
  interface HASSDomEvents {
    /** Both keys were turned and the slider reached its end. */
    "two-key-confirmed": undefined;
  }
}

const KEYS: KeyName[] = ["one", "two"];

/** How long the phone hold button must be held, in milliseconds. */
const HOLD_MS = 1500;

/** How long the slider takes to spring back when it is let go early. */
const SPRING_BACK_MS = 380;

/**
 * The guard on anything that destroys data: turn two keys, then move the
 * slider to its end. Fires `two-key-confirmed` once.
 *
 * Only the look and the motion change with the slider: the single custom
 * property `--tk-level` (0 to 1) is set on the host while sliding and every
 * effect is derived from it in CSS, so the template is not rendered again for
 * each step of the slider. The person's "Confirmation drama" choice and the
 * reduced motion settings decide how strongly it looks and moves; they never
 * change what has to be done.
 */
@customElement("ha-two-key-confirm")
export class HaTwoKeyConfirm extends LitElement {
  @property({ type: Boolean }) public disabled = false;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _keys: TwoKeyState = emptyTwoKeyState();

  @state() private _now = Date.now();

  /**
   * The slider position from 0 to 100. Not reactive on purpose: the slider
   * moves many times a second, and the view only needs to render again when
   * a step or a word changes, see `_viewKey`.
   */
  private _slide = 0;

  /** Changes only when what is drawn changes, so it is what renders again. */
  @state() private _viewKey = "";

  @state() private _drama: ConfirmationDrama = DEFAULT_CONFIRMATION_DRAMA;

  /** True while any setting asks for no motion. */
  private _reduced = false;

  /**
   * True on a touch screen with no keyboard or mouse: the two keys are held
   * with letters or two fingers there, so the phone form is "type the word,
   * then hold the button".
   */
  @state() private _touch = false;

  @state() private _word = "";

  /** How far the hold button has filled, from 0 to 1. */
  @state() private _held = 0;

  @query("ha-slider") private _sliderEl?: HaSlider;

  @query(".core") private _coreEl?: HTMLElement;

  @queryAll(".pct") private _pcts?: NodeListOf<HTMLElement>;

  private _lang = new LanguageModeController(this);

  private _holdStart?: number;

  private _holdTimer?: number;

  private _touchQuery?: MediaQueryList;

  private _done = false;

  private _tick?: number;

  private _springId?: number;

  private _lastTickAt = 0;

  private _unsubPreferences?: UnsubscribeFunc;

  // The owner's decision (13 November 2026): the confirmation is the two keys
  // and the slider on every device, with nothing to type. The keys are
  // buttons, so two fingers turn them on a touch screen. The typed-word form
  // below is kept out of use.
  private _touchChanged = (): void => {
    this._touch = false;
  };

  public connectedCallback(): void {
    super.connectedCallback();
    if (typeof window.matchMedia === "function") {
      this._touchQuery = window.matchMedia(
        "(pointer: coarse) and (hover: none)"
      );
      this._touch = false;
    }
    this._readPreferences();
    try {
      this._unsubPreferences = subscribePersonalPreferences(() =>
        this._readPreferences()
      );
    } catch (_err) {
      // Storage is unavailable: the default stays.
      this._unsubPreferences = undefined;
    }
    window.addEventListener("keydown", this._keydown, true);
    window.addEventListener("keyup", this._keyup, true);
    window.addEventListener("blur", this._releaseAll);
    window.addEventListener("pointerup", this._endDrag, true);
    window.addEventListener("pointercancel", this._endDrag, true);
    this._tick = window.setInterval(() => {
      this._now = Date.now();
      // A slide that is still under a finger is never snapped back because the
      // keys timed out half-way; it is judged when the finger lifts.
      if (
        !bothTurned(this._keys, this._now) &&
        this._slide &&
        !this._done &&
        !this._dragging
      ) {
        this._springBack();
      }
    }, 250);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._keydown, true);
    window.removeEventListener("keyup", this._keyup, true);
    window.removeEventListener("blur", this._releaseAll);
    window.removeEventListener("pointerup", this._endDrag, true);
    window.removeEventListener("pointercancel", this._endDrag, true);
    window.clearInterval(this._tick);
    this._cancelSpring();
    this._unsubPreferences?.();
    this._unsubPreferences = undefined;
    this._touchQuery?.removeEventListener?.("change", this._touchChanged);
    this._stopHold();
  }

  private _readPreferences(): void {
    try {
      this._drama = getPersonalPreferences().confirmationDrama;
    } catch (_err) {
      this._drama = DEFAULT_CONFIRMATION_DRAMA;
    }
  }

  protected willUpdate(): void {
    this._reduced = currentMotionLock() !== undefined;
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this._paint();
  }

  /**
   * Writes the slider level to the host and the percentage to the two
   * numbers. This is the one place that is not done by the template: the
   * level moves many times a second and must not render the template.
   */
  private _paint(): void {
    this.style.setProperty("--tk-level", String(levelOf(this._slide)));
    const text = `${Math.round(this._slide)}%`;
    this._pcts?.forEach((element) => {
      if (element.textContent !== text) {
        element.textContent = text;
      }
    });
  }

  private get _profile() {
    return dramaProfile(this._drama, this._reduced);
  }

  /** True when a sound and a haptic tick are welcome at all. */
  private get _feedback(): boolean {
    return this._drama !== "off";
  }

  private get _wordMatches(): boolean {
    const word = this._i18n?.localize("ui.dialogs.two_key.phone_word") ?? "";
    return (
      word !== "" &&
      this._word.trim().toLocaleUpperCase() === word.toLocaleUpperCase()
    );
  }

  private _wordInput(ev: Event): void {
    this._word = (ev.currentTarget as HaInput).value ?? "";
    if (!this._wordMatches) {
      this._stopHold();
    }
  }

  private _startHold(): void {
    if (this.disabled || this._done || !this._wordMatches || this._holdTimer) {
      return;
    }
    this._holdStart = Date.now();
    this._holdTimer = window.setInterval(() => {
      const fraction = Math.min(
        1,
        (Date.now() - (this._holdStart ?? Date.now())) / HOLD_MS
      );
      this._held = fraction;
      if (fraction >= 1) {
        this._stopHold(false);
        if (!this._done && this._wordMatches) {
          this._done = true;
          fireEvent(this, "two-key-confirmed");
        }
      }
    }, 40);
  }

  // Letting go early starts over: nothing is kept between two holds.
  private _stopHold(reset = true): void {
    window.clearInterval(this._holdTimer);
    this._holdTimer = undefined;
    this._holdStart = undefined;
    if (reset && !this._done) {
      this._held = 0;
    }
  }

  private _holdKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      ev.preventDefault();
      this._startHold();
    }
  }

  private _holdKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._stopHold();
    }
  }

  private _renderPhone(localize: LocalizeFunc): TemplateResult {
    const word = localize("ui.dialogs.two_key.phone_word");
    const ready = this._wordMatches;
    const holding = this._held > 0 && this._held < 1;
    return html`
      <ha-input
        id="phone-word"
        class="phone-word"
        type="text"
        .label=${localize("ui.dialogs.two_key.phone_type", { word })}
        autocomplete="off"
        autocapitalize="characters"
        enterkeyhint="done"
        .spellcheck=${false}
        .disabled=${this.disabled}
        .value=${this._word}
        @input=${this._wordInput}
      ></ha-input>
      <button
        type="button"
        class=${classMap({ hold: true, ready })}
        ?disabled=${this.disabled || !ready}
        aria-describedby="phone-note"
        @pointerdown=${this._holdPointerDown}
        @pointerup=${this._holdPointerUp}
        @pointercancel=${this._holdPointerUp}
        @lostpointercapture=${this._holdPointerUp}
        @contextmenu=${this._noMenu}
        @keydown=${this._holdKeydown}
        @keyup=${this._holdKeyup}
        @blur=${this._holdPointerUp}
      >
        <span
          class="hold-fill"
          aria-hidden="true"
          style=${styleMap({ width: `${Math.round(this._held * 100)}%` })}
        ></span>
        <span class="hold-text" role="status" aria-live="polite"
          >${localize(
            !ready
              ? "ui.dialogs.two_key.phone_locked"
              : holding
                ? "ui.dialogs.two_key.phone_holding"
                : "ui.dialogs.two_key.phone_hold"
          )}</span
        >
      </button>
      <p id="phone-note" class="note">
        ${localize("ui.dialogs.two_key.phone_note")}
      </p>
    `;
  }

  private _holdPointerDown(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    this._startHold();
  }

  private _holdPointerUp(): void {
    this._stopHold();
  }

  private _noMenu(ev: Event): void {
    ev.preventDefault();
  }

  private _dragging = false;

  private _startDrag = (): void => {
    this._dragging = true;
    this._cancelSpring();
  };

  private _endDrag = (): void => {
    this._dragging = false;
  };

  private _typing(ev: KeyboardEvent): boolean {
    return ev
      .composedPath()
      .some(
        (target) =>
          target instanceof HTMLElement &&
          (target.localName === "textarea" ||
            target.isContentEditable ||
            (target instanceof HTMLInputElement && target.type !== "range"))
      );
  }

  /** Turns a key. The tick is a light haptic and a short sound, only once. */
  private _turn(key: KeyName): void {
    const was = isTurned(this._keys, key, Date.now());
    this._keys = holdKey(this._keys, key);
    this._now = Date.now();
    if (!was && this._feedback) {
      forwardHaptic(this, "light");
      playActionCue("key-turn");
    }
  }

  private _let(key: KeyName): void {
    this._keys = releaseKey(this._keys, key, Date.now());
    this._now = Date.now();
  }

  private _keydown = (ev: KeyboardEvent): void => {
    const key = keyForLetter(ev.key);
    if (!key || this.disabled || ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    if (this._typing(ev)) {
      return;
    }
    ev.preventDefault();
    if (!ev.repeat) {
      this._turn(key);
    }
  };

  private _keyup = (ev: KeyboardEvent): void => {
    const key = keyForLetter(ev.key);
    if (key) {
      this._let(key);
    }
  };

  private _releaseAll = (): void => {
    const now = Date.now();
    this._keys = releaseKey(releaseKey(this._keys, "one", now), "two", now);
    this._now = now;
  };

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    const localize = this._i18n.localize;
    if (this._touch) {
      return this._renderPhone(localize);
    }
    const text = (key: string, values?: Record<string, string | number>) =>
      this._lang.text(localize, key, values);
    const now = this._now;
    const ready = bothTurned(this._keys, now);
    const waitingFor = KEYS.find((key) => !isTurned(this._keys, key, now));
    const view = this._view(now);
    const profile = this._profile;
    const flags = effectFlags(view.level, profile);
    return html`
      <div
        class=${classMap({
          board: true,
          [`stage-${view.stage}`]: true,
          [`drama-${dramaClass(this._drama, this._reduced)}`]: true,
          armed: ready,
          spin: profile.spin,
          scanning: profile.scan,
          shake: flags.shake,
          flicker: flags.flicker,
        })}
      >
        <div class="fx" aria-hidden="true">
          <div class="glow"></div>
          <div class="vignette"></div>
          <div class="scan"></div>
        </div>
        <div class="stage">
          <div class="head">
            <div class="tag">
              <ha-svg-icon .path=${mdiAlertOutline}></ha-svg-icon>
              ${text("ui.dialogs.two_key.tag")}
            </div>
            <p class="status" role="status" aria-live="polite">
              ${text(`ui.dialogs.two_key.status_${view.status}`)}
            </p>
          </div>
          <div class="deck">
            ${KEYS.map((key) => this._renderKey(key, now, text))}
            <div class="core" aria-hidden="true">
              <div class="pulse"></div>
              <div class="pulse pulse-two"></div>
              <svg class="ring ring-one" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="56" stroke-dasharray="4 10"></circle>
              </svg>
              <svg class="ring ring-two" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  stroke-dasharray="30 14"
                ></circle>
              </svg>
              <svg class="gauge" viewBox="0 0 120 120">
                <circle class="gauge-track" cx="60" cy="60" r="38"></circle>
                <circle class="gauge-arc" cx="60" cy="60" r="38"></circle>
              </svg>
              <div class="readout">
                <div class="numeral">
                  <div class="pct pct-core">0%</div>
                  <div class="core-label">
                    ${text(`ui.dialogs.two_key.core_${view.label}`)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="slide-head">
            <span class="slide-label" id="slide-label"
              >${text("ui.dialogs.two_key.slide")}</span
            >
            <span class="pct pct-label" aria-hidden="true">0%</span>
          </div>
          <div class="slide">
            <div class="fill" aria-hidden="true">
              <div class="stripes"></div>
            </div>
            <div class="hint" aria-hidden="true">
              <span class="hint-text"
                >${this._hintText(view.keysTurned, waitingFor, text)}</span
              >
              <ha-svg-icon .path=${mdiChevronDoubleRight}></ha-svg-icon>
            </div>
            <ha-slider
              id="slide"
              size="m"
              .min=${0}
              .max=${100}
              .step=${1}
              .value=${0}
              .withTooltip=${false}
              .disabled=${!ready || this.disabled}
              aria-labelledby="slide-label"
              aria-describedby="note"
              @pointerdown=${this._startDrag}
              @input=${this._slideInput}
              @change=${this._slideChange}
            ></ha-slider>
          </div>
          <p id="note" class="note">${text("ui.dialogs.two_key.note")}</p>
        </div>
      </div>
    `;
  }

  /** The words inside the track: what is still needed, or what to do. */
  private _hintText(
    keysTurned: number,
    waitingFor: KeyName | undefined,
    text: (key: string, values?: Record<string, string | number>) => string
  ): string {
    if (keysTurned >= KEYS.length) {
      return text("ui.dialogs.two_key.slide_ready");
    }
    return waitingFor && keysTurned === 1
      ? text("ui.dialogs.two_key.waiting", {
          key: text(`ui.dialogs.two_key.name_${waitingFor}`),
        })
      : text("ui.dialogs.two_key.slide_hint");
  }

  /** What is drawn for the keys and the level right now. */
  private _view(now: number) {
    const keysTurned = KEYS.filter((key) =>
      isTurned(this._keys, key, now)
    ).length;
    const ready = keysTurned === KEYS.length;
    const level = ready ? levelOf(this._slide) : 0;
    return {
      keysTurned,
      level,
      stage: confirmStage(keysTurned, level),
      status: confirmStatus({ keysTurned, level, done: this._done }),
      label: coreLabel(ready, level),
    };
  }

  private _renderKey(
    key: KeyName,
    now: number,
    text: (key: string, values?: Record<string, string | number>) => string
  ): TemplateResult {
    const turned = isTurned(this._keys, key, now);
    const left = Math.ceil(remaining(this._keys, key, now) / 1000);
    return html`
      <button
        type="button"
        class=${classMap({ key: true, turned })}
        aria-pressed=${turned ? "true" : "false"}
        ?disabled=${this.disabled}
        data-key=${key}
        @pointerdown=${this._pointerDown}
        @pointerup=${this._pointerUp}
        @pointercancel=${this._pointerUp}
        @lostpointercapture=${this._pointerUp}
        @keydown=${this._tileKeydown}
        @keyup=${this._tileKeyup}
        @blur=${this._pointerUp}
      >
        <span class="face" aria-hidden="true">
          <svg
            class="glyph"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="6.5" r="3.5"></circle>
            <path d="M12 10v11m0-4h3m-3-3.5h2"></path>
          </svg>
        </span>
        <strong
          >${text(
            turned
              ? `ui.dialogs.two_key.turned_${key}`
              : `ui.dialogs.two_key.turn_${key}`
          )}</strong
        >
        <span class="caption"
          >${
            turned && left
              ? text("ui.dialogs.two_key.stays", { seconds: left })
              : text("ui.dialogs.two_key.hold", {
                  letter: KEY_LETTERS[key].toUpperCase(),
                })
          }</span
        >
      </button>
    `;
  }

  private _keyOf(ev: Event): KeyName {
    return (ev.currentTarget as HTMLElement).dataset.key as KeyName;
  }

  private _pointerDown(ev: PointerEvent): void {
    if (this.disabled) {
      return;
    }
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._turn(this._keyOf(ev));
  }

  private _pointerUp(ev: Event): void {
    this._let(this._keyOf(ev));
  }

  private _tileKeydown(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      ev.preventDefault();
      this._turn(this._keyOf(ev));
    }
  }

  private _tileKeyup(ev: KeyboardEvent): void {
    if (ev.key === "Enter" || ev.key === " ") {
      this._pointerUp(ev);
    }
  }

  /**
   * Moves the level without rendering the template: the property on the host
   * carries it, and the template renders again only when the colour step, the
   * words or an effect switch changes.
   */
  private _setLevel(percent: number): void {
    this._slide = Math.min(100, Math.max(0, percent));
    this._paint();
    const view = this._view(Date.now());
    const flags = effectFlags(view.level, this._profile);
    const signature = [
      view.stage,
      view.status,
      view.label,
      flags.shake,
      flags.flicker,
    ].join("|");
    if (signature !== this._viewKey) {
      this._viewKey = signature;
    }
  }

  private _slideInput(ev: Event): void {
    const before = this._slide;
    const next = Number((ev.currentTarget as HaSlider).value);
    this._setLevel(next);
    const now = performance.now();
    if (this._feedback && slideTickDue(this._lastTickAt, before, next, now)) {
      this._lastTickAt = now;
      // A rising series: every tenth of the way is a little higher.
      forwardHaptic(this, "selection");
      playActionCue("charge", 1 + levelOf(next) * 1.2);
    }
    this._check();
  }

  private _slideChange(): void {
    // Let go before the end: the slider springs back to the start.
    if (!this._done && this._slide < 100) {
      this._springBack();
    }
  }

  private _cancelSpring(): void {
    if (this._springId !== undefined) {
      cancelAnimationFrame(this._springId);
      this._springId = undefined;
    }
  }

  /** Eases the thumb back to the start; at once when nothing may move. */
  private _springBack(): void {
    if (this._springId !== undefined) {
      return;
    }
    const from = this._slide;
    const slider = this._sliderEl;
    if (from <= 0 || !slider || this._reduced || this._drama === "off") {
      if (slider) {
        slider.value = 0;
      }
      this._setLevel(0);
      return;
    }
    const start = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / SPRING_BACK_MS);
      const eased = 1 - (1 - progress) ** 3;
      const value = from * (1 - eased);
      slider.value = Math.round(value);
      this._setLevel(value);
      if (progress < 1) {
        this._springId = requestAnimationFrame(step);
      } else {
        this._springId = undefined;
        slider.value = 0;
        this._setLevel(0);
      }
    };
    this._springId = requestAnimationFrame(step);
  }

  private _check(): void {
    if (
      this._done ||
      this._slide < 100 ||
      !bothTurned(this._keys, Date.now())
    ) {
      return;
    }
    this._done = true;
    this._setLevel(100);
    this._celebrate();
    fireEvent(this, "two-key-confirmed");
  }

  /**
   * The moment of release: a flash and shockwaves on their own layer, one
   * heavy haptic and a low thud. Nothing here waits for anything: the
   * confirmation event is fired right after, and the layer outlives the
   * dialog and removes itself.
   */
  private _celebrate(): void {
    if (this._feedback) {
      forwardHaptic(this, "heavy");
      playActionCue("impact");
    }
    const profile = this._profile;
    const core = this._coreEl?.getBoundingClientRect();
    if (!core || (!profile.flash && !profile.shockwave)) {
      return;
    }
    const red = getComputedStyle(this).getPropertyValue("--tk-red").trim();
    playConfirmEffect({
      origin: { x: core.left + core.width / 2, y: core.top + core.height / 2 },
      ringColor: red || "#ff5a46",
      lightColor: "#ffffff",
      profile,
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      --tk-amber: var(--warning-color, #f2c744);
      --tk-amber-ink: color-mix(
        in srgb,
        var(--tk-amber) 55%,
        var(--primary-text-color)
      );
      --tk-orange: color-mix(
        in srgb,
        var(--warning-color, #ffa600) 55%,
        var(--error-color, #db4437)
      );
      --tk-red: var(--error-color, #db4437);
      --tk-grey: var(--disabled-color, #8c9199);
      --tk-surface: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
      --tk-ink: var(--primary-text-color);
      --tk-ink-2: var(--secondary-text-color);
      --tk-edge: var(--ha-color-outline, var(--outline-color, #8c9199));
      --tk-thumb: var(--text-primary-color, #fff);
      display: block;
      margin-top: calc(var(--ha-space-4) - var(--ha-space-2));
      margin-inline: calc(var(--ha-space-2) * -1);
      padding: var(--ha-space-2);
      /* The glow and the vignette may reach a little past the box, never into
         the dialog's scroll area. */
      overflow: clip;
      overflow-clip-margin: var(--ha-space-4);
    }
    .board {
      position: relative;
      isolation: isolate;
      container-type: inline-size;
      --tk-core: var(--tk-grey);
      --tk-gain: 1;
      --tk-hot: calc(var(--tk-level, 0) * var(--tk-gain));
      --tk-spin-one: max(1.2s, calc(18s - var(--tk-hot) * 16.8s));
      --tk-spin-two: max(1.8s, calc(26s - var(--tk-hot) * 24.2s));
      --tk-pulse: max(0.6s, calc(2.2s - var(--tk-hot) * 1.6s));
      --tk-march: max(0.25s, calc(1.6s - var(--tk-hot) * 1.35s));
      --tk-scan: max(1.4s, calc(7s - var(--tk-hot) * 5.6s));
      --tk-shake: max(0.12s, calc(0.5s - var(--tk-hot) * 0.38s));
      /* Two dips per cycle: never faster than three a second. */
      --tk-flicker: max(0.7s, calc(1.2s - var(--tk-hot) * 0.5s));
    }
    .drama-calm {
      --tk-gain: 0.5;
    }
    .drama-standard {
      --tk-gain: 1;
    }
    .drama-dramatic {
      --tk-gain: 1.4;
    }
    .drama-still {
      --tk-gain: 0;
    }
    .stage-keyed,
    .stage-armed {
      --tk-core: var(--tk-amber);
    }
    .stage-warm {
      --tk-core: var(--tk-orange);
    }
    .stage-hot {
      --tk-core: var(--tk-red);
    }

    /* The effects behind the content: glow, vignette, scan line. */
    .fx {
      position: absolute;
      inset: calc(var(--ha-space-4) * -1);
      overflow: hidden;
      /* The same corners as the dialog surface the board sits in. */
      border-radius: var(
        --ha-dialog-border-radius,
        var(--ha-border-radius-4xl)
      );
      pointer-events: none;
      z-index: 0;
      /* Every layer inside ends in a colour that is not clear at the side of
         this box (the vignette is at full strength there), and the box ends
         inside the dialog, so it would show as a straight edge. The mask fades
         the whole layer to nothing on all four sides before its own edge. */
      -webkit-mask-image:
        linear-gradient(to right, transparent, #000 22%, #000 78%, transparent),
        linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
      -webkit-mask-composite: source-in;
      mask-image:
        linear-gradient(to right, transparent, #000 22%, #000 78%, transparent),
        linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
      mask-composite: intersect;
    }
    .glow {
      position: absolute;
      inset: 0;
      /* closest-side ends the fade at the nearest edge of the layer, so it is
         fully clear before it reaches any side and shows no hard edge. */
      background: radial-gradient(
        ellipse closest-side at 50% 44%,
        color-mix(in srgb, var(--tk-red) 45%, transparent) 0%,
        transparent 100%
      );
      opacity: min(1, calc(var(--tk-hot) * 0.9));
    }
    .vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        ellipse at center,
        transparent 45%,
        color-mix(in srgb, var(--tk-red) 55%, transparent) 100%
      );
      opacity: min(1, calc(var(--tk-hot) * 1.1));
      transform: scale(max(1, calc(1.5 - var(--tk-hot) * 0.45)));
    }
    .scan {
      position: absolute;
      inset: 0;
      overflow: hidden;
      opacity: 0;
    }
    .scan::before {
      content: "";
      position: absolute;
      inset-inline: 0;
      top: 0;
      height: 25%;
      background: linear-gradient(
        transparent,
        color-mix(in srgb, var(--tk-ink) 9%, transparent),
        transparent
      );
    }
    .armed.scanning .scan {
      opacity: 1;
    }
    .armed.scanning .scan::before {
      animation: tk-scan var(--tk-scan) linear infinite;
      will-change: transform;
    }

    .stage {
      position: relative;
      z-index: 1;
    }
    .shake .stage {
      animation: tk-shake var(--tk-shake) linear infinite;
      will-change: transform;
    }

    .head {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-4);
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 34px;
      padding: 0 var(--ha-space-4);
      border-radius: 17px;
      background: var(
        --ha-color-error-container,
        color-mix(in srgb, var(--tk-red) 22%, var(--tk-surface))
      );
      color: var(--ha-color-on-error-container, var(--tk-ink));
      font-size: var(--ha-font-size-s);
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      --mdc-icon-size: 18px;
    }
    .flicker .tag {
      animation: tk-flicker var(--tk-flicker) linear infinite;
    }
    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      margin: 0;
      min-height: 1.75em;
      text-align: center;
      font-size: var(--ha-font-size-l, 1.125rem);
      font-weight: 600;
      color: var(--tk-ink);
    }
    .status::before {
      content: "";
      flex: none;
      width: 0.6em;
      height: 0.6em;
      border-radius: 50%;
      background: var(--tk-core);
    }

    .deck {
      --tk-core-size: clamp(150px, 42cqi, 240px);
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .key {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      min-width: 0;
      min-height: 190px;
      padding: var(--ha-space-4) var(--ha-space-3);
      border: 3px solid var(--tk-ring, var(--tk-edge));
      border-radius: clamp(24px, 8cqi, 44px);
      background: var(--tk-surface);
      color: var(--tk-ink);
      font: inherit;
      text-align: center;
      overflow-wrap: anywhere;
      cursor: pointer;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      transition:
        background-color 0.25s,
        border-color 0.25s,
        transform 0.25s;
    }
    .key[data-key="one"] {
      grid-column: 1;
    }
    .key[data-key="two"] {
      grid-column: 3;
    }
    .key strong {
      font-size: var(--ha-font-size-m);
      font-weight: 800;
    }
    .caption {
      font-size: var(--ha-font-size-s);
      font-weight: 500;
      color: var(--tk-ink-2);
    }
    /* The glow of a turned key is its own layer, so only opacity changes. */
    .key::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: 0 0 44px 0
        color-mix(in srgb, var(--tk-amber) 45%, transparent);
      opacity: 0;
      transition: opacity 0.25s;
      pointer-events: none;
    }
    .key.turned {
      --tk-ring: var(--tk-amber-ink);
      background: color-mix(in srgb, var(--tk-amber) 18%, var(--tk-surface));
      transform: translateY(-6px);
      animation: tk-clunk 0.3s ease-out;
    }
    .key.turned::after {
      opacity: 1;
    }
    .key.turned .caption {
      color: var(--tk-ink);
    }
    .key:focus-visible,
    .slide:focus-within {
      outline: 3px solid var(--primary-color);
      outline-offset: 4px;
    }
    .key[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    .face {
      display: grid;
      place-items: center;
      width: clamp(64px, 22cqi, 112px);
      aspect-ratio: 1;
      border-radius: 50%;
      border: 4px solid var(--tk-ring, var(--tk-edge));
      background: var(--card-background-color, var(--primary-background-color));
      transition: border-color 0.25s;
    }
    .glyph {
      width: 64%;
      height: auto;
      color: var(--tk-ink-2);
      transition:
        transform 0.55s cubic-bezier(0.2, 1.6, 0.3, 1),
        color 0.25s;
    }
    .key.turned .glyph {
      transform: rotate(90deg);
      color: var(--tk-amber-ink);
    }

    .core {
      position: relative;
      z-index: 0;
      grid-column: 2;
      /* Between the keys on the same row, not on a row of its own. */
      grid-row: 1;
      width: var(--tk-core-size);
      aspect-ratio: 1;
      color: var(--tk-core);
    }
    .pulse {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 3px solid currentColor;
      opacity: 0;
    }
    .armed.spin .pulse {
      animation: tk-pulse var(--tk-pulse) ease-out infinite;
      will-change: transform, opacity;
    }
    .armed.spin .pulse-two {
      animation-delay: calc(var(--tk-pulse) / -2);
    }
    .ring,
    .gauge {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .ring circle {
      fill: none;
      stroke: currentColor;
    }
    .ring-one circle {
      stroke-width: 2;
      opacity: 0.7;
    }
    .ring-two circle {
      stroke-width: 3;
      opacity: 0.55;
    }
    .spin .ring-one {
      animation: tk-spin var(--tk-spin-one) linear infinite;
      will-change: transform;
    }
    .spin .ring-two {
      animation: tk-spin-back var(--tk-spin-two) linear infinite;
      will-change: transform;
    }
    .gauge {
      transform: rotate(-90deg);
    }
    .gauge circle {
      fill: none;
      stroke-width: 10;
    }
    .gauge-track {
      stroke: var(--divider-color, var(--tk-edge));
    }
    .gauge-arc {
      stroke: currentColor;
      stroke-linecap: round;
      stroke-dasharray: calc(var(--tk-level, 0) * 239px) 239px;
      /* A round cap would draw a dot at zero length. */
      opacity: min(1, calc(var(--tk-level, 0) * 1000));
    }
    .readout {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
    }
    .numeral {
      transform: scale(calc(1 + var(--tk-hot) * 0.22));
      transition: transform 0.12s;
    }
    .pct {
      font-family: var(--ha-font-family-code, ui-monospace, monospace);
      font-weight: 700;
      color: var(--tk-ink);
      font-variant-numeric: tabular-nums;
    }
    .pct-core {
      font-size: calc(var(--tk-core-size) * 0.21);
      line-height: 1;
    }
    .core-label {
      margin-top: var(--ha-space-1);
      font-size: max(11px, calc(var(--tk-core-size) * 0.05));
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--tk-ink);
    }

    .slide-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--ha-space-3);
      margin: var(--ha-space-5, 20px) 0 var(--ha-space-2);
    }
    .slide-label {
      font-size: var(--ha-font-size-s);
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--tk-ink);
    }
    .pct-label {
      font-size: var(--ha-font-size-m);
    }
    .slide {
      position: relative;
      box-sizing: border-box;
      height: 72px;
      border-radius: 28px;
      border: 2px solid var(--tk-core);
      background: var(--tk-surface);
      transition: border-color 0.2s;
    }
    /* The filled part is clipped, not resized: it ends at the middle of the
       thumb, and only the stripes inside it move. */
    .fill {
      position: absolute;
      inset: 0;
      border-radius: 26px;
      overflow: hidden;
      background: var(--tk-red);
      clip-path: inset(
        0 calc(100% - 34px - var(--tk-level, 0) * (100% - 68px)) 0 0 round 26px
      );
    }
    .fill:dir(rtl) {
      clip-path: inset(
        0 0 0 calc(100% - 34px - var(--tk-level, 0) * (100% - 68px)) round 26px
      );
    }
    .stripes {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      width: calc(100% + 48px);
      background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.16) 25%,
          transparent 25%,
          transparent 50%,
          rgba(255, 255, 255, 0.16) 50%,
          rgba(255, 255, 255, 0.16) 75%,
          transparent 75%
        )
        0 0 / 48px 48px;
    }
    .armed.spin .stripes {
      animation: tk-march var(--tk-march) linear infinite;
      will-change: transform;
    }
    .hint {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--ha-space-2);
      padding-inline: 76px var(--ha-space-4);
      pointer-events: none;
      color: var(--tk-ink-2);
      --mdc-icon-size: 28px;
    }
    .hint:dir(rtl) ha-svg-icon {
      transform: scaleX(-1);
    }
    .hint-text {
      padding: 2px var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill, 999px);
      background: color-mix(in srgb, var(--tk-surface) 88%, transparent);
      color: var(--tk-ink);
      font-size: var(--ha-font-size-s);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-align: center;
      text-transform: uppercase;
    }
    ha-slider {
      position: absolute;
      inset-block: 0;
      inset-inline: 34px;
      display: block;
      width: calc(100% - 68px);
      min-width: 0;
      margin: 0;
      --track-size: 68px;
      --thumb-width: 68px;
      --thumb-height: 68px;
      --ha-slider-thumb-color: var(--tk-thumb);
      --ha-slider-track-color: transparent;
      --ha-slider-indicator-color: transparent;
    }
    ha-slider::part(thumb) {
      border-radius: 24px;
      box-shadow:
        0 0 0 6px color-mix(in srgb, var(--tk-red) 35%, transparent),
        0 0 36px 8px color-mix(in srgb, var(--tk-red) 80%, transparent);
    }
    ha-slider[disabled] {
      --ha-slider-thumb-color: color-mix(
        in srgb,
        var(--tk-ink) 30%,
        var(--tk-surface)
      );
    }
    ha-slider[disabled]::part(thumb) {
      box-shadow: none;
    }
    .note {
      margin: var(--ha-space-3) 0 0;
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      color: var(--tk-ink-2);
      text-align: center;
    }

    /* The phone form: type the word, then hold the button until it fills. */
    .phone-word {
      display: block;
      width: 100%;
      letter-spacing: 0.04em;
    }
    .hold {
      position: relative;
      display: block;
      width: 100%;
      min-height: 60px;
      margin-top: var(--ha-space-3);
      padding: 0;
      border: none;
      border-radius: var(--ha-border-radius-pill);
      overflow: hidden;
      background: color-mix(
        in srgb,
        var(--error-color) 35%,
        var(--primary-background-color)
      );
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .hold.ready {
      background: var(--error-color);
      color: var(--text-primary-color, #fff);
    }
    .hold[disabled] {
      cursor: default;
    }
    .hold:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .hold-fill {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      background: rgba(0, 0, 0, 0.28);
      pointer-events: none;
    }
    .hold-text {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 60px;
    }

    @keyframes tk-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes tk-spin-back {
      to {
        transform: rotate(-360deg);
      }
    }
    @keyframes tk-pulse {
      0% {
        transform: scale(0.72);
        opacity: 0.9;
      }
      100% {
        transform: scale(1.45);
        opacity: 0;
      }
    }
    @keyframes tk-shake {
      0%,
      100% {
        transform: translate(0, 0) rotate(0);
      }
      20% {
        transform: translate(-3px, 2px) rotate(-0.4deg);
      }
      40% {
        transform: translate(3px, -2px) rotate(0.4deg);
      }
      60% {
        transform: translate(-2px, -3px) rotate(-0.3deg);
      }
      80% {
        transform: translate(2px, 3px) rotate(0.3deg);
      }
    }
    @keyframes tk-flicker {
      0%,
      100% {
        opacity: 1;
      }
      45% {
        opacity: 0.55;
      }
      50% {
        opacity: 1;
      }
      70% {
        opacity: 0.75;
      }
    }
    @keyframes tk-scan {
      0% {
        transform: translateY(-100%);
      }
      100% {
        transform: translateY(400%);
      }
    }
    @keyframes tk-march {
      to {
        transform: translateX(-48px);
      }
    }
    @keyframes tk-clunk {
      0% {
        transform: translateY(0) scale(1);
      }
      40% {
        transform: translateY(-6px) scale(0.96);
      }
      100% {
        transform: translateY(-6px) scale(1);
      }
    }

    /* Nothing moves: the keys turn at once, and the gauge, the numbers, the
       colour steps and the words still show everything. */
    .drama-still *,
    .drama-still *::before,
    .drama-still *::after {
      animation: none !important;
      transition: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .board *,
      .board *::before,
      .board *::after {
        animation: none !important;
        transition: none !important;
      }
    }

    /* The narrowest supported width is 320 px: the core moves above the keys,
       and the keys sit side by side below it. */
    @container (max-width: 460px) {
      .deck {
        --tk-core-size: clamp(140px, 56cqi, 200px);
      }
      .core {
        grid-column: 1 / -1;
        grid-row: 1;
        justify-self: center;
      }
      .key {
        grid-row: 2;
        min-height: 150px;
        padding: var(--ha-space-3) var(--ha-space-2);
      }
      .key[data-key="one"] {
        grid-column: 1;
      }
      .key[data-key="two"] {
        grid-column: 2;
      }
      .deck {
        grid-template-columns: 1fr 1fr;
        gap: var(--ha-space-2);
      }
      .key strong {
        font-size: var(--ha-font-size-s);
      }
      .caption,
      .note {
        font-size: var(--ha-font-size-xs, 0.75rem);
      }
      .hint {
        padding-inline: 72px var(--ha-space-2);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-two-key-confirm": HaTwoKeyConfirm;
  }
}
