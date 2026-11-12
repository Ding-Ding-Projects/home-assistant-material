import { mdiClose } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  DIM_SUM_VISIBLE_MS,
  decideDimSum,
  drawDimSumRandom,
  setDimSumRandomSource,
  takeLaunchDraw,
} from "../../common/dim-sum/dim-sum-draw";
import { readDimSumState } from "../../common/dim-sum/dim-sum-state";
import { spansForMode } from "../../common/language-mode/bilingual-text";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  fillPlaceholders,
  joinForMode,
  yueString,
} from "../../common/language-mode/language-mode";
import { playfulText } from "../../common/playful/playful-text";
import { phoneBarHeight } from "../../common/preferences/attention-modes";
import { playActionCue } from "../../common/sound/action-sound";
import type { DimSumDish } from "../../data/dim_sum";
import { fetchRandomDish } from "../../data/dim_sum";
import type { HomeAssistant } from "../../types";
import "../ha-icon-button";

const POLL_MS = 500;
const FADE_MS = 160;

/** Separates the two languages; the text lines keep it as a line break. */
const LINE_BREAK = "\n";

declare global {
  interface HTMLElementTagNameMap {
    "ha-dim-sum-surprise": HaDimSumSurprise;
  }
}

/**
 * The dim sum surprise: one small card that may drop by once per launch.
 *
 * It never takes focus, never blocks anything and is announced once through
 * a polite live region. See `common/dim-sum/dim-sum-draw.ts` for when it may
 * appear.
 */
@customElement("ha-dim-sum-surprise")
export class HaDimSumSurprise extends LitElement {
  // The element only reads `hass` when it needs it, so a new `hass` never
  // renders it again.
  @property({ attribute: false, hasChanged: () => false })
  public hass!: HomeAssistant;

  @state() private _dish?: DimSumDish;

  @state() private _announcement = "";

  @state() private _leaving = false;

  @state() private _still = false;

  @state() private _paused = false;

  @query(".card") private _card?: HTMLElement;

  private _lang = new LanguageModeController(this);

  private _pollTimer?: number;

  private _dismissTimer?: number;

  private _remainingMs = DIM_SUM_VISIBLE_MS;

  private _timerStartedAt = 0;

  private _roll?: number;

  private _launchStartedAt = 0;

