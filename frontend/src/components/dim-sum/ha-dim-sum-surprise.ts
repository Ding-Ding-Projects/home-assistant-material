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
import { getTopOpenDialogTag } from "../../dialogs/make-dialog-manager";
import {
  isTypingInField,
  readDimSumState,
} from "../../common/dim-sum/dim-sum-state";
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
import type { ClearanceBox } from "./dim-sum-clearance";
import { dimSumClearance } from "./dim-sum-clearance";

const POLL_MS = 500;
const FADE_MS = 160;
/** How long a pill waits for a dialog to close or typing to stop. */
const STALE_MS = 60000;
const RESERVED_PROPERTY = "--ha-dim-sum-reserved-height";

/** Raises the card above the floating controls it would otherwise cover. */
const CLEAR_PROPERTY = "--dim-sum-clear";
/** How far apart the points are where the card looks for floating controls. */
const SAMPLE_STEP_PX = 16;
/** A floating control that animates in is measured once more after this. */
const SETTLE_MS = 400;

/** Separates the two languages; the text lines keep it as a line break. */
const LINE_BREAK = "\n";

/** Every element at a point, including those inside shadow roots. */
const collectElementsAt = (
  root: Document | ShadowRoot,
  x: number,
  y: number,
  out: Set<Element>
): void => {
  for (const element of root.elementsFromPoint(x, y)) {
    if (out.has(element)) {
      continue;
    }
    out.add(element);
    const shadow = element.shadowRoot;
    if (shadow && shadow !== root) {
      collectElementsAt(shadow, x, y, out);
    }
  }
};

