import type { TemplateResult } from "lit";
import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { playActionCue } from "../../../../../common/sound/action-sound";
import type { HomeAssistant } from "../../../../../types";
import { GAME_PREFIX, lessMotion } from "./game-events";
import { COOKIE_TARGET, cookieDone, pressCookie } from "./game-logic";
import { gameCardStyles } from "./game-styles";

/** Where crumbs fall on the baking paper, in percent, used in turn. */
const CRUMB_SPOTS: [number, number][] = [
  [22, 70],
  [78, 30],
  [74, 74],
  [16, 28],
  [86, 56],
  [30, 84],
  [64, 16],
  [12, 50],
];

const CRUMBS_KEPT = 6;

/**
 * A baked cookie on baking paper in a steel tray. Each press adds exactly one
 * cookie: held keys do not repeat, so it takes 100 separate presses.
 */
@customElement("ha-game-cookie")
export class HaGameCookie extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _count = 0;

  @state() private _announce = "";

  private _lang = new LanguageModeController(this);

  private _won = false;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${GAME_PREFIX}.${key}`, values);
  }

  protected render(): TemplateResult {
    const done = cookieDone(this._count);
    const crumbs = Array.from(
      { length: Math.min(this._count, CRUMBS_KEPT) },
      (_, i) => this._count - i
    );
    return html`<div class="gcard">
      <div class="ghead">
        <span class="gtitle">${this._t("cookie_title")}</span>
        <span class="score"
          >${this._t("cookie_count", { count: this._count })}</span
        >
      </div>
      <div class=${classMap({ tray: true, still: lessMotion() })}>
        <span class="paper"></span>
        ${repeat(
          crumbs,
          (n) => n,
          (n) => {
            const [left, top] = CRUMB_SPOTS[n % CRUMB_SPOTS.length];
            return html`<span
              class="crumb"
              style=${styleMap({ left: `${left}%`, top: `${top}%` })}
            ></span>`;
          }
        )}
        <button
          class=${classMap({
            cookie: true,
            "dent-a": this._count > 0 && this._count % 2 === 0,
            "dent-b": this._count % 2 === 1,
          })}
          aria-label=${
            done
              ? this._t("cookie_done")
              : this._t("cookie_press", { count: this._count })
          }
          .disabled=${done}
          @keydown=${this._keydown}
          @click=${this._press}
        >
          <s class="c1"></s><s class="c2"></s><s class="c3"></s
          ><s class="c4"></s><s class="c5"></s><s class="c6"></s
          ><em class="k1"></em><em class="k2"></em><em class="k3"></em>
        </button>
        ${repeat(
          this._count ? [this._count] : [],
          (n) => n,
          () => html`<span class="plus" aria-hidden="true">+1</span>`
        )}
      </div>
      <div class="gfoot">
        <div
          class="bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax=${COOKIE_TARGET}
          aria-valuenow=${this._count}
          aria-label=${this._t("cookie_title")}
        >
          <span
            style=${styleMap({ width: `${(this._count / COOKIE_TARGET) * 100}%` })}
          ></span>
        </div>
        <p class="status" role="status" aria-live="polite">${this._announce}</p>
        <p class="hint">${this._t("cookie_hint")}</p>
      </div>
    </div>`;
  }

  // A held key would click again and again: one press, one cookie.
  private _keydown(ev: KeyboardEvent): void {
    if (ev.repeat && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
    }
  }

  private _press = () => {
    if (cookieDone(this._count)) {
      return;
    }
    this._count = pressCookie(this._count);
    playActionCue("charge", 0.8 + (this._count / COOKIE_TARGET) * 0.6);
    // Every tenth cookie is read out, so a screen reader is not flooded.
    if (cookieDone(this._count)) {
      this._announce = this._t("cookie_done");
      if (!this._won) {
        this._won = true;
        playActionCue("success");
        fireEvent(this, "game-won");
      }
    } else if (this._count % 10 === 0) {
      this._announce = this._t("cookie_count", { count: this._count });
    }
  };

  static styles = [
    gameCardStyles,
    css`
      .tray {
        margin: 0 var(--ha-space-3);
        height: 190px;
        border-radius: 18px;
        background: linear-gradient(
          160deg,
          #c9ced6 0%,
          #9aa1ac 50%,
          #757c88 100%
        );
        box-shadow:
          inset 0 2px 0 rgba(255, 255, 255, 0.6),
          inset 0 0 0 6px #868d99,
          inset 0 -12px 24px rgba(0, 0, 0, 0.25);
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
      }
      .paper {
        position: absolute;
        inset: 14px;
        border-radius: 10px;
        background: linear-gradient(#f4ebda, #e6d9c0);
        box-shadow: inset 0 0 0 1px #d8c9ac;
      }
      .cookie {
        position: relative;
        width: 132px;
        height: 128px;
        padding: 0;
        border: none;
        cursor: pointer;
        border-radius: 48% 52% 50% 50% / 52% 48% 52% 48%;
        background: radial-gradient(
          circle at 36% 30%,
          #ebc489 0%,
          #d39f58 42%,
          #b07a35 78%,
          #8e5e24 100%
        );
        box-shadow:
          inset 0 -8px 12px rgba(90, 50, 10, 0.45),
          inset 0 4px 6px rgba(255, 235, 190, 0.5),
          0 8px 10px rgba(60, 40, 10, 0.4);
      }
      .cookie[disabled] {
        cursor: default;
      }
      .cookie.dent-a {
        animation: dent-a 180ms ease-out;
      }
      .cookie.dent-b {
        animation: dent-b 180ms ease-out;
      }
      @keyframes dent-a {
        40% {
          transform: scale(0.94, 0.9);
          box-shadow:
            inset 0 -3px 8px rgba(90, 50, 10, 0.55),
            inset 0 6px 10px rgba(90, 50, 10, 0.35),
            0 3px 4px rgba(60, 40, 10, 0.4);
        }
      }
      @keyframes dent-b {
        40% {
          transform: scale(0.94, 0.9);
          box-shadow:
            inset 0 -3px 8px rgba(90, 50, 10, 0.55),
            inset 0 6px 10px rgba(90, 50, 10, 0.35),
            0 3px 4px rgba(60, 40, 10, 0.4);
        }
      }
      .cookie s {
        position: absolute;
        border-radius: 45% 55% 50% 50%;
        background: radial-gradient(
          circle at 35% 30%,
          #7a4a2c 0%,
          #4a2a16 60%,
          #2c170b 100%
        );
        box-shadow:
          inset 1px 1px 0 rgba(255, 220, 180, 0.25),
          0 1px 1px rgba(0, 0, 0, 0.3);
      }
      .c1 {
        left: 26px;
        top: 26px;
        width: 22px;
        height: 18px;
      }
      .c2 {
        left: 72px;
        top: 18px;
        width: 18px;
        height: 16px;
      }
      .c3 {
        left: 92px;
        top: 56px;
        width: 24px;
        height: 20px;
      }
      .c4 {
        left: 46px;
        top: 62px;
        width: 20px;
        height: 18px;
      }
      .c5 {
        left: 20px;
        top: 84px;
        width: 16px;
        height: 14px;
      }
      .c6 {
        left: 68px;
        top: 94px;
        width: 22px;
        height: 16px;
      }
      .cookie em {
        position: absolute;
        height: 2px;
        border-radius: 2px;
        background: rgba(120, 78, 30, 0.55);
      }
      .k1 {
        left: 54px;
        top: 46px;
        width: 20px;
        transform: rotate(18deg);
      }
      .k2 {
        left: 34px;
        top: 106px;
        width: 16px;
        transform: rotate(-24deg);
      }
      .k3 {
        left: 96px;
        top: 38px;
        width: 14px;
        transform: rotate(52deg);
      }
      .crumb {
        position: absolute;
        width: 6px;
        height: 5px;
        border-radius: 50%;
        background: #c08a45;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
        animation: crumb 300ms ease-in both;
      }
      @keyframes crumb {
        from {
          transform: translateY(-14px);
          opacity: 0;
        }
      }
      .plus {
        position: absolute;
        left: calc(50% + 46px);
        top: 30px;
        font-weight: 800;
        color: #5a3a12;
        font-size: 18px;
        pointer-events: none;
        animation: lift 600ms ease-out both;
      }
      @keyframes lift {
        from {
          transform: translateY(10px);
          opacity: 1;
        }
        to {
          transform: translateY(-16px);
          opacity: 0;
        }
      }
      .bar {
        height: 8px;
        border-radius: 4px;
        background: var(--divider-color);
        overflow: hidden;
      }
      .bar span {
        display: block;
        height: 100%;
        background: #d39f58;
        border-radius: 4px;
      }
      .still .cookie,
      .still .crumb {
        animation: none;
      }
      .still .plus {
        animation: none;
        opacity: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .cookie,
        .crumb {
          animation: none;
        }
        .plus {
          animation: none;
          opacity: 0;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-game-cookie": HaGameCookie;
  }
}