  public connectedCallback() {
    super.connectedCallback();
    if (!takeLaunchDraw()) {
      return;
    }
    if (__DEV__) {
      const forced = (window as unknown as { __dimSumRandom?: unknown })
        .__dimSumRandom;
      if (typeof forced === "number") {
        setDimSumRandomSource(() => forced);
      }
    }
    // One fresh draw for this launch, kept while the shell settles.
    this._roll = drawDimSumRandom();
    this._launchStartedAt = Date.now();
    this._pollTimer = window.setInterval(this._poll, POLL_MS);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._pollTimer);
    window.clearTimeout(this._dismissTimer);
  }

  private _poll = () => {
    if (!this.hass || this._roll === undefined) {
      return;
    }
    const waited = Date.now() - this._launchStartedAt;
    const decision = decideDimSum(
      this._roll,
      readDimSumState(this.hass),
      waited
    );
    if (decision === "wait") {
      return;
    }
    window.clearInterval(this._pollTimer);
    if (decision === "show") {
      this._fetch();
    }
  };

  private async _fetch() {
    const dish = await fetchRandomDish(this.hass);
    if (!dish || !this.isConnected) {
      return;
    }
    this._still =
      document.documentElement.hasAttribute("data-a11y-reduce-motion") ||
      document.documentElement.hasAttribute("data-low-stimulation") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._dish = dish;
    this._remainingMs = DIM_SUM_VISIBLE_MS;
    this._announcement = "";
    await this.updateComplete;
    this._place();
    // The live region is in the page before its text is set.
    window.setTimeout(() => {
      if (this._dish === dish) {
        this._announcement = this._announceText(dish);
      }
    }, 100);
    playActionCue("toggle-on");
    this._startTimer();
  }

  private _place() {
    const card = this._card;
    if (!card) {
      return;
    }
    card.style.setProperty("--dim-sum-phone-bar", phoneBarHeight());
    try {
      if (!card.matches(":popover-open")) {
        card.showPopover();
      }
    } catch (_err) {
      // The card stays in the page when popovers are not supported.
    }
  }

  private _startTimer() {
    window.clearTimeout(this._dismissTimer);
    this._timerStartedAt = Date.now();
    this._dismissTimer = window.setTimeout(
      () => this._dismiss(),
      this._remainingMs
    );
  }

  private _pause = () => {
    if (!this._dish || this._paused) {
      return;
    }
    window.clearTimeout(this._dismissTimer);
    this._remainingMs = Math.max(
      1,
      this._remainingMs - (Date.now() - this._timerStartedAt)
    );
    this._paused = true;
  };

  private _resume = () => {
    if (!this._dish || !this._paused) {
      return;
    }
    const card = this._card;
    if (card?.matches(":hover") || card?.matches(":focus-within")) {
      return;
    }
    this._paused = false;
    this._startTimer();
  };

  private _dismiss = () => {
    window.clearTimeout(this._dismissTimer);
    if (!this._dish || this._leaving) {
      return;
    }
    const finish = () => {
      try {
        if (this._card?.matches(":popover-open")) {
          this._card.hidePopover();
        }
      } catch (_err) {
        // Nothing to hide.
      }
      this._dish = undefined;
      this._leaving = false;
      this._paused = false;
      this._announcement = "";
    };
    if (this._still) {
      finish();
      return;
    }
    this._leaving = true;
    window.setTimeout(finish, FADE_MS);
  };

  private _imageFailed = () => {
    // A picture that cannot be shown is not worth a card.
    this._dismiss();
  };

  private _names(dish: DimSumDish) {
    return { english: dish.name_en, cantonese: dish.name_yue };
  }

  /** A text with the dish name in each language, joined for the chosen mode. */
  private _dishText(key: string, dish: DimSumDish): string {
    const yue = yueString(key);
    return joinForMode(
      {
        english: this.hass.localize(key as never, { name: dish.name_en }),
        cantonese:
          yue === undefined
            ? undefined
            : fillPlaceholders(yue, { name: dish.name_yue }),
      },
      this._lang.mode,
      " / "
    );
  }

  private _announceText(dish: DimSumDish): string {
    return this._dishText("ui.dim_sum.announce", dish);
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (this._dish && changed.has("_dish")) {
      this._place();
    }
  }

  protected render() {
    const dish = this._dish;
    if (!dish) {
      return nothing;
    }
    const names = this._names(dish);
    const greeting = playfulText(
      this.hass.localize,
      "ui.dim_sum.greeting",
      this._lang.mode,
      undefined,
      undefined,
      LINE_BREAK
    );
    return html`
      <div
        class=${classMap({
          card: true,
          still: this._still,
          leaving: this._leaving,
          paused: this._paused,
        })}
        popover="manual"
        role="group"
        aria-label=${this._lang.text(this.hass.localize, "ui.dim_sum.card_label")}
        @mouseenter=${this._pause}
        @mouseleave=${this._resume}
        @focusin=${this._pause}
        @focusout=${this._resume}
      >
        <img
          class="photo"
          src=${this.hass.hassUrl(dish.picture_url)}
          alt=${this._dishText("ui.dim_sum.photo_alt", dish)}
          @error=${this._imageFailed}
        />
        <div class="body">
          <div class="text">
            <p class="greeting">${greeting}</p>
            <p class="name">
              ${spansForMode(names, this._lang.mode).map(
                (span) =>
                  html`<span class="line" lang=${span.lang}>${span.text}</span>`
              )}
            </p>
          </div>
          <ha-icon-button
            .path=${mdiClose}
            .label=${this._lang.text(this.hass.localize, "ui.dim_sum.close")}
            @click=${this._dismiss}
          ></ha-icon-button>
        </div>
        <div class="bar" aria-hidden="true"><div class="fill"></div></div>
      </div>
      <span class="sr-only" role="status" aria-live="polite"
        >${this._announcement}</span
      >
    `;
  }

  static styles = css`
    :host {
      display: contents;
    }
    .card {
      position: fixed;
      inset: auto;
      inset-inline-end: 16px;
      inset-block-end: calc(16px + var(--dim-sum-phone-bar, 0px));
      margin: 0;
      padding: 0;
      border: 0;
      overflow: hidden;
      width: min(320px, calc(100vw - 32px));
      box-sizing: border-box;
      border-radius: 28px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #000);
      box-shadow: var(--ha-box-shadow-l, 0 6px 16px rgba(0, 0, 0, 0.3));
      animation: arrive 220ms ease-out;
      opacity: 1;
      transition: opacity 150ms linear;
    }
    .card.leaving {
      opacity: 0;
    }
    .card.still {
      animation: none;
      transition: none;
    }
    @keyframes arrive {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .card {
        animation: none;
        transition: none;
      }
    }
    .photo {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: var(--secondary-background-color, #eee);
    }
    .body {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 8px 8px 20px;
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .name .line {
      display: block;
    }
    .greeting {
      white-space: pre-line;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.875rem);
    }
    .name {
      font-size: var(--ha-font-size-l, 1.125rem);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    ha-icon-button {
      --ha-icon-button-size: 44px;
      flex: none;
    }
    .bar {
      height: 4px;
      margin: 0 20px 16px;
      border-radius: 2px;
      background: var(--divider-color, #ddd);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      width: 100%;
      transform-origin: left center;
      background: var(--primary-color, #03a9f4);
      animation-name: drain;
      animation-duration: 6s;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    .card.paused .fill {
      animation-play-state: paused;
    }
    .card.still .bar,
    .card.still .fill {
      animation: none;
    }
    .card.still .fill {
      transform: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .fill {
        animation: none;
      }
    }
    @keyframes drain {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;
}