/** The parent of an element in the rendered tree, across shadow roots. */
const composedParent = (element: Element): Element | null => {
  if (element.assignedSlot) {
    return element.assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

/** The closest element, from this one upwards, that is fixed or sticky. */
const nearestFixedAncestor = (
  element: Element,
  cache: Map<Element, Element | null>
): Element | null => {
  const path: Element[] = [];
  let current: Element | null = element;
  let found: Element | null = null;
  while (current && current !== document.body) {
    if (cache.has(current)) {
      found = cache.get(current) ?? null;
      break;
    }
    path.push(current);
    const position = getComputedStyle(current).position;
    if (position === "fixed" || position === "sticky") {
      found = current;
      break;
    }
    current = composedParent(current);
  }
  for (const visited of path) {
    cache.set(visited, found);
  }
  return found;
};

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

  @state() private _expanded = false;

  @query(".card") private _card?: HTMLElement;

  private _lang = new LanguageModeController(this);

  private _pollTimer?: number;

  private _dismissTimer?: number;

  private _remainingMs = DIM_SUM_VISIBLE_MS;

  private _timerStartedAt = 0;

  private _roll?: number;

  private _launchStartedAt = 0;

  private _quietTimer?: number;

  private _settleTimer?: number;

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
    window.clearInterval(this._quietTimer);
    window.clearTimeout(this._settleTimer);
    window.removeEventListener("resize", this._handleResize);
    document.documentElement.style.removeProperty(RESERVED_PROPERTY);
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
    // Never over an open dialog and never while someone is typing: wait for
    // both to pass, and drop the card when that takes too long.
    if (!(await this._waitUntilQuiet())) {
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
    window.addEventListener("resize", this._handleResize, { passive: true });
    // A create button or tool pill that is still animating in is measured
    // again once it has settled.
    window.clearTimeout(this._settleTimer);
    this._settleTimer = window.setTimeout(this._replace, SETTLE_MS);
    // The live region is in the page before its text is set.
    window.setTimeout(() => {
      if (this._dish === dish) {
        this._announcement = this._announceText(dish);
      }
    }, 100);
    playActionCue("toggle-on");
    this._startTimer();
  }

  private _isBusy(): boolean {
    return getTopOpenDialogTag() !== undefined || isTypingInField();
  }

  private _waitUntilQuiet(): Promise<boolean> {
    if (!this._isBusy()) {
      return Promise.resolve(true);
    }
    const startedAt = Date.now();
    return new Promise((resolve) => {
      window.clearInterval(this._quietTimer);
      this._quietTimer = window.setInterval(() => {
        if (!this.isConnected || Date.now() - startedAt > STALE_MS) {
          window.clearInterval(this._quietTimer);
          resolve(false);
        } else if (!this._isBusy()) {
          window.clearInterval(this._quietTimer);
          resolve(true);
        }
      }, POLL_MS);
    });
  }

  private _expand = (ev: Event) => {
    if (this._expanded) {
      return;
    }
    const onClose = ev
      .composedPath()
      .some((el) => (el as HTMLElement).localName === "ha-icon-button");
    if (onClose) {
      return;
    }
    // Focus moving onto the close button must not open the card.
    if (ev.type === "focusin" && ev.target !== this._card) {
      return;
    }
    this._expanded = true;
  };

  private _focusIn = (ev: Event) => {
    this._pause();
    this._expand(ev);
  };

  private _focusOut = (ev: FocusEvent) => {
    this._resume();
    const next = ev.relatedTarget;
    if (!(next instanceof Node && this._card?.contains(next))) {
      this._expanded = false;
    }
  };

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
    this._clearFloatingControls();
    this._publishHeight();
  }

  /**
   * Lifts the card above every control floating over the bottom of the page
   * (the create button, the floating tool pills, a save or bulk bar), so a
   * tap meant for one of them never lands on the card.
   */
  private _clearFloatingControls() {
    const card = this._card;
    if (!card) {
      return;
    }
    card.style.removeProperty(CLEAR_PROPERTY);
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const viewportHeight = window.innerHeight;
    const base = viewportHeight - rect.bottom;
    const offset = dimSumClearance({
      base,
      cardHeight: rect.height,
      cardLeft: rect.left,
      cardRight: rect.right,
      viewportHeight,
      floating: this._floatingBoxes(rect.left, rect.right, viewportHeight),
    });
    if (offset > base) {
      card.style.setProperty(CLEAR_PROPERTY, `${Math.ceil(offset)}px`);
    }
  }

  /**
   * The boxes of the fixed or sticky controls under the card's columns in
   * the lower half of the screen, looking through every shadow root.
   */
  private _floatingBoxes(
    left: number,
    right: number,
    viewportHeight: number
  ): ClearanceBox[] {
    const columns = [left + 8, (left + right) / 2, right - 8];
    const seen = new Set<Element>();
    const fixedCache = new Map<Element, Element | null>();
    const boxes = new Map<Element, ClearanceBox>();
    const top = viewportHeight / 2;
    for (let y = viewportHeight - 2; y > top; y -= SAMPLE_STEP_PX) {
      for (const x of columns) {
        seen.clear();
        collectElementsAt(document, x, y, seen);
        for (const element of seen) {
          if (this._ownsElement(element)) {
            continue;
          }
          const floating = nearestFixedAncestor(element, fixedCache);
          if (!floating || boxes.has(floating) || this._ownsElement(floating)) {
            continue;
          }
          const box = floating.getBoundingClientRect();
          boxes.set(floating, {
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
          });
        }
      }
    }
    return [...boxes.values()];
  }

  private _ownsElement(element: Element): boolean {
    return (
      element === this ||
      element.getRootNode() === this.shadowRoot ||
      this.contains(element)
    );
  }

  private _replace = () => {
    if (this._dish) {
      this._place();
    }
  };

  // A window being resized fires many events; the card is measured again
  // once the size has settled.
  private _handleResize = () => {
    window.clearTimeout(this._settleTimer);
    this._settleTimer = window.setTimeout(this._replace, SETTLE_MS);
  };

  /** Tells the page how much room to keep clear under its last row. */
  private _publishHeight() {
    const height = this._dish && this._card ? this._card.offsetHeight + 8 : 0;
    document.documentElement.style.setProperty(
      RESERVED_PROPERTY,
      `${height}px`
    );
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
      this._expanded = false;
      window.clearTimeout(this._settleTimer);
      window.removeEventListener("resize", this._handleResize);
      document.documentElement.style.removeProperty(RESERVED_PROPERTY);
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
    if (this._dish && (changed.has("_dish") || changed.has("_expanded"))) {
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
          expanded: this._expanded,
        })}
        popover="manual"
        tabindex="0"
        role="group"
        aria-label=${this._lang.text(this.hass.localize, "ui.dim_sum.card_label")}
        @click=${this._expand}
        @mouseenter=${this._pause}
        @mouseleave=${this._resume}
        @focusin=${this._focusIn}
        @focusout=${this._focusOut}
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
      /* Bottom centre, in the strip the toasts use: above the bottom bars and
         above any toast already shown, so it never covers a row or a field. */
      inset: auto;
      inset-inline: 0;
      inset-block-end: max(
        calc(
          16px + var(--dim-sum-phone-bar, 0px) +
            var(--ha-toast-reserved-height, 0px)
        ),
        var(--dim-sum-clear, 0px)
      );
      margin: 0 auto;
      padding: 0;
      border: 0;
      overflow: hidden;
      width: min(560px, calc(100vw - 32px));
      box-sizing: border-box;
      border-radius: 28px;
      cursor: pointer;
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
    .card:not(.expanded) {
      display: flex;
      align-items: center;
      width: min(360px, calc(100vw - 32px));
      border-radius: 999px;
    }
    .card:not(.expanded) .photo {
      flex: none;
      width: 44px;
      height: 44px;
      margin-inline-start: 8px;
      aspect-ratio: 1;
      border-radius: 50%;
    }
    .card:not(.expanded) .body {
      flex: 1;
      min-width: 0;
      padding: 0 4px 0 12px;
    }
    .card:not(.expanded) .greeting,
    .card:not(.expanded) .bar {
      display: none;
    }
    .card:not(.expanded) .name {
      font-size: var(--ha-font-size-m, 1rem);
    }
    .card:not(.expanded) .name .line {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card:not(.expanded) .name .line + .line {
      display: none;
    }
    .card.expanded {
      cursor: default;
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
